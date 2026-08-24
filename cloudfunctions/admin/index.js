// cloudfunctions/admin/index.js
// 任务：task-023 — 管理端（举报审核 + SOS 处置）云函数，闭合 review/blacklist/sos 的待处理锚点
//
// 动作：
//   listReports:  列出待审举报（blacklist.status=pending），分页
//   handleReport: 处置举报（decision=resolved 仅标记处理完毕 / banned 标记封禁），须 pending 且存在
//   listSos:      列出待处置求助（sos.status=pending）
//   handleSos:    处置求助（标记 handled + 可选 note），须 pending 且存在
//
// 权限：所有 action 须管理员。角色通过 env ADMIN_UIDS（逗号分隔）或本地回退常量判定（devStub 友好）。
//   非管理员返回 403。本文件不裸拼查询链，统一走 common/db。
//
// 错误码：401 未登录 / 403 无权限 / 400 参数 / 404 不存在 / 500 异常
const cloud = require('wx-server-sdk');
const path = require('path');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const { query, getById, update } = require(path.join(__dirname, '..', 'common', 'db'));
const { verifyToken } = require(path.join(__dirname, '..', 'common', 'session'));

const BLACKLIST_COLL = 'blacklist';
const SOS_COLL = 'sos';
const REPORT_FIELDS = ['_id', 'reporter', 'target', 'reason', 'detail', 'status', 'created_at'];
const SOS_FIELDS = ['_id', 'user_id', 'event_id', 'type', 'desc', 'status', 'location', 'created_at', 'handled_at'];

// 管理员白名单：优先读 env，读不到回退本地常量（仅 dev 演示用，生产必须配置 env ADMIN_UIDS）
const ADMIN_FALLBACK = ['admin-u1'];
function getAdminUids() {
  const env = (process.env.ADMIN_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return env.length ? env : ADMIN_FALLBACK;
}

function toReportView(b) {
  if (!b) return null;
  const { _id, ...rest } = b;
  return { id: _id, ...rest };
}

function toSosView(s) {
  if (!s) return null;
  const { _id, ...rest } = s;
  return { id: _id, ...rest };
}

// 管理员身份校验：登录 + 白名单
function requireAdmin(event) {
  const payload = verifyToken(event && event.token);
  if (!payload) return { ok: false, code: 401, message: '登录态已失效，请重新登录' };
  const adminUids = getAdminUids();
  if (!adminUids.includes(payload.uid)) {
    return { ok: false, code: 403, message: '无管理员权限' };
  }
  return { ok: true, uid: payload.uid };
}

// 列出待审举报
async function handleListReports(event) {
  const auth = requireAdmin(event);
  if (!auth.ok) return { code: auth.code, message: auth.message };

  const { page = 1, pageSize = 20 } = event || {};
  const res = await query(BLACKLIST_COLL, {
    where: { status: 'pending' },
    orderBy: ['created_at', 'desc'],
    page: Number(page) || 1,
    pageSize: Number(pageSize) || 20,
    fields: REPORT_FIELDS,
  });
  if (res.code !== 0) return { code: 500, message: res.message };

  return {
    code: 0,
    message: 'ok',
    data: {
      list: (res.data.list || []).map(toReportView),
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
      total: res.data.total,
    },
  };
}

// 处置举报：decision=resolved|banned
async function handleReport(event) {
  const auth = requireAdmin(event);
  if (!auth.ok) return { code: auth.code, message: auth.message };

  const { id, decision, note } = event || {};
  if (!id || typeof id !== 'string') return { code: 400, message: '缺少举报 id' };
  if (!decision || !['resolved', 'banned'].includes(decision)) {
    return { code: 400, message: 'decision 仅支持 resolved/banned' };
  }

  const rec = await getById(BLACKLIST_COLL, id);
  if (rec.code !== 0) return { code: 500, message: rec.message };
  if (!rec.data) return { code: 404, message: '举报记录不存在' };
  if (rec.data.status !== 'pending') {
    return { code: 409, message: `该举报已处理（当前状态：${rec.data.status}）` };
  }

  const now = new Date().toISOString();
  const upd = await update(BLACKLIST_COLL, {
    _id: id,
    status: decision,
    handled_at: now,
    handler: auth.uid,
    note: typeof note === 'string' ? note.slice(0, 500) : '',
  });
  if (upd.code !== 0) return { code: 500, message: upd.message };

  return {
    code: 0,
    message: 'ok',
    data: { report: toReportView({ ...rec.data, status: decision, handled_at: now, handler: auth.uid }) },
  };
}

// 列出待处置求助
async function handleListSos(event) {
  const auth = requireAdmin(event);
  if (!auth.ok) return { code: auth.code, message: auth.message };

  const { page = 1, pageSize = 20 } = event || {};
  const res = await query(SOS_COLL, {
    where: { status: 'pending' },
    orderBy: ['created_at', 'desc'],
    page: Number(page) || 1,
    pageSize: Number(pageSize) || 20,
    fields: SOS_FIELDS,
  });
  if (res.code !== 0) return { code: 500, message: res.message };

  return {
    code: 0,
    message: 'ok',
    data: {
      list: (res.data.list || []).map(toSosView),
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
      total: res.data.total,
    },
  };
}

// 处置求助：标记 handled + 可选 note
async function handleSos(event) {
  const auth = requireAdmin(event);
  if (!auth.ok) return { code: auth.code, message: auth.message };

  const { id, note } = event || {};
  if (!id || typeof id !== 'string') return { code: 400, message: '缺少 sos id' };

  const rec = await getById(SOS_COLL, id);
  if (rec.code !== 0) return { code: 500, message: rec.message };
  if (!rec.data) return { code: 404, message: '求助记录不存在' };
  if (rec.data.status !== 'pending') {
    return { code: 409, message: `该求助已处置（当前状态：${rec.data.status}）` };
  }

  const now = new Date().toISOString();
  const upd = await update(SOS_COLL, {
    _id: id,
    status: 'handled',
    handled_at: now,
    handler: auth.uid,
    note: typeof note === 'string' ? note.slice(0, 500) : '',
  });
  if (upd.code !== 0) return { code: 500, message: upd.message };

  return {
    code: 0,
    message: 'ok',
    data: { sos: toSosView({ ...rec.data, status: 'handled', handled_at: now, handler: auth.uid }) },
  };
}

exports.main = async (event, context) => {
  const action = (event && event.action) || 'listReports';
  try {
    if (action === 'listReports') return await handleListReports(event);
    if (action === 'handleReport') return await handleReport(event);
    if (action === 'listSos') return await handleListSos(event);
    if (action === 'handleSos') return await handleSos(event);
    return { code: 400, message: `未知 action: ${action}` };
  } catch (err) {
    return { code: 500, message: err.message || '操作失败' };
  }
};
