// 单测：blacklist 云函数（report / list）
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

async function call(action, data, uid = 'u_reporter') {
  const token = signToken({ openid: `openid_${uid}`, uid });
  return main({ action, token, ...data });
}

(async () => {
  // 1) report: 成功落库
  reset();
  makeUser('u_reporter');
  makeUser('u_target');
  let r = await call('report', { target: 'u_target', reason: '言语冒犯', detail: '饭局中多次打断他人' });
  ok(r.code === 0, 'report 成功 code=0');
  ok(r.data && r.data.id, 'report 返回 id');
  ok(r.data.status === 'pending' && r.data.target === 'u_target', 'report 回传 status=pending/target');
  ok(cloud.__store.blacklist.length === 1, 'report 落库 1 条 blacklist');

  // 2) report: 未登录 401
  reset();
  r = await main({ action: 'report', target: 'u_target', reason: '冒犯' });
  ok(r.code === 401, 'report 无 token 返回 401');

  // 3) report: 参数缺失 400（缺 target / 缺 reason / 举报自己）
  reset();
  makeUser('u_reporter');
  makeUser('u_target');
  r = await call('report', { reason: '冒犯' });
  ok(r.code === 400, 'report 缺 target 返回 400');
  r = await call('report', { target: 'u_target' });
  ok(r.code === 400, 'report 缺 reason 返回 400');
  r = await call('report', { target: 'u_reporter', reason: '冒犯' });
  ok(r.code === 400, 'report 举报自己返回 400');

  // 4) list: 返回「我举报的」+「关于我的」
  reset();
  makeUser('u_reporter');
  makeUser('u_target');
  makeUser('u_other');
  cloud.__store.blacklist.push({ _id: 'bl_1', reporter: 'u_reporter', target: 'u_target', reason: '冒犯', detail: '', status: 'pending', created_at: new Date().toISOString() });
  cloud.__store.blacklist.push({ _id: 'bl_2', reporter: 'u_other', target: 'u_reporter', reason: '骚扰', detail: '', status: 'pending', created_at: new Date().toISOString() });
  cloud.__store.blacklist.push({ _id: 'bl_3', reporter: 'u_target', target: 'u_x', reason: '其他', detail: '', status: 'pending', created_at: new Date().toISOString() });
  r = await call('list', {}, 'u_reporter');
  ok(r.code === 0, 'list 成功 code=0');
  ok(r.data.reported_by_me.length === 1 && r.data.reported_by_me[0].id === 'bl_1', 'list 我举报的含 bl_1');
  ok(r.data.reported_about_me.length === 1 && r.data.reported_about_me[0].id === 'bl_2', 'list 关于我的含 bl_2');
  ok(r.data.total === 2, 'list total=2（只统计与本用户相关）');

  // 5) list: 未登录 401
  reset();
  r = await main({ action: 'list' });
  ok(r.code === 401, 'list 无 token 返回 401');

  console.log(`\nblacklist.test.js: ${passed} passed`);
})().catch((err) => {
  console.error('\n❌ 单测异常:', err.message);
  process.exit(1);
});
