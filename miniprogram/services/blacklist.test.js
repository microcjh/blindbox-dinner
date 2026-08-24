/**
 * services/blacklist.test.js — blacklist 业务层离线单测(Node 环境 mock wx)
 * 运行: node blacklist.test.js  (由 package.json test / scripts/test-all.sh 调用)
 *
 * 覆盖: reportBlacklist / listMyBlacklist 的
 *   - 云函数名 + action 分发正确
 *   - 参数透传(target / reason / loading 默认)
 *   - 成功结果解析(回传 data)
 */
const assert = require('assert');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log('  ✓', msg); }
  else { failed += 1; console.error('  ✗', msg); }
}

let queue = [];
let lastCall = null;
let showLoadingCalls = 0;
const store = {};

function installWx() {
  queue = [];
  lastCall = null;
  showLoadingCalls = 0;
  global.wx = {
    cloud: {
      callFunction(opts) {
        lastCall = opts;
        const r = queue.shift() || { code: 0, data: {} };
        if (opts.success) opts.success({ result: r });
      },
    },
    getStorageSync: (k) => (k in store ? store[k] : ''),
    setStorageSync: (k, v) => { store[k] = v; },
    removeStorageSync: (k) => { delete store[k]; },
    showLoading: () => { showLoadingCalls += 1; },
    hideLoading: () => {},
    showToast: () => {},
  };
}

const blacklist = require('./blacklist');

async function run() {
  // 1) reportBlacklist: 透传参数 + action=report + 默认 loading
  installWx();
  queue = [{ code: 0, data: { id: 'bl_1', status: 'pending', target: 'u_target' } }];
  const r = await blacklist.reportBlacklist({ target: 'u_target', reason: '冒犯', detail: '饭局中打断他人' });
  ok(lastCall && lastCall.name === 'blacklist', 'reportBlacklist 调 blacklist 云函数');
  ok(lastCall.data.action === 'report', 'reportBlacklist action=report');
  ok(lastCall.data.target === 'u_target', 'reportBlacklist 透传 target');
  ok(lastCall.data.reason === '冒犯', 'reportBlacklist 透传 reason');
  ok(showLoadingCalls === 1, 'reportBlacklist 走默认 loading（showLoading 被调用）');
  ok(r && r.id === 'bl_1', 'reportBlacklist 解析返回 id');

  // 2) listMyBlacklist: 浏览类 → loading:false
  installWx();
  queue = [{ code: 0, data: { reported_by_me: [{ id: 'bl_1' }], reported_about_me: [], total: 1 } }];
  const m = await blacklist.listMyBlacklist();
  ok(lastCall.data.action === 'list', 'listMyBlacklist action=list');
  ok(showLoadingCalls === 0, 'listMyBlacklist loading:false（不调用 showLoading）');
  ok(m && m.total === 1, 'listMyBlacklist 解析返回 total');

  console.log(`\nblacklist.test.js: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('\n❌ 单测异常:', err.message);
  process.exit(1);
});
