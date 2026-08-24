/**
 * services/sos.test.js — sos 业务层离线单测(Node 环境 mock wx)
 * 运行: node sos.test.js
 *
 * 覆盖: createSos / querySos / mySos 的
 *   - 云函数名 + action 分发正确
 *   - 参数透传(event_id / type / desc / location)
 *   - 浏览类 loading:false 语义（不调 showLoading）
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
  };
}

async function run() {
  installWx();

  // 1) createSos 分发 + 参数透传 + loading 默认
  {
    queue.push({ code: 0, data: { sos: { id: 's1', status: 'pending' } } });
    const r = await require('./sos').createSos({ eventId: 'e1', type: 'unsafe', desc: 'help', location: { lng: 1, lat: 2 } });
    assert.strictEqual(lastCall.name, 'sos');
    assert.strictEqual(lastCall.data.action, 'create');
    assert.strictEqual(lastCall.data.event_id, 'e1');
    assert.strictEqual(lastCall.data.type, 'unsafe');
    assert.strictEqual(lastCall.data.desc, 'help');
    assert.strictEqual(lastCall.data.location.lng, 1);
    assert.strictEqual(r.sos.id, 's1');
    ok(true, 'createSos 分发/参数透传/结果解析');
  }

  // 2) querySos 浏览类 loading:false 语义（不额外触发 showLoading）
  {
    const before = showLoadingCalls;
    queue.push({ code: 0, data: { sos: { id: 's1' } } });
    const r = await require('./sos').querySos('s1');
    assert.strictEqual(lastCall.name, 'sos');
    assert.strictEqual(lastCall.data.action, 'query');
    assert.strictEqual(lastCall.data.id, 's1');
    assert.strictEqual(showLoadingCalls, before, 'querySos 不应触发 showLoading');
    assert.strictEqual(r.sos.id, 's1');
    ok(true, 'querySos 分发/浏览类 loading 语义');
  }

  // 3) mySos 浏览类
  {
    const before = showLoadingCalls;
    queue.push({ code: 0, data: { list: [{ id: 's1' }, { id: 's2' }], total: 2 } });
    const r = await require('./sos').mySos();
    assert.strictEqual(lastCall.name, 'sos');
    assert.strictEqual(lastCall.data.action, 'mine');
    assert.strictEqual(showLoadingCalls, before, 'mySos 不应触发 showLoading');
    assert.strictEqual(r.list.length, 2);
    assert.strictEqual(r.total, 2);
    ok(true, 'mySos 分发/列表解析');
  }

  if (failed > 0) {
    console.error(`\nsos 门面单测失败：${failed} 项`);
    process.exit(1);
  }
  console.log(`\nsos 门面单测通过：${passed} 项`);
}

run().catch((e) => {
  console.error('sos 门面单测异常：', e.message);
  process.exit(1);
});
