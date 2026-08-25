// cloudfunctions/register/index.js
// 任务：task-015 — 报名（注册场次）云函数，events 之后第二个落库业务实体
//
// 动作：
//   register:   用户报名一场约饭 → 写 registrations(status=pending)，events.registered+1，满员翻 full
//   unregister: 取消报名 → 删 registrations，events.registered-1，由 full 回 open
//   my:         列出当前用户的全部报名 + 关联场次摘要
//
// 信任与约束（见 coding-style 第14/15/17节）：
//   - 身份走 common/session.verifyToken(event.token)。
//   - register/unregister 复用「强实名护城河」：仅已实名（verified=true）用户可报名，与产品三重信任一致。
//   - registrations 唯一索引 (user_id, event_id) 是「一人一场次一条报名」的 DB 级兜底；
//     业务层先预检已报名再插入（防御性，避免依赖不同 SDK 版本的唯一键错误码解析）。
//
// 数据访问统一走 common/db（技术方案第4节 / coding-style 第12节），本文件不裸拼查询链。
//
// 错误码：401 未登录 / 400 参数 / 402 未实名 / 404 不存在 / 409 冲突（已报名/已满/已支付） / 500 异常
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const { query, getById, insert, update, remove } = require('common/db');
const { verifyToken } = require('common/session');

const COLL = 'registrations';

// 列表只回传必要字段（用户自己看，不下发明文身份证等敏感信息；registrations 本就无敏感字段）
const MY_FIELDS = ['_id', 'user_id', 'event_id', 'status', 'created_at'];

// _id → id，便于前端引用
function toRegView(r) {
  if (!r) return null;
  const { _id, ...rest } = r;
  return { id: _id, ...rest };
}

// 关联场次摘要（不联表，逐条 getById；单用户报名数受 capacity≤6 约束，N 次小查询可接受）
async function withEventSummary(reg) {
  const view = toRegView(reg);
  if (!reg || !reg.event_id) return view;
  const ev = await getById('events', reg.event_id);
  if (ev.code === 0 && ev.data) {
    const { _id, city, district, time, price, capacity, registered, status, restaurant_id } = ev.data;
    view.event = { id: _id, city, district, time, price, capacity, registered, status, restaurant_id };
  }
  return view;
}

// 报名：写 registrations(pending) + 场次 registered+1；满员翻 full
async function handleRegister(event) {
  // 1) 身份：无状态令牌优先
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  // 2) 强实名护城河：仅已实名用户可报名
  const u = await getById('users', payload.uid);
  if (u.code !== 0) return { code: 500, message: u.message };
  if (!u.data) return { code: 404, message: '用户不存在' };
  if (!u.data.verified) return { code: 402, message: '请先完成实名认证后再报名' };

  // 3) 参数校验
  const { event_id } = event || {};
  if (!event_id || typeof event_id !== 'string') return { code: 400, message: '缺少场次 id' };

  // 4) 场次存在性 + 可报名状态
  const ev = await getById('events', event_id);
  if (ev.code !== 0) return { code: 500, message: ev.message };
  if (!ev.data) return { code: 404, message: '场次不存在' };
  if (ev.data.status !== 'open') return { code: 409, message: '该场次不可报名（已满或已关闭）' };
  if (ev.data.registered >= ev.data.capacity) return { code: 409, message: '名额已满' };

  // 5) 防重复报名：先预检（唯一索引 (user_id, event_id) 为 DB 级兜底）
  const dup = await query(COLL, { where: { user_id: payload.uid, event_id }, pageSize: 1 });
  if (dup.code !== 0) return { code: 500, message: dup.message };
  if (dup.data.list && dup.data.list.length > 0) {
    return { code: 409, message: '你已报名该场次' };
  }

  // 6) 落库：pending 状态（支付见后续 payment 任务，届时翻 paid）
  const doc = {
    user_id: payload.uid,
    event_id,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  const ins = await insert(COLL, doc);
  if (ins.code !== 0) return { code: 500, message: ins.message };

  // 7) 场次报名数 +1；达容量翻 full（注意：registered 计所有未取消报名，含 pending）
  const newRegistered = (ev.data.registered || 0) + 1;
  const newStatus = newRegistered >= ev.data.capacity ? 'full' : 'open';
  const upd = await update('events', { _id: event_id, registered: newRegistered, status: newStatus });
  if (upd.code !== 0) return { code: 500, message: upd.message };

  return {
    code: 0,
    message: 'ok',
    data: toRegView({ _id: ins.data._id, ...doc }),
  };
}

// 取消报名：删 registrations + 场次 registered-1；已支付需走退款流程
async function handleUnregister(event) {
  // 1) 身份
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  // 2) 参数校验
  const { event_id } = event || {};
  if (!event_id || typeof event_id !== 'string') return { code: 400, message: '缺少场次 id' };

  // 3) 查已存在的报名
  const exist = await query(COLL, { where: { user_id: payload.uid, event_id }, pageSize: 1 });
  if (exist.code !== 0) return { code: 500, message: exist.message };
  const reg = exist.data.list && exist.data.list[0];
  if (!reg) return { code: 404, message: '未找到你的报名记录' };

  // 4) 已支付不能在此取消（退款由 payment 任务处理）
  if (reg.status === 'paid') return { code: 409, message: '已支付，取消需走退款流程' };

  // 5) 删除报名
  const del = await remove(COLL, { user_id: payload.uid, event_id });
  if (del.code !== 0) return { code: 500, message: del.message };

  // 6) 场次报名数 -1；若此前满员且现在有余位 → 回 open
  const ev = await getById('events', event_id);
  if (ev.code === 0 && ev.data) {
    const newRegistered = Math.max(0, (ev.data.registered || 0) - 1);
    const newStatus = ev.data.status === 'full' && newRegistered < ev.data.capacity ? 'open' : ev.data.status;
    const upd = await update('events', { _id: event_id, registered: newRegistered, status: newStatus });
    if (upd.code !== 0) return { code: 500, message: upd.message };
  }

  return { code: 0, message: '已取消报名' };
}

// 我的报名：列出当前用户全部报名 + 关联场次摘要
async function handleMy(event) {
  // 1) 身份
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  const res = await query(COLL, {
    where: { user_id: payload.uid },
    orderBy: ['created_at', 'desc'],
    pageSize: 50,
    fields: MY_FIELDS,
  });
  if (res.code !== 0) return { code: 500, message: res.message };

  const list = await Promise.all((res.data.list || []).map(withEventSummary));
  return {
    code: 0,
    message: 'ok',
    data: { list, total: res.data.total },
  };
}

exports.main = async (event, context) => {
  const action = (event && event.action) || 'register';
  try {
    if (action === 'register') return await handleRegister(event);
    if (action === 'unregister') return await handleUnregister(event);
    if (action === 'my') return await handleMy(event);
    return { code: 400, message: `未知 action: ${action}` };
  } catch (err) {
    return { code: 500, message: err.message || '操作失败' };
  }
};
