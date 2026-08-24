/**
 * services/refund.test.js — refund 业务层离线单测(Node 环境 mock wx)
 * 运行: node refund.test.js  (由 package.json test / scripts/test-all.sh 调用)
 *
 * 覆盖: applyRefund / queryRefund 的
 *   - 云函数名 + action 分发正确
 *   - 参数透传(event_id / registration_id / loading 默认)
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
    showLoading() { showLoadingCalls += 1; },
    hideLoading() {},
  };
}

// 每次 require 前重置 mock，避免污染
function loadService() {
  delete require.cache[require.resolve('./refund')];
  delete require.cache[require.resolve('../utils/request')];
  return require('./refund');
}

async function run() {
  // ---- applyRefund 正常 ----
  installWx();
  queue.push({ code: 0, data: { devStub: true, refundId: 'R1', amount: 88 } });
  {
    const svc = loadService();
    const r = await svc.applyRefund('e1');
    assert.strictEqual(lastCall.name, 'refund');
    assert.strictEqual(lastCall.data.action, 'apply');
    assert.strictEqual(lastCall.data.event_id, 'e1');
    // 写操作默认 loading → showLoading 被调用
    assert.strictEqual(showLoadingCalls, 1);
    assert.strictEqual(r.devStub, true);
    assert.strictEqual(r.refundId, 'R1');
    ok('applyRefund 正常 → name/action/event_id 正确 + 默认 loading');
  }

  // ---- applyRefund 幂等返回 ----
  installWx();
  queue.push({ code: 0, data: { duplicated: true, refund: { _id: 'rf1' } } });
  {
    const svc = loadService();
    const r = await svc.applyRefund('e1');
    assert.strictEqual(r.duplicated, true);
    ok('applyRefund 幂等 → 透传 duplicated');
  }

  // ---- applyRefund 缺参抛错 ----
  installWx();
  {
    const svc = loadService();
    let threw = false;
    try { await svc.applyRefund(''); } catch (e) { threw = true; assert.strictEqual(e.code, 400); }
    assert.strictEqual(threw, true);
    ok('applyRefund 缺 event_id → 抛 400');
  }

  // ---- queryRefund 正常（浏览类 loading:false） ----
  installWx();
  queue.push({ code: 0, data: { list: [{ _id: 'rf1', status: 'success' }], total: 1 } });
  {
    const svc = loadService();
    const r = await svc.queryRefund('r1');
    assert.strictEqual(lastCall.name, 'refund');
    assert.strictEqual(lastCall.data.action, 'query');
    assert.strictEqual(lastCall.data.registration_id, 'r1');
    assert.strictEqual(showLoadingCalls, 0); // 浏览类不盖 loading
    assert.strictEqual(r.list.length, 1);
    assert.strictEqual(r.total, 1);
    ok('queryRefund 正常 → loading:false + 列表透传');
  }

  // ---- queryRefund 缺参返回空 ----
  installWx();
  {
    const svc = loadService();
    const r = await svc.queryRefund('');
    assert.strictEqual(r.list.length, 0);
    assert.strictEqual(r.total, 0);
    ok('queryRefund 缺 registration_id → 返回空列表');
  }

  if (failed > 0) {
    console.error(`\nrefund 门面单测: ${failed} 项失败`);
    process.exit(1);
  }
  console.log(`\nrefund 门面单测: ${passed} 项全部通过 ✓`);
}

run().catch((e) => { console.error('单测异常:', e); process.exit(1); });
