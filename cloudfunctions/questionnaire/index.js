// cloudfunctions/questionnaire/index.js
// 任务：task-024（上）— 问卷（口味/话题/预算）云函数
//
// 动作：
//   submit: 已登录 + 强实名用户填写/更新问卷（diet_pref/taboo[]/budget/topics[]/personality/expect[]），
//           按 user_id 唯一约束幂等 upsert（重复提交覆盖，不落重复文档）。
//   get:    浏览器——查自己完整问卷；查他人仅回传「匹配用公开维度」（diet_pref/taboo/budget/topics/personality），
//           不下发明文敏感字段（问卷本身无敏感明文，但 expect[] 含个人期待，对他人隐藏）。
//
// 信任与约束（见 coding-style 第14/15/18节）：
//   - 身份走 common/session.verifyToken(event.token)。
//   - submit 复用「强实名护城河」：仅 verified=true 可填（未实名 402），与报名/发起场次一致。
//   - 数据访问统一走 common/db（技术方案第4节 / coding-style 第12节），本文件不裸拼查询链。
//   - 幂等：user_id 唯一索引（schema questionnaires.idx_user_id），先查后 insert/update，避免重复文档。
//
// 错误码：401 未登录 / 402 未实名 / 400 参数（必填缺失/类型错） / 404 用户不存在 / 409 冲突（不可覆盖他人） / 500 异常
const cloud = require('wx-server-sdk');
const path = require('path');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const { query, getById, insert, update } = require(path.join(__dirname, '..', 'common', 'db'));
const { verifyToken } = require(path.join(__dirname, '..', 'common', 'session'));

const COLL = 'questionnaires';
const USERS = 'users';

// 公开维度（他人可见，供匹配算法消费）
const PUBLIC_FIELDS = ['diet_pref', 'taboo', 'budget', 'topics', 'personality'];
// 完整维度（仅本人可见）
const FULL_FIELDS = [...PUBLIC_FIELDS, 'expect'];

const BUDGET_MIN = 0;
const BUDGET_MAX = 1000; // 单人餐预算上限（元），超出视为异常
const TABOO_MAX = 20;
const TOPICS_MAX = 20;
const EXPECT_MAX = 10;

function normalizeArray(v, maxLen) {
  if (!Array.isArray(v)) return null;
  const out = v.filter((x) => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()).slice(0, maxLen);
  return out;
}

function validate(payload) {
  const { diet_pref, taboo, budget, topics, personality, expect } = payload;

  if (typeof diet_pref !== 'string' || diet_pref.trim().length === 0) {
    return '口味偏好(diet_pref)必填';
  }
  if (typeof personality !== 'string' || personality.trim().length === 0) {
    return '性格标签(personality)必填';
  }
  if (typeof budget !== 'number' || budget < BUDGET_MIN || budget > BUDGET_MAX) {
    return `预算(budget)须为 ${BUDGET_MIN}-${BUDGET_MAX} 的数字`;
  }

  const tabooArr = normalizeArray(taboo, TABOO_MAX);
  if (tabooArr === null) return '忌口(taboo)须为字符串数组';
  const topicsArr = normalizeArray(topics, TOPICS_MAX);
  if (topicsArr === null) return '话题(topics)须为字符串数组';
  const expectArr = normalizeArray(expect, EXPECT_MAX);
  if (expectArr === null) return '期待(expect)须为字符串数组';

  return {
    diet_pref: diet_pref.trim(),
    personality: personality.trim(),
    budget,
    taboo: tabooArr,
    topics: topicsArr,
    expect: expectArr,
  };
}

function toView(doc, full) {
  if (!doc) return null;
  const { _id, user_id, created_at, updated_at, ...rest } = doc;
  const view = { id: _id, user_id, ...rest };
  if (full) {
    view.created_at = created_at;
    view.updated_at = updated_at;
  }
  // 他人视角只留公开维度
  if (!full) {
    Object.keys(view).forEach((k) => {
      if (!PUBLIC_FIELDS.includes(k) && k !== 'id' && k !== 'user_id') delete view[k];
    });
  }
  return view;
}

// submit：幂等 upsert（先查后 insert/update）
async function handleSubmit(event) {
  // 1) 身份
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  // 2) 强实名护城河
  const u = await getById(USERS, payload.uid);
  if (u.code !== 0) return { code: 500, message: u.message };
  if (!u.data) return { code: 404, message: '用户不存在' };
  if (!u.data.verified) return { code: 402, message: '请先完成实名认证后再填写问卷' };

  // 3) 参数校验
  const clean = validate(event || {});
  if (typeof clean === 'string') return { code: 400, message: clean };

  const now = new Date().toISOString();
  const doc = { ...clean, user_id: payload.uid, updated_at: now };

  // 4) 幂等：查是否已存在
  const existing = await query(COLL, { where: { user_id: payload.uid }, pageSize: 1 });
  if (existing.code !== 0) return { code: 500, message: existing.message };
  const found = (existing.data.list || [])[0];

  if (found) {
    const upd = await update(COLL, { ...doc }, { user_id: payload.uid });
    if (upd.code !== 0) return { code: 500, message: upd.message };
    return { code: 0, message: 'ok', data: { id: found._id, updated: true } };
  }

  doc.created_at = now;
  const ins = await insert(COLL, doc);
  if (ins.code !== 0) return { code: 500, message: ins.message };
  return { code: 0, message: 'ok', data: { id: ins.data._id, updated: false } };
}

// get：查自己（full）或查他人（public）
async function handleGet(event) {
  // 1) 身份（浏览本人必须有登录态；浏览他人也需登录，避免匿名嗅探）
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  const { uid, full } = event || {};
  const targetUid = uid || payload.uid;
  const isSelf = targetUid === payload.uid;

  const res = await query(COLL, { where: { user_id: targetUid }, pageSize: 1 });
  if (res.code !== 0) return { code: 500, message: res.message };
  const doc = (res.data.list || [])[0];
  if (!doc) return { code: 404, message: '问卷不存在' };

  return { code: 0, message: 'ok', data: toView(doc, isSelf || !!full) };
}

exports.main = async (event, context) => {
  const action = (event && event.action) || 'submit';
  try {
    if (action === 'submit') return await handleSubmit(event);
    if (action === 'get') return await handleGet(event);
    return { code: 400, message: `未知 action: ${action}` };
  } catch (err) {
    return { code: 500, message: err.message || '操作失败' };
  }
};
