// services/admin.test.js — admin 业务层离线单测(Node 环境 mock wx)
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

installWx();
const admin = require('./admin');

(async () => {
  console.log('admin 门面单测：');

  // 1) listReports 浏览类分发 + 不触发 showLoading
  {
    const before = showLoadingCalls;
    queue.push({ code: 0, data: { list: [{ id: 'bl1' }], total: 1 } });
    const r = await admin.listReports({ page: 1, pageSize: 10 });
    assert.strictEqual(lastCall.name, 'admin');
    assert.strictEqual(lastCall.data.action, 'listReports');
    assert.strictEqual(lastCall.data.page, 1);
    assert.strictEqual(lastCall.data.pageSize, 10);
    assert.strictEqual(showLoadingCalls, before, 'listReports 不触发 showLoading');
    assert.strictEqual(r.list.length, 1);
    ok(true, 'listReports 分发/浏览类 loading 语义');
  }

  // 2) handleReport 写操作分发 + 触发 showLoading
  {
    queue.push({ code: 0, data: { report: { id: 'bl1', status: 'banned' } } });
    const r = await admin.handleReport('bl1', 'banned', '证据充分');
    assert.strictEqual(lastCall.name, 'admin');
    assert.strictEqual(lastCall.data.action, 'handleReport');
    assert.strictEqual(lastCall.data.id, 'bl1');
    assert.strictEqual(lastCall.data.decision, 'banned');
    assert.strictEqual(lastCall.data.note, '证据充分');
    assert.strictEqual(showLoadingCalls, 1, 'handleReport 触发 showLoading');
    assert.strictEqual(r.report.status, 'banned');
    ok(true, 'handleReport 分发/写操作 loading 语义');
  }

  // 3) listSos 浏览类
  {
    const before = showLoadingCalls;
    queue.push({ code: 0, data: { list: [{ id: 's1' }], total: 1 } });
    const r = await admin.listSos();
    assert.strictEqual(lastCall.data.action, 'listSos');
    assert.strictEqual(showLoadingCalls, before, 'listSos 不触发 showLoading');
    assert.strictEqual(r.total, 1);
    ok(true, 'listSos 分发/列表解析');
  }

  // 4) handleSos 写操作
  {
    queue.push({ code: 0, data: { sos: { id: 's1', status: 'handled' } } });
    const r = await admin.handleSos('s1', '已联系');
    assert.strictEqual(lastCall.data.action, 'handleSos');
    assert.strictEqual(lastCall.data.id, 's1');
    assert.strictEqual(lastCall.data.note, '已联系');
    assert.strictEqual(r.sos.status, 'handled');
    ok(true, 'handleSos 分发/状态解析');
  }

  console.log(`\nadmin 门面: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
