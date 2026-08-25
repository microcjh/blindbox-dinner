// cloudfunctions/review/index.js
// 任务：task-020 — 饭后双向评价云函数（强实名第三重护城河之一，见 coding-style §13/15）
//
// 动作：
//   submit: 对同桌某人提交一次评价（评分 1–5 + 标签 + 可选评论）
//           - 须登录
//           - 须为该场次本桌成员（查 match_groups，members 同时含 from_uid 与 to_uid，防跨桌乱评）
//           - 唯一约束 (from_uid, to_uid, event_id) 防重复评价
//   list:   按 event_id 查该场次全部评价（浏览类，前端饭局沉淀页消费）
//
// 信任与约束（见 coding-style 第14/18/22节）：
//   - 身份走 common/session.verifyToken(event.token)。
//   - 数据访问统一走 common/db，本文件不裸拼查询链。
//   - 评价只记录 from/to/event/score/tags/comment，不下发任何敏感字段。
//
// 错误码：401 未登录 / 400 参数 / 403 非本桌成员 / 404 不存在（场次/同桌） / 409 冲突（已评价） / 500 异常
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const { query, getById, insert } = require('common/db');
const { verifyToken } = require('common/session');

const REVIEW_COLL = 'reviews';
const MATCH_COLL = 'match_groups';
const EVENT_COLL = 'events';

const SCORE_MIN = 1;
const SCORE_MAX = 5;
const COMMENT_MAX = 200;

// 列表只回传必要字段（降传输体积；reviews 无敏感字段）
const REVIEW_FIELDS = ['_id', 'event_id', 'from_uid', 'to_uid', 'score', 'tags', 'comment', 'created_at'];

function toReviewView(r) {
  if (!r) return null;
  const { _id, ...rest } = r;
  return { id: _id, ...rest };
}

// 评价提交：登录 → 参数校验 → 场次存在 → 须为本桌成员 → 唯一约束防重 → 落库
async function handleSubmit(event) {
  // 1) 身份
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };
  const fromUid = payload.uid;

  // 2) 参数
  const { event_id, to_uid, score, tags, comment } = event || {};
  if (!event_id || typeof event_id !== 'string') return { code: 400, message: '缺少场次 id' };
  if (!to_uid || typeof to_uid !== 'string') return { code: 400, message: '缺少评价对象' };
  if (!score || typeof score !== 'number' || score < SCORE_MIN || score > SCORE_MAX) {
    return { code: 400, message: `评分须为 ${SCORE_MIN}–${SCORE_MAX} 的整数` };
  }
  if (to_uid === fromUid) return { code: 400, message: '不能评价自己' };
  const safeTags = Array.isArray(tags) ? tags.slice(0, 10) : [];
  const safeComment = typeof comment === 'string' ? comment.slice(0, COMMENT_MAX) : '';

  // 3) 场次存在性
  const ev = await getById(EVENT_COLL, event_id);
  if (ev.code !== 0) return { code: 500, message: ev.message };
  if (!ev.data) return { code: 404, message: '场次不存在' };

  // 4) 须为本桌成员：查含 from_uid 与 to_uid 的同一桌
  const groups = await query(MATCH_COLL, {
    where: { event_id, members: fromUid },
    pageSize: 50,
  });
  if (groups.code !== 0) return { code: 500, message: groups.message };
  const sameTable = (groups.data.list || []).find(
    (g) => Array.isArray(g.members) && g.members.includes(to_uid)
  );
  if (!sameTable) return { code: 403, message: '只能评价同场次同桌的饭友' };

  // 5) 唯一约束（from,to,event）防重复评价：先查是否已评
  const existed = await query(REVIEW_COLL, {
    where: { event_id, from_uid: fromUid, to_uid },
    pageSize: 1,
  });
  if (existed.code !== 0) return { code: 500, message: existed.message };
  if ((existed.data.list || []).length > 0) {
    return { code: 409, message: '你已评价过该饭友，不可重复评价' };
  }

  // 6) 落库
  const now = new Date().toISOString();
  const ins = await insert(REVIEW_COLL, {
    event_id,
    from_uid: fromUid,
    to_uid,
    score,
    tags: safeTags,
    comment: safeComment,
    created_at: now,
  });
  if (ins.code !== 0) return { code: 500, message: ins.message };

  return {
    code: 0,
    message: 'ok',
    data: toReviewView({ _id: ins.data._id, event_id, from_uid: fromUid, to_uid, score, tags: safeTags, comment: safeComment, created_at: now }),
  };
}

// 评价列表：按 event_id 查该场次全部评价（浏览类）
async function handleList(event) {
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  const { event_id } = event || {};
  if (!event_id || typeof event_id !== 'string') return { code: 400, message: '缺少场次 id' };

  const res = await query(REVIEW_COLL, {
    where: { event_id },
    orderBy: ['created_at', 'desc'],
    pageSize: 100,
    fields: REVIEW_FIELDS,
  });
  if (res.code !== 0) return { code: 500, message: res.message };

  const list = (res.data.list || []).map(toReviewView);
  return {
    code: 0,
    message: 'ok',
    data: { list, total: res.data.total },
  };
}

exports.main = async (event, context) => {
  const action = (event && event.action) || 'submit';
  try {
    if (action === 'submit') return await handleSubmit(event);
    if (action === 'list') return await handleList(event);
    return { code: 400, message: `未知 action: ${action}` };
  } catch (err) {
    return { code: 500, message: err.message || '操作失败' };
  }
};
