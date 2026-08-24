/**
 * services/auth.test.js — auth 业务门面离线单测(Node 环境 mock wx)
 * 运行: node auth.test.js  (由 package.json test / scripts/test-all.sh 调用)
 */
const assert = require('assert');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log('  ✓', msg); }
  else { failed += 1; console.error('  ✗', msg); }
}

let queue = [];
const store = {};
function installWx() {
  queue = [];
  global.wx = {
    cloud: { callFunction({ success }) { const r = queue.shift() || { code: 0, data: {} }; success({ result: r }); } },
    login: ({ success }) => success({ code: 'mock-code-123' }),
    getStorageSync: (k) => (k in store ? store[k] : ''),
    setStorageSync: (k, v) => { store[k] = v; },
    removeStorageSync: (k) => { delete store[k]; },
    showLoading: () => {},
    hideLoading: () => {},
    showToast: () => {},
  };
}

const auth = require('./auth');

async function run() {
  installWx();
  auth.logout();

  // 1. login 写入旧 user(verified=false)
  queue = [{ code: 0, data: { token: 't', user: { id: 'u1', verified: false } } }];
  await auth.login();
  ok(auth.isVerified() === false, 'login 后未实名 isVerified=false');

  // 2. me() 刷新为 verified=true
  queue = [{ code: 0, data: { user: { id: 'u1', verified: true, nickName: '张三' } } }];
  const u = await auth.me();
  ok(u && u.verified === true, 'me() 返回 verified=true');
  ok(auth.isVerified() === true, 'me() 刷新本地缓存 verified=true');

  // 3. me() 业务错误(401)→ 抛错且不覆盖缓存
  auth.setUserInfo({ id: 'u1', verified: true });
  queue = [{ code: 401, message: '未登录' }];
  let threw = false;
  try { await auth.me(); } catch (e) { threw = true; ok(e.code === 401, 'me() 401 抛 code=401'); }
  ok(threw === true, 'me() 业务错误进入 catch');
  ok(auth.isVerified() === true, 'me() 失败不覆盖缓存');

  console.log(`\nauth.test.js: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => { console.error('FATAL', e); process.exit(1); });
