// cloudfunctions/sos/test.js — 覆盖边界：401/400/404/成功落库/查询/列表
const path = require('path');
const assert = require('assert');

// 重定向 wx-server-sdk → mock（与 common 同款机制）
const Module = require('module');
const mockPath = path.join(__dirname, '__mocks__', 'wx-server-sdk.js');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'wx-server-sdk') return mockPath;
  return origResolve.call(this, request, ...args);
};

const { signToken, verifyToken } = require(path.join(__dirname, '..', 'common', 'session'));
const main = require('./index').main;

function tokenOf(uid = 'u1') {
  return signToken({ openid: `o-${uid}`, uid });
}

let pass = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  pass += 1;
}

(async () => {
  // 1) 未登录 → 401
  {
    const r = await main({ action: 'create', token: '', event_id: 'e1' });
    ok(r.code === 401, 'create 缺 token → 401');
  }

  // 2) 缺 event_id → 400
  {
    const r = await main({ action: 'create', token: tokenOf(), event_id: '' });
    ok(r.code === 400, 'create 缺 event_id → 400');
  }

  // 3) type 非法 → 400
  {
    const r = await main({ action: 'create', token: tokenOf(), event_id: 'e1', type: 'hack' });
    ok(r.code === 400, 'create type 非法 → 400');
  }

  // 4) 关联场次不存在 → 404
  {
    const r = await main({ action: 'create', token: tokenOf(), event_id: 'no-such', type: 'unsafe' });
    ok(r.code === 404, 'create 场次不存在 → 404');
  }

  // 5) 成功落库 → 0 + sos_id
  {
    const r = await main({ action: 'create', token: tokenOf(), event_id: 'e1', type: 'unsafe', desc: '不舒服', location: { lng: 116.4, lat: 39.9 } });
    ok(r.code === 0, 'create 成功 → 0');
    ok(r.data && r.data.sos && r.data.sos.id, 'create 返回 sos_id');
    ok(r.data.sos.status === 'pending', 'create 初始 status=pending');
    ok(r.data.sos.user_id === 'u1', 'create 归属当前 uid');
    ok(r.data.sos.type === 'unsafe', 'create type 透传');
    ok(r.data.sos.location && r.data.sos.location.lng === 116.4, 'create location 透传');
    global.__sosId = r.data.sos.id;
  }

  // 6) query 缺 id → 400
  {
    const r = await main({ action: 'query', token: tokenOf(), id: '' });
    ok(r.code === 400, 'query 缺 id → 400');
  }

  // 7) query 不存在 → 404
  {
    const r = await main({ action: 'query', token: tokenOf(), id: 'no-such' });
    ok(r.code === 404, 'query 不存在 → 404');
  }

  // 8) query 成功
  {
    const r = await main({ action: 'query', token: tokenOf(), id: global.__sosId });
    ok(r.code === 0, 'query 成功 → 0');
    ok(r.data.sos.id === global.__sosId, 'query 命中落库记录');
  }

  // 9) mine 未登录 → 401
  {
    const r = await main({ action: 'mine', token: '' });
    ok(r.code === 401, 'mine 缺 token → 401');
  }

  // 10) mine 成功 + 列表含刚落库记录
  {
    const r = await main({ action: 'mine', token: tokenOf() });
    ok(r.code === 0, 'mine 成功 → 0');
    ok(Array.isArray(r.data.list) && r.data.list.length >= 1, 'mine 列表非空');
    ok(r.data.list.some((s) => s.id === global.__sosId), 'mine 列表含刚落库记录');
    ok(r.data.list[0].user_id === 'u1', 'mine 仅返回本人记录（mock 单用户）');
  }

  // 11) 未知 action → 400
  {
    const r = await main({ action: 'bogus', token: tokenOf(), event_id: 'e1' });
    ok(r.code === 400, '未知 action → 400');
  }

  console.log(`sos 云函数单测通过：${pass} 项`);
})().catch((e) => {
  console.error('sos 云函数单测失败：', e.message);
  process.exit(1);
});
