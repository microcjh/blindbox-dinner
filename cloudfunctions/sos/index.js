// cloudfunctions/sos/index.js
// 任务：task-022 — 一键求助（SOS）云函数，饭局中安全兜底
//
// 动作：
//   create: 当前用户发起一键求助 → 落 sos(status=pending) → 返回 sos_id
//   query:  按 sos id 查单条（浏览类）
//   mine:   列出当前用户的求助记录（浏览类，按 created_at 降序）
//
// 信任与约束（见 coding-style 新增 SOS 小节）：
//   - 身份走 common/session.verifyToken(event.token)。
//   - SOS 是「饭局中安全兜底」，不强校「必须已凑桌」：任何已登录用户均可发，
//     覆盖报名后到场前 / 到场中的焦虑与求助场景。
//   - event_id 必填（求助须关联具体场次，便于线下处置联动）；type/desc/location 可选。
//   - 数据访问统一走 common/db（技术方案第4节 / coding-style 第12节），本文件不裸拼查询链。
//
// 错误码：401 未登录 / 400 参数 / 404 不存在 / 500 异常
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const { query, getById, insert } = require('common/db');
const { verifyToken } = require('common/session');

const SOS_COLL = 'sos';
const EVENT_COLL = 'events';
const SOS_FIELDS = ['_id', 'user_id', 'event_id', 'type', 'status', 'location', 'created_at', 'handled_at'];

const VALID_TYPES = ['unsafe', 'lost', 'medical', 'other']; // 求助类型白名单

function toSosView(s) {
  if (!s) return null;
  const { _id, ...rest } = s;
  return { id: _id, ...rest };
}

// 发起一键求助
async function handleCreate(event) {
  // 1) 身份
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  // 2) 参数
  const { event_id, type, desc, location } = event || {};
  if (!event_id || typeof event_id !== 'string') return { code: 400, message: '缺少关联场次 id' };
  if (type !== undefined && (typeof type !== 'string' || !VALID_TYPES.includes(type))) {
    return { code: 400, message: `求助类型非法，仅支持 ${VALID_TYPES.join('/')}` };
  }

  // 3) 场次存在性
  const ev = await getById(EVENT_COLL, event_id);
  if (ev.code !== 0) return { code: 500, message: ev.message };
  if (!ev.data) return { code: 404, message: '关联场次不存在' };

  // 4) 落 sos（status=pending，待平台/线下处置）
  const now = new Date().toISOString();
  const ins = await insert(SOS_COLL, {
    user_id: payload.uid,
    event_id,
    type: type || 'other',
    desc: desc || '',
    location: location || null,
    status: 'pending',
    created_at: now,
    handled_at: null,
  });
  if (ins.code !== 0) return { code: 500, message: ins.message };

  return {
    code: 0,
    message: 'ok',
    data: {
      sos: toSosView({
        _id: ins.data._id,
        user_id: payload.uid,
        event_id,
        type: type || 'other',
        desc: desc || '',
        location: location || null,
        status: 'pending',
        created_at: now,
      }),
    },
  };
}

// 查单条
async function handleQuery(event) {
  // 1) 身份
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  const { id } = event || {};
  if (!id || typeof id !== 'string') return { code: 400, message: '缺少 sos id' };

  const res = await getById(SOS_COLL, id);
  if (res.code !== 0) return { code: 500, message: res.message };
  // 浏览类不强制归属校验（求助记录可被处置方查看）；仅当不存在返回 404
  if (!res.data) return { code: 404, message: '求助记录不存在' };

  return { code: 0, message: 'ok', data: { sos: toSosView(res.data) } };
}

// 我的求助列表（浏览类）
async function handleMine(event) {
  // 1) 身份
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  const res = await query(SOS_COLL, {
    where: { user_id: payload.uid },
    orderBy: ['created_at', 'desc'],
    pageSize: 50,
    fields: SOS_FIELDS,
  });
  if (res.code !== 0) return { code: 500, message: res.message };

  const list = (res.data.list || []).map(toSosView);
  return { code: 0, message: 'ok', data: { list, total: res.data.total } };
}

exports.main = async (event, context) => {
  const action = (event && event.action) || 'create';
  try {
    if (action === 'create') return await handleCreate(event);
    if (action === 'query') return await handleQuery(event);
    if (action === 'mine') return await handleMine(event);
    return { code: 400, message: `未知 action: ${action}` };
  } catch (err) {
    return { code: 500, message: err.message || '操作失败' };
  }
};
