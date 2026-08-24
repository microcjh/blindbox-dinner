/**
 * services/match.test.js — match 业务层离线单测(Node 环境 mock wx)
 * 运行: node match.test.js  (由 package.json test / scripts/test-all.sh 调用)
 *
 * 覆盖: runMatch / myMatches 的
 *   - 云函数名 + action 分发正确
 *   - 参数透传(event_id / loading 默认)
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

const match = require('./match');

async function run() {
  // 1) runMatch: 透传 event_id + action=run + 默认 loading
  installWx();
  queue = [{ code: 0, data: { match: { id: 'mg_1', member_count: 4 }, member_count: 4 } }];
  const r = await match.runMatch('e_123');
  ok(lastCall && lastCall.name === 'match', 'runMatch 调 match 云函数');
  ok(lastCall.data.action === 'run', 'runMatch action=run');
  ok(lastCall.data.event_id === 'e_123', 'runMatch 透传 event_id');
  ok(showLoadingCalls === 1, 'runMatch 走默认 loading（showLoading 被调用）');
  ok(r && r.member_count === 4, 'runMatch 解析返回 member_count');

  // 2) myMatches: 浏览类 → loading:false
  installWx();
  queue = [{ code: 0, data: { list: [{ id: 'mg_1', members: ['u1'] }], total: 1 } }];
  const m = await match.myMatches();
  ok(lastCall.data.action === 'myMatches', 'myMatches action=myMatches');
  ok(showLoadingCalls === 0, 'myMatches loading:false（不调用 showLoading）');
  ok(m && m.total === 1, 'myMatches 解析返回 total');

  console.log(`\nmatch.test.js: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('\n❌ 单测异常:', err.message);
  process.exit(1);
});
