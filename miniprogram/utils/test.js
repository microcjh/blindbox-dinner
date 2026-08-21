/**
 * utils/test.js — request.js 离线单测(Node 环境,无微信 SDK)
 * 通过注入 global.wx mock 模拟小程序运行时,CI 与本地共用。
 */
const assert = require('assert');

// ---- 注入微信运行时 mock ----
function makeWx(behavior) {
  return {
    getStorageSync: () => 'mock-token',
    setStorageSync: () => {},
    showLoading: () => {},
    hideLoading: () => {},
    showToast: () => {},
    cloud: {
      callFunction: (opts) => behavior(opts),
    },
  };
}

const { callFunction, interpretResult, setUnauthorizedHandler, ERROR_MESSAGES } = require('./request');

async function run() {
  let pass = 0;
  const ok = (name) => { pass += 1; console.log('  ✓', name); };

  // 1. interpretResult 成功
  assert.deepStrictEqual(interpretResult({ code: 0, data: { a: 1 } }), { ok: true, data: { a: 1 } });
  ok('interpretResult 成功返回 data');

  // 2. interpretResult 业务错误码映射
  assert.strictEqual(interpretResult({ code: 401 }).error.code, 401);
  assert.strictEqual(interpretResult({ code: 401 }).error.message, ERROR_MESSAGES[401]);
  ok('interpretResult 401 映射文案');

  // 3. interpretResult 未知错误码 fallback
  assert.strictEqual(interpretResult({ code: 999 }).error.message, '未知错误');
  ok('interpretResult 未知码 fallback');

  // 4. interpretResult 异常结构防御
  assert.strictEqual(interpretResult(null).ok, false);
  assert.strictEqual(interpretResult('bad').ok, false);
  ok('interpretResult 非对象防御');

  // 5. callFunction 成功路径(注入 token + action)
  global.wx = makeWx((opts) => {
    assert.strictEqual(opts.data.token, 'mock-token');
    assert.strictEqual(opts.data.action, 'echo');
    opts.success({ result: { code: 0, message: 'ok', data: { echo: 'hi' } } });
  });
  const r1 = await callFunction({ name: 'quickstart', action: 'echo' });
  assert.strictEqual(r1.echo, 'hi');
  ok('callFunction 成功注入 token+action 并返回 data');

  // 6. callFunction 业务失败路径(reject 且带 code)
  global.wx = makeWx((opts) => opts.success({ result: { code: 404, message: 'not found' } }));
  let rejected = false;
  try {
    await callFunction({ name: 'events', action: 'list' });
  } catch (e) {
    rejected = true;
    assert.strictEqual(e.code, 404);
    assert.strictEqual(e.message, 'not found');
  }
  assert.strictEqual(rejected, true);
  ok('callFunction 业务错误 reject 并携带 code/message');

  // 7. callFunction 网络失败路径(code=-1)
  global.wx = makeWx((opts) => opts.fail({ errMsg: 'request:fail' }));
  let netErr = false;
  try {
    await callFunction({ name: 'events' });
  } catch (e) {
    netErr = true;
    assert.strictEqual(e.code, -1);
  }
  assert.strictEqual(netErr, true);
  ok('callFunction 网络失败 reject code=-1');

  // 8. callFunction 401 触发重登并重发一次
  let callCount = 0;
  let reloginCalled = false;
  global.wx = makeWx((opts) => {
    callCount += 1;
    if (callCount === 1) {
      opts.success({ result: { code: 401, message: 'unauthorized' } });
    } else {
      opts.success({ result: { code: 0, message: 'ok', data: { ok: true } } });
    }
  });
  setUnauthorizedHandler(() => {
    reloginCalled = true;
    return Promise.resolve();
  });
  const r8 = await callFunction({ name: 'me', action: 'profile' });
  assert.strictEqual(reloginCalled, true);
  assert.strictEqual(callCount, 2);
  assert.strictEqual(r8.ok, true);
  ok('callFunction 401 触发重登并重发一次');

  // 9. 401 但无 handler 时不重登,直接 reject
  setUnauthorizedHandler(null);
  callCount = 0;
  global.wx = makeWx((opts) => { callCount += 1; opts.success({ result: { code: 401 } }); });
  let noRetry = false;
  try {
    await callFunction({ name: 'me' });
  } catch (e) {
    noRetry = true;
    assert.strictEqual(e.code, 401);
  }
  assert.strictEqual(callCount, 1);
  assert.strictEqual(noRetry, true);
  ok('callFunction 无 handler 时 401 不重登');

  // 10. 缺少云函数名直接 reject
  let noName = false;
  try {
    await callFunction({});
  } catch (e) {
    noName = true;
    assert.strictEqual(e.code, -1);
  }
  assert.strictEqual(noName, true);
  ok('callFunction 缺 name 直接 reject');

  console.log(`\nAll ${pass} tests passed.`);
}

run().catch((e) => {
  console.error('TEST FAILED:', e && e.message ? e.message : e);
  process.exit(1);
});
