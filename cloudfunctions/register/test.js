// 单测：register 云函数（register/unregister/my）
// 运行：node test.js（无外部依赖；Module._resolveFilename 将 wx-server-sdk 重定向到 mock）
const assert = require('assert');
const Module = require('module');

// 将 wx-server-sdk 重定向到本地 mock
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  if (request === 'wx-server-sdk') {
    return require.resolve('./__mocks__/wx-server-sdk.js');
  }
  return origResolve.call(this, request, parent, ...args);
};

const cloud = require('wx-server-sdk');
const { signToken } = require('../common/session');
const main = require('./index.js').main;

// 测试辅助
let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function makeUser(uid, opts = {}) {
  cloud.__store.users = cloud.__store.users || [];
  const u = { _id: uid, openid: `openid_${uid}`, verified: true, ...opts };
  const exist = cloud.__store.users.find((x) => x._id === uid);
  if (exist) Object.assign(exist, u);
  else cloud.__store.users.push(u);
  return u;
}

function makeEvent(evId, opts = {}) {
  cloud.__store.events = cloud.__store.events || [];
  const ev = { _id: evId, city: '北京', district: '朝阳区', restaurant_id: 'r1', time: new Date(Date.now() + 86400000).toISOString(), price: 49, capacity: 6, registered: 0, status: 'open', ...opts };
  const exist = cloud.__store.events.find((x) => x._id === evId);
  if (exist) Object.assign(exist, ev);
  else cloud.__store.events.push(ev);
  return ev;
}

const FUTURE = new Date(Date.now() + 86400000).toISOString();
const uid = 'u_reg_1';
const token = signToken({ openid: 'mock-openid', uid });

async function run() {
  // ===== register =====
  cloud.__reset();
  const ev = makeEvent('e_reg_1', { capacity: 2, registered: 0, status: 'open' });
  makeUser(uid, { verified: true });

  // 1) 成功报名 → 落库 status=pending，events.registered+1
  let r = await main({ action: 'register', token, event_id: 'e_reg_1' });
  ok(r.code === 0, '已实名用户报名成功');
  ok(r.data && r.data.status === 'pending', '报名记录状态为 pending（支付前预留）');
  ok(r.data.user_id === uid && r.data.event_id === 'e_reg_1', '报名记录绑定 user/event');
  ok(cloud.__store.events.find((x) => x._id === 'e_reg_1').registered === 1, '场次 registered 自增为 1');

  // 2) 重复报名 → 409
  r = await main({ action: 'register', token, event_id: 'e_reg_1' });
  ok(r.code === 409, '重复报名返回 409');
  ok(cloud.__store.events.find((x) => x._id === 'e_reg_1').registered === 1, '重复报名不重复计数');

  // 3) 未登录 → 401
  r = await main({ action: 'register', event_id: 'e_reg_1' });
  ok(r.code === 401, '缺令牌报名返回 401');

  // 4) 未实名 → 402
  makeUser(uid, { verified: false });
  r = await main({ action: 'register', token, event_id: 'e_reg_1' });
  ok(r.code === 402, '未实名报名返回 402');
  makeUser(uid, { verified: true }); // 恢复

  // 5) 缺 event_id → 400
  r = await main({ action: 'register', token });
  ok(r.code === 400, '缺 event_id 报名返回 400');

  // 6) 场次不存在 → 404
  r = await main({ action: 'register', token, event_id: 'e_not_exist' });
  ok(r.code === 404, '报名不存在场次返回 404');

  // 7) 满员 → 409（第二位报名后 capacity 满，第三位应拒）
  makeEvent('e_reg_2', { capacity: 1, registered: 0, status: 'open' });
  r = await main({ action: 'register', token, event_id: 'e_reg_2' });
  ok(r.code === 0, '第一位报名成功');
  ok(cloud.__store.events.find((x) => x._id === 'e_reg_2').status === 'full', '达容量后场次翻 full');
  const uid2 = 'u_reg_2';
  makeUser(uid2, { verified: true });
  const token2 = signToken({ openid: 'mock-openid', uid: uid2 });
  r = await main({ action: 'register', token: token2, event_id: 'e_reg_2' });
  ok(r.code === 409, '满员后报名返回 409');

  // ===== unregister =====
  cloud.__reset();
  makeEvent('e_unreg_1', { capacity: 2, registered: 1, status: 'open' });
  makeUser(uid, { verified: true });
  // 预置一条 pending 报名
  await main({ action: 'register', token, event_id: 'e_unreg_1' });

  // 8) 取消成功 → 减员
  r = await main({ action: 'unregister', token, event_id: 'e_unreg_1' });
  ok(r.code === 0, '取消报名成功');
  ok(cloud.__store.events.find((x) => x._id === 'e_unreg_1').registered === 1, '取消后场次 registered 回退（注册时+1，取消-1）');
  ok(cloud.__store.registrations.filter((x) => x.user_id === uid && x.event_id === 'e_unreg_1').length === 0, '报名记录已删除');

  // 9) 未报名取消 → 404
  r = await main({ action: 'unregister', token, event_id: 'e_unreg_1' });
  ok(r.code === 404, '取消不存在的报名返回 404');

  // 10) 已支付不能在此取消 → 409
  cloud.__store.registrations.push({ _id: 'reg_paid', user_id: uid, event_id: 'e_unreg_1', status: 'paid', created_at: FUTURE });
  r = await main({ action: 'unregister', token, event_id: 'e_unreg_1' });
  ok(r.code === 409, '已支付报名取消返回 409（需走退款）');

  // ===== my =====
  cloud.__reset();
  makeEvent('e_my_1', { city: '北京', district: '朝阳区', time: FUTURE });
  makeEvent('e_my_2', { city: '上海', district: '浦东新区', time: FUTURE });
  makeUser(uid, { verified: true });
  await main({ action: 'register', token, event_id: 'e_my_1' });
  await main({ action: 'register', token, event_id: 'e_my_2' });

  // 11) my 返回全部报名 + 关联场次摘要
  r = await main({ action: 'my', token });
  ok(r.code === 0, 'my 查询成功');
  ok(r.data.total === 2, 'my 返回 2 条报名');
  ok(Array.isArray(r.data.list) && r.data.list.length === 2, 'my 列表结构正确');
  const hasEventSummary = r.data.list.every((x) => x.event && x.event.id && x.event.city);
  ok(hasEventSummary, '每条报名都关联了场次摘要（city/id）');

  // 12) 未登录 my → 401
  r = await main({ action: 'my' });
  ok(r.code === 401, 'my 缺令牌返回 401');

  console.log(`\n✅ register 单测全部通过：${passed} 项断言`);
}

run().catch((err) => {
  console.error('\n❌ 单测失败:', err.message);
  process.exit(1);
});
