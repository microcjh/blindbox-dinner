/**
 * services/payment.test.js — payment 业务层离线单测(Node 环境 mock wx)
 * 运行: node payment.test.js  (由 package.json test / scripts/test-all.sh 调用)
 *
 * 覆盖:createPrepay / pay / queryStatus 的
 *   - 云函数名 + action 分发正确
 *   - 参数透传(event_id + token 自动注入)
 *   - devStub / prepay 解析
 *   - pay():dev 占位直接 resolve；真实 prepay 调 wx.requestPayment 并成功
 *   - queryStatus 解析 { status }
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
let requestPaymentCalls = [];
const store = {};

function installWx() {
  queue = [];
  lastCall = null;
  requestPaymentCalls = [];
  global.wx = {
    cloud: {
      callFunction({ name, data, success }) {
        lastCall = { name, data };
        const r = queue.shift() || { code: 0, data: {} };
        success({ result: r });
      },
    },
    requestPayment: (params) => {
      requestPaymentCalls.push(params);
      // 模拟用户支付成功
      if (params && typeof params.success === 'function') params.success();
    },
    getStorageSync: (k) => (k in store ? store[k] : ''),
    setStorageSync: (k, v) => { store[k] = v; },
    removeStorageSync: (k) => { delete store[k]; },
    showLoading: () => {},
    hideLoading: () => {},
    showToast: () => {},
  };
}

const payment = require('./payment');

async function run() {
  // 1. createPrepay: devStub 占位（开发期未配置商户号）
  installWx();
  store.token = 'tok-p';
  queue = [{ code: 0, data: { devStub: true, outTradeNo: 'BBD-1', amount: 49 } }];
  const prepayDev = await payment.createPrepay('e_pay');
  ok(lastCall.name === 'payment' && lastCall.data.action === 'create', 'createPrepay 调 payment 云函数 action=create');
  ok(lastCall.data.event_id === 'e_pay' && lastCall.data.token === 'tok-p', 'createPrepay 透传 event_id + token');
  ok(prepayDev.devStub === true && prepayDev.outTradeNo === 'BBD-1', 'createPrepay 解析 devStub 占位');

  // 2. createPrepay: 真实 prepay
  installWx();
  queue = [{ code: 0, data: { devStub: false, outTradeNo: 'BBD-2', prepay: { nonceStr: 'n', package: 'prepay_id=x', paySign: 's', signType: 'MD5', timeStamp: '123' } } }];
  const prepayReal = await payment.createPrepay('e_pay');
  ok(prepayReal.devStub === false && prepayReal.prepay && prepayReal.prepay.package === 'prepay_id=x', 'createPrepay 解析真实 prepay');

  // 3. pay(): dev 占位 → 直接 resolve success,不调 requestPayment
  installWx();
  const rDev = await payment.pay(prepayDev);
  ok(rDev.success === true && rDev.devStub === true, 'pay(devStub) 直接成功,不弹收银台');
  ok(requestPaymentCalls.length === 0, 'pay(devStub) 未调用 wx.requestPayment');

  // 4. pay(): 真实 prepay → 调 requestPayment 且成功
  installWx();
  const rReal = await payment.pay(prepayReal);
  ok(rReal.success === true, 'pay(真实 prepay) 调起并成功');
  ok(requestPaymentCalls.length === 1, 'pay(真实 prepay) 调用了 wx.requestPayment');
  ok(requestPaymentCalls[0].package === 'prepay_id=x' && requestPaymentCalls[0].paySign === 's', 'pay(真实 prepay) 透传 prepay 参数');

  // 5. queryStatus: 解析 { status }
  installWx();
  queue = [{ code: 0, data: { status: 'paid' } }];
  const q = await payment.queryStatus('e_pay');
  ok(lastCall.name === 'payment' && lastCall.data.action === 'query', 'queryStatus 调 payment 云函数 action=query');
  ok(q.status === 'paid', 'queryStatus 解析 status=paid');

  // 6. pay(): 无参数 → 直接成功(dev)
  installWx();
  const rNone = await payment.pay(null);
  ok(rNone.success === true, 'pay(null) 直接成功(防御)');

  console.log(`\npayment.test.js: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => { console.error('FATAL', e); process.exit(1); });
