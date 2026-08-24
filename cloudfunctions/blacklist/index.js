// cloudfunctions/blacklist/index.js
// 任务：task-020 — 黑名单（举报）云函数（强实名第三重护城河之一，见 coding-style §13/15）
//
// 动作：
//   report: 举报某个用户（target + reason + 可选 detail），落 blacklist(status=pending 待审)
//   list:   查「我举报的」+「关于我的」（浏览类，前端信任安全中心消费）
//
// 信任与约束（见 coding-style 第14节）：
//   - 身份走 common/session.verifyToken(event.token)。
//   - 数据访问统一走 common/db，本文件不裸拼查询链。
//   - 举报只记录 reporter/target/reason/detail/status，不下发任何敏感字段。
//
// 错误码：401 未登录 / 400 参数 / 500 异常
const cloud = require('wx-server-sdk');
const path = require('path');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const { query, insert } = require(path.join(__dirname, '..', 'common', 'db'));
const { verifyToken } = require(path.join(__dirname, '..', 'common', 'session'));

const BLACKLIST_COLL = 'blacklist';
const REASON_MAX = 50;
const DETAIL_MAX = 500;

// 列表只回传必要字段
const BLACKLIST_FIELDS = ['_id', 'reporter', 'target', 'reason', 'detail', 'status', 'created_at'];

function toBlacklistView(b) {
  if (!b) return null;
  const { _id, ...rest } = b;
  return { id: _id, ...rest };
}

// 举报：登录 → 参数校验 → 落 blacklist(status=pending)
async function handleReport(event) {
  // 1) 身份
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };
  const reporter = payload.uid;

  // 2) 参数
  const { target, reason, detail } = event || {};
  if (!target || typeof target !== 'string') return { code: 400, message: '缺少举报对象' };
  if (target === reporter) return { code: 400, message: '不能举报自己' };
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return { code: 400, message: '请填写举报原因' };
  }
  const safeReason = reason.slice(0, REASON_MAX);
  const safeDetail = typeof detail === 'string' ? detail.slice(0, DETAIL_MAX) : '';

  // 3) 落库
  const now = new Date().toISOString();
  const ins = await insert(BLACKLIST_COLL, {
    reporter,
    target,
    reason: safeReason,
    detail: safeDetail,
    status: 'pending',
    created_at: now,
  });
  if (ins.code !== 0) return { code: 500, message: ins.message };

  return {
    code: 0,
    message: 'ok',
    data: toBlacklistView({ _id: ins.data._id, reporter, target, reason: safeReason, detail: safeDetail, status: 'pending', created_at: now }),
  };
}

// 我的举报记录：我举报的 + 关于我的
async function handleList(event) {
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };
  const uid = payload.uid;

  // 我举报的
  const mine = await query(BLACKLIST_COLL, {
    where: { reporter: uid },
    orderBy: ['created_at', 'desc'],
    pageSize: 100,
    fields: BLACKLIST_FIELDS,
  });
  if (mine.code !== 0) return { code: 500, message: mine.message };

  // 关于我的（被举报）
  const aboutMe = await query(BLACKLIST_COLL, {
    where: { target: uid },
    orderBy: ['created_at', 'desc'],
    pageSize: 100,
    fields: BLACKLIST_FIELDS,
  });
  if (aboutMe.code !== 0) return { code: 500, message: aboutMe.message };

  return {
    code: 0,
    message: 'ok',
    data: {
      reported_by_me: (mine.data.list || []).map(toBlacklistView),
      reported_about_me: (aboutMe.data.list || []).map(toBlacklistView),
      total: (mine.data.total || 0) + (aboutMe.data.total || 0),
    },
  };
}

exports.main = async (event, context) => {
  const action = (event && event.action) || 'report';
  try {
    if (action === 'report') return await handleReport(event);
    if (action === 'list') return await handleList(event);
    return { code: 400, message: `未知 action: ${action}` };
  } catch (err) {
    return { code: 500, message: err.message || '操作失败' };
  }
};
