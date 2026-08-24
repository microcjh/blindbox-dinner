// cloudfunctions/match/index.js
// 任务：task-019 — 匹配（凑桌）云函数，register 之后把已付费用户凑成一桌
//
// 动作：
//   run:       对某场次，把已支付(paid)且未 matched 的报名凑成一桌 → 落 match_groups(members 4–6)
//              并标记每个 member 的 registrations.matched=true（防重复凑桌）
//   myMatches: 列出当前用户参与的所有桌（含关联场次摘要）
//
// 信任与约束（见 coding-style 第14/18/19节）：
//   - 身份走 common/session.verifyToken(event.token)。
//   - 凑桌以「已支付」为门槛（paid 才算真正入桌，与产品付费信任一致）；未支付(pending)不参与。
//   - 开桌人数下限 4（schema: match_groups.members 4–6）；不足 4 人返回 409 提示未达开桌人数。
//   - 数据访问统一走 common/db（技术方案第4节 / coding-style 第12节），本文件不裸拼查询链。
//
// 错误码：401 未登录 / 400 参数 / 404 不存在（场次） / 409 冲突（人数不足/已凑满） / 500 异常
const cloud = require('wx-server-sdk');
const path = require('path');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const { query, getById, insert, update } = require(path.join(__dirname, '..', 'common', 'db'));
const { verifyToken } = require(path.join(__dirname, '..', 'common', 'session'));

const REG_COLL = 'registrations';
const MATCH_COLL = 'match_groups';
const MIN_MEMBERS = 4; // 开桌下限（schema: members 4–6）

// 列表只回传必要字段（降传输体积；match_groups 无敏感字段）
const MATCH_FIELDS = ['_id', 'event_id', 'members', 'matched_at'];

function toMatchView(m) {
  if (!m) return null;
  const { _id, ...rest } = m;
  return { id: _id, ...rest };
}

// 关联场次摘要（不联表，逐条 getById）
async function withEventSummary(m) {
  const view = toMatchView(m);
  if (!m || !m.event_id) return view;
  const ev = await getById('events', m.event_id);
  if (ev.code === 0 && ev.data) {
    const { _id, city, district, time, price, restaurant_id } = ev.data;
    view.event = { id: _id, city, district, time, price, restaurant_id };
  }
  return view;
}

// 凑桌：把某场次已支付且未 matched 的报名凑成一桌
async function handleRun(event) {
  // 1) 身份
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  // 2) 参数
  const { event_id } = event || {};
  if (!event_id || typeof event_id !== 'string') return { code: 400, message: '缺少场次 id' };

  // 3) 场次存在性
  const ev = await getById('events', event_id);
  if (ev.code !== 0) return { code: 500, message: ev.message };
  if (!ev.data) return { code: 404, message: '场次不存在' };

  // 4) 取该场次「已支付且未 matched」的报名（按 created_at 升序，先报先入桌）
  const regs = await query(REG_COLL, {
    where: { event_id, status: 'paid', matched: { $ne: true } },
    orderBy: ['created_at', 'asc'],
    pageSize: 50,
  });
  if (regs.code !== 0) return { code: 500, message: regs.message };
  const candidates = regs.data.list || [];
  if (candidates.length < MIN_MEMBERS) {
    return { code: 409, message: `已支付人数不足，需满 ${MIN_MEMBERS} 人开桌（当前 ${candidates.length} 人）` };
  }

  // 5) 取 MIN_MEMBERS 人成一桌（文档库 $ne 兼容：再防御一次已 matched）
  const members = candidates.filter((r) => !r.matched).slice(0, MIN_MEMBERS);
  if (members.length < MIN_MEMBERS) {
    return { code: 409, message: `可凑桌人数不足，需满 ${MIN_MEMBERS} 人开桌（当前 ${members.length} 人）` };
  }
  const memberIds = members.map((r) => r.user_id);

  // 6) 落 match_groups
  const matchedAt = new Date().toISOString();
  const ins = await insert(MATCH_COLL, {
    event_id,
    members: memberIds,
    matched_at: matchedAt,
    created_at: matchedAt,
  });
  if (ins.code !== 0) return { code: 500, message: ins.message };

  // 7) 标记每个 member 的报名 matched=true（防重复凑桌；幂等：已 matched 的查询已排除）
  const updRes = await update(REG_COLL, { matched: true }, { _id: { $in: members.map((r) => r._id) } });
  if (updRes.code !== 0) return { code: 500, message: updRes.message };

  return {
    code: 0,
    message: 'ok',
    data: {
      match: toMatchView({ _id: ins.data._id, event_id, members: memberIds, matched_at: matchedAt }),
      member_count: memberIds.length,
    },
  };
}

// 我的桌：列出当前用户参与的所有 match_groups + 关联场次摘要
async function handleMyMatches(event) {
  // 1) 身份
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  // 2) 查包含当前用户的桌（members 数组含 uid）
  const res = await query(MATCH_COLL, {
    where: { members: payload.uid },
    orderBy: ['matched_at', 'desc'],
    pageSize: 50,
    fields: MATCH_FIELDS,
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
  const action = (event && event.action) || 'run';
  try {
    if (action === 'run') return await handleRun(event);
    if (action === 'myMatches') return await handleMyMatches(event);
    return { code: 400, message: `未知 action: ${action}` };
  } catch (err) {
    return { code: 500, message: err.message || '操作失败' };
  }
};
