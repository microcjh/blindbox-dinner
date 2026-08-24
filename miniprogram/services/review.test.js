/**
 * services/review.test.js — review 业务层离线单测(Node 环境 mock wx)
 * 运行: node review.test.js  (由 package.json test / scripts/test-all.sh 调用)
 *
 * 覆盖: submitReview / listReviews 的
 *   - 云函数名 + action 分发正确
 *   - 参数透传(event_id / to_uid / score / loading 默认)
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

const review = require('./review');

async function run() {
  // 1) submitReview: 透传参数 + action=submit + 默认 loading
  installWx();
  queue = [{ code: 0, data: { id: 'rev_1', score: 5, to_uid: 'u_to' } }];
  const r = await review.submitReview({ eventId: 'e1', toUid: 'u_to', score: 5, tags: ['有趣'], comment: '好' });
  ok(lastCall && lastCall.name === 'review', 'submitReview 调 review 云函数');
  ok(lastCall.data.action === 'submit', 'submitReview action=submit');
  ok(lastCall.data.event_id === 'e1', 'submitReview 透传 event_id');
  ok(lastCall.data.to_uid === 'u_to', 'submitReview 透传 to_uid');
  ok(lastCall.data.score === 5, 'submitReview 透传 score');
  ok(showLoadingCalls === 1, 'submitReview 走默认 loading（showLoading 被调用）');
  ok(r && r.id === 'rev_1', 'submitReview 解析返回 id');

  // 2) listReviews: 浏览类 → loading:false
  installWx();
  queue = [{ code: 0, data: { list: [{ id: 'rev_1' }], total: 1 } }];
  const m = await review.listReviews('e1');
  ok(lastCall.data.action === 'list', 'listReviews action=list');
  ok(lastCall.data.event_id === 'e1', 'listReviews 透传 event_id');
  ok(showLoadingCalls === 0, 'listReviews loading:false（不调用 showLoading）');
  ok(m && m.total === 1, 'listReviews 解析返回 total');

  console.log(`\nreview.test.js: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('\n❌ 单测异常:', err.message);
  process.exit(1);
});
