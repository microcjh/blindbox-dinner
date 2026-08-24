// 单测：review 云函数（submit / list）
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

function reset() {
  cloud.__reset();
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

// 预置一桌：members 含 from/to 两人（同一 event）
function makeTable(evId, members) {
  cloud.__store.match_groups = cloud.__store.match_groups || [];
  const g = { _id: `mg_${evId}`, event_id: evId, members, matched_at: new Date().toISOString() };
  cloud.__store.match_groups.push(g);
  return g;
}

const FUTURE = new Date(Date.now() + 86400000).toISOString();

async function call(action, data, uid = 'u_from') {
  const token = signToken({ openid: `openid_${uid}`, uid });
  return main({ action, token, ...data });
}

(async () => {
  // 1) submit: 成功落库（同桌成员）
  reset();
  makeUser('u_from');
  makeUser('u_to');
  makeEvent('e1');
  makeTable('e1', ['u_from', 'u_to']);
  let r = await call('submit', { event_id: 'e1', to_uid: 'u_to', score: 5, tags: ['有趣'], comment: '很愉快' });
  ok(r.code === 0, 'submit 成功 code=0');
  ok(r.data && r.data.id, 'submit 返回评价 id');
  ok(r.data.score === 5 && r.data.to_uid === 'u_to', 'submit 回传 score/to_uid');
  ok(cloud.__store.reviews.length === 1, 'submit 落库 1 条 reviews');

  // 2) submit: 未登录 401
  reset();
  r = await main({ action: 'submit', event_id: 'e1', to_uid: 'u_to', score: 4 });
  ok(r.code === 401, 'submit 无 token 返回 401');

  // 3) submit: 参数缺失 400（缺 to_uid / score 越界 / 评自己）
  reset();
  makeUser('u_from');
  makeEvent('e1');
  makeTable('e1', ['u_from', 'u_to']);
  r = await call('submit', { event_id: 'e1', score: 4 });
  ok(r.code === 400, 'submit 缺 to_uid 返回 400');
  r = await call('submit', { event_id: 'e1', to_uid: 'u_to', score: 9 });
  ok(r.code === 400, 'submit score 越界返回 400');
  r = await call('submit', { event_id: 'e1', to_uid: 'u_from', score: 5 });
  ok(r.code === 400, 'submit 评价自己返回 400');

  // 4) submit: 场次不存在 404
  reset();
  makeUser('u_from');
  makeUser('u_to');
  makeTable('e1', ['u_from', 'u_to']);
  r = await call('submit', { event_id: 'e_no', to_uid: 'u_to', score: 5 });
  ok(r.code === 404, 'submit 场次不存在返回 404');

  // 5) submit: 非本桌成员 403（to_uid 不在同桌）
  reset();
  makeUser('u_from');
  makeUser('u_to');
  makeUser('u_other'); // 不在表中
  makeEvent('e1');
  makeTable('e1', ['u_from', 'u_to']);
  r = await call('submit', { event_id: 'e1', to_uid: 'u_other', score: 5 });
  ok(r.code === 403, 'submit 非本桌成员返回 403');

  // 6) submit: 重复评价 409（同 from/to/event 已存在）
  reset();
  makeUser('u_from');
  makeUser('u_to');
  makeEvent('e1');
  makeTable('e1', ['u_from', 'u_to']);
  cloud.__store.reviews.push({ _id: 'rev_1', event_id: 'e1', from_uid: 'u_from', to_uid: 'u_to', score: 4, tags: [], comment: '', created_at: FUTURE });
  r = await call('submit', { event_id: 'e1', to_uid: 'u_to', score: 5 });
  ok(r.code === 409, 'submit 重复评价返回 409');

  // 7) list: 按 event_id 返回该场次评价
  reset();
  makeUser('u_from');
  cloud.__store.reviews.push({ _id: 'rev_1', event_id: 'e1', from_uid: 'u_from', to_uid: 'u_to', score: 5, tags: ['有趣'], comment: '好', created_at: FUTURE });
  cloud.__store.reviews.push({ _id: 'rev_2', event_id: 'e2', from_uid: 'u_from', to_uid: 'u_x', score: 3, tags: [], comment: '', created_at: FUTURE });
  r = await call('list', { event_id: 'e1' }, 'u_viewer');
  ok(r.code === 0, 'list 成功 code=0');
  ok(r.data.total === 1 && r.data.list[0].event_id === 'e1', 'list 只回传 event_id=e1 的评价');
  ok(r.data.list[0].id === 'rev_1', 'list 回传 id（_id 重命名）');

  // 8) list: 缺 event_id 400
  reset();
  makeUser('u_from');
  r = await call('list', {}, 'u_viewer');
  ok(r.code === 400, 'list 缺 event_id 返回 400');

  console.log(`\nreview.test.js: ${passed} passed`);
})().catch((err) => {
  console.error('\n❌ 单测异常:', err.message);
  process.exit(1);
});
