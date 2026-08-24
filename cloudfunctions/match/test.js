// 单测：match 云函数（run / myMatches）
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

// 预置一条报名（默认 paid 且未 matched，供凑桌）
function makeReg(uid, evId, opts = {}) {
  cloud.__store.registrations = cloud.__store.registrations || [];
  const reg = {
    _id: `reg_${uid}_${evId}${opts.suffix || ''}`,
    user_id: uid,
    event_id: evId,
    status: opts.status || 'paid',
    matched: opts.matched || false,
    created_at: opts.created_at || new Date(Date.now() + 1000).toISOString(),
  };
  cloud.__store.registrations.push(reg);
  return reg;
}

const FUTURE = new Date(Date.now() + 86400000).toISOString();
const uid = 'u_match_1';
const token = signToken({ openid: 'mock-openid', uid });

async function run() {
  // ===== run: 凑桌 =====
  cloud.__reset();
  makeEvent('e_match_1', { capacity: 6, registered: 6, status: 'full' });
  makeUser(uid, { verified: true });
  // 4 个已支付且未 matched 的报名 → 刚好开桌
  ['m1', 'm2', 'm3', 'm4'].forEach((s) => makeReg(`u_${s}`, 'e_match_1', { suffix: s }));

  // 1) 凑桌成功 → 落 match_groups，4 人成桌，报名标记 matched
  let r = await main({ action: 'run', token, event_id: 'e_match_1' });
  ok(r.code === 0, '满 4 人成功凑桌');
  ok(r.data && r.data.member_count === 4, '成桌成员数为 4');
  ok(cloud.__store.match_groups.length === 1, 'match_groups 落一条记录');
  ok(cloud.__store.match_groups[0].members.length === 4, 'match_groups.members 含 4 个 uid');
  const matchedRegs = cloud.__store.registrations.filter((x) => x.event_id === 'e_match_1' && x.matched);
  ok(matchedRegs.length === 4, '4 条报名被标记 matched=true');
  const mgId = cloud.__store.match_groups[0]._id;

  // 2) 重复凑桌 → 已 matched 的报名被排除，余 0 人 → 409 人数不足
  r = await main({ action: 'run', token, event_id: 'e_match_1' });
  ok(r.code === 409, '已凑桌的报名被排除后人数不足 → 409');
  ok(cloud.__store.match_groups.length === 1, '未新增 match_groups（防重复凑桌）');

  // 3) 人数不足 → 409（仅 3 个付费）
  cloud.__reset();
  makeEvent('e_match_2', { capacity: 6, registered: 3, status: 'open' });
  ['a', 'b', 'c'].forEach((s) => makeReg(`u_${s}`, 'e_match_2', { suffix: s }));
  r = await main({ action: 'run', token, event_id: 'e_match_2' });
  ok(r.code === 409, '付费人数不足 4 → 409');
  ok(r.message.indexOf('4') >= 0, '409 文案提示需满 4 人');
  ok(cloud.__store.match_groups.length === 0, '人数不足不落 match_groups');

  // 4) 仅 pending 不凑桌（付费门槛）
  cloud.__reset();
  makeEvent('e_match_3', { capacity: 6, registered: 4, status: 'open' });
  ['p1', 'p2', 'p3', 'p4'].forEach((s) => makeReg(`u_${s}`, 'e_match_3', { suffix: s, status: 'pending' }));
  r = await main({ action: 'run', token, event_id: 'e_match_3' });
  ok(r.code === 409, '仅 pending 报名不凑桌 → 409');
  ok(cloud.__store.match_groups.length === 0, 'pending 报名不落 match_groups');

  // 5) 未登录 → 401
  r = await main({ action: 'run', event_id: 'e_match_1' });
  ok(r.code === 401, '缺令牌凑桌返回 401');

  // 6) 缺 event_id → 400
  r = await main({ action: 'run', token });
  ok(r.code === 400, '缺 event_id 凑桌返回 400');

  // 7) 场次不存在 → 404
  r = await main({ action: 'run', token, event_id: 'e_not_exist' });
  ok(r.code === 404, '凑桌不存在场次返回 404');

  // ===== myMatches =====
  cloud.__reset();
  makeUser(uid, { verified: true });
  makeEvent('e_mm_1', { city: '北京', district: '朝阳区', time: FUTURE });
  makeEvent('e_mm_2', { city: '上海', district: '浦东新区', time: FUTURE });
  // 预置两桌，其中一桌含当前用户
  cloud.__store.match_groups = cloud.__store.match_groups || [];
  cloud.__store.match_groups.push({ _id: 'mg_1', event_id: 'e_mm_1', members: [uid, 'x2', 'x3', 'x4'], matched_at: FUTURE });
  cloud.__store.match_groups.push({ _id: 'mg_2', event_id: 'e_mm_2', members: ['y1', 'y2', 'y3', 'y4'], matched_at: FUTURE });

  // 8) myMatches 仅返回含当前用户的桌 + 关联场次摘要
  r = await main({ action: 'myMatches', token });
  ok(r.code === 0, 'myMatches 查询成功');
  ok(r.data.total === 1, 'myMatches 仅返回 1 桌（含当前用户）');
  ok(Array.isArray(r.data.list) && r.data.list.length === 1, 'myMatches 列表结构正确');
  ok(r.data.list[0].event && r.data.list[0].event.id === 'e_mm_1', '桌关联了场次摘要');
  ok(Array.isArray(r.data.list[0].members) && r.data.list[0].members.includes(uid), '桌 members 含当前用户');

  // 9) 未登录 myMatches → 401
  r = await main({ action: 'myMatches' });
  ok(r.code === 401, 'myMatches 缺令牌返回 401');

  console.log(`\n✅ match 单测全部通过：${passed} 项断言`);
}

run().catch((err) => {
  console.error('\n❌ 单测失败:', err.message);
  process.exit(1);
});
