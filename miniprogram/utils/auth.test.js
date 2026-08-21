/**
 * utils/auth.test.js — auth.js 离线单测(Node 环境 mock wx)
 *
 * 与 request.test.js 同构:不依赖真实微信/CloudBase,纯逻辑验证。
 * 运行: node auth.test.js  (由 scripts/test-all.sh 在 CI 调用)
 */

// ---------- 基础断言 ----------
let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error('  ✗ ' + msg);
  }
}
function assertEqual(a, b, msg) {
  assert(a === b, `${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`);
}

// ---------- mock wx ----------
let queue = []; // wx.cloud.callFunction 依次返回的 result.result
const store = {};
let loginShouldFail = false;

global.wx = {
  cloud: {
    callFunction({ success }) {
      const r = queue.shift() || { code: 0, data: {} };
      success({ result: r });
    },
  },
  login: ({ success, fail }) => {
    if (loginShouldFail) fail(new Error('wx.login fail'));
    else success({ code: 'mock-code-123' });
  },
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; },
  showLoading: () => {},
  hideLoading: () => {},
  showToast: () => {},
};

const request = require('./request');
const auth = require('./auth');

async function run() {
  // 1. 未登录态
  auth.logout();
  assertEqual(auth.isLoggedIn(), false, '初始未登录 isLoggedIn=false');
  assertEqual(auth.isVerified(), false, '初始未实名 isVerified=false');
  assertEqual(auth.getUserInfo(), null, '初始 user=null');

  // 2. login() 写入 token + user
  queue = [{ code: 0, data: { token: 'tok-abc', user: { id: 'u1', verified: false, nickname: '北漂小王' } } }];
  const user = await auth.login();
  assertEqual(user && user.id, 'u1', 'login 返回 user.id=u1');
  assertEqual(auth.getToken(), 'tok-abc', 'login 后 token 已缓存');
  assertEqual(auth.isLoggedIn(), true, 'login 后 isLoggedIn=true');
  assertEqual(auth.isVerified(), false, '未实名 user.verified=false → isVerified=false');

  // 3. 实名判断
  auth.setUserInfo({ id: 'u1', verified: true });
  assertEqual(auth.isVerified(), true, 'user.verified=true → isVerified=true');
  auth.setUserInfo({ id: 'u1', verified: false });
  assertEqual(auth.isVerified(), false, 'user.verified=false → isVerified=false');

  // 4. ensureLogin:已登录返回缓存 user
  const ensured = await auth.ensureLogin();
  assertEqual(ensured && ensured.id, 'u1', 'ensureLogin 已登录返回缓存 user');

  // 5. 401 重登集成(已 initAuth):callFunction 收到 401 → 触发重登 → 重试成功
  auth.initAuth();
  queue = [
    { code: 401, message: '未登录' },
    { code: 0, data: { token: 'tok-relogin', user: { id: 'u2', verified: true } } },
  ];
  const retryData = await request.callFunction({ name: 'someApi', action: 'get', loading: false });
  assertEqual(queue.length, 0, '401→重登→重试 共消费 2 个结果');
  assertEqual(auth.getToken(), 'tok-relogin', '重登后更新 token');
  assertEqual(auth.isVerified(), true, '重登后 user.verified=true → isVerified=true');

  // 6. 无钩子(未 init / 已 logout):401 不重登,直接 reject
  auth.logout(); // 清除 401 钩子
  queue = [
    { code: 401, message: '未登录' },
    { code: 0, data: { token: 'tok-should-not-use', user: { id: 'x' } } },
  ];
  let rejected = false;
  try {
    await request.callFunction({ name: 'someApi', action: 'get', loading: false });
  } catch (e) {
    rejected = true;
    assertEqual(e.code, 401, '无钩子时 401 原样 reject,code=401');
  }
  assertEqual(rejected, true, '无钩子时 401 进入 catch');
  assertEqual(queue.length, 1, '无钩子时不会触发重登(auth/login 未被消费)');

  // 7. login() 云函数业务错误(如 500) → 抛错
  auth.logout();
  queue = [{ code: 500, message: '服务异常' }];
  let loginThrew = false;
  try {
    await auth.login();
  } catch (e) {
    loginThrew = true;
    assertEqual(e.code, 500, 'login 时云函数 500 → 抛 code=500');
  }
  assertEqual(loginThrew, true, 'login 业务错误会抛异常');

  // 8. wx.login 失败 → login 抛错
  loginShouldFail = true;
  let wxLoginThrew = false;
  try {
    await auth.login();
  } catch (e) {
    wxLoginThrew = true;
  }
  assertEqual(wxLoginThrew, true, 'wx.login 失败 → login 抛错');
  loginShouldFail = false;

  // 9. logout 清缓存
  auth.logout();
  assertEqual(auth.getToken(), '', 'logout 后 token 清空');
  assertEqual(auth.getUserInfo(), null, 'logout 后 user 清空');
  assertEqual(auth.isLoggedIn(), false, 'logout 后 isLoggedIn=false');

  // ---------- 汇总 ----------
  console.log(`\nauth.test.js: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
