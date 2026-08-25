// 单测：payment 云函数（create / notify / query）
// 运行：node test.js（无外部依赖；Module._resolveFilename 将 wx-server-sdk 重定向到 mock）
const assert = require('assert');
const Module = require('module');

// 将 wx-server-sdk 重定向到本地 mock
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  if (request === 'wx-server-sdk') {
    return require.resolve('./__mocks__/wx-server-sdk.js');
  }
  return origResolve.call(this, request, parent, ...args);
};

const cloud = require('wx-server-sdk');
const { signToken } = require('common/session');
const main = require('./index.js').main;

// 测试辅助
let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function makeUser(uid, opts = {}) {
  cloud.__store.users = cloud.__store.users || [];
  const u = { _id: uid, openid: `openid_${uid}`, verified: true, ...opts };
  const exist = cloud.__store.users.find((x) => x._id === uid);
  if (exist) Object.assign(exist, u);
  else cloud.__store.users.push(u);
  return u;
}

function makeEvent(evId, opts = {}) {
  cloud.__store.events = cloud.__store.events || [];
  const ev = { _id: evId, city: '北京', district: '朝阳区', restaurant_id: 'r1', time: new Date(Date.now() + 86400000).toISOString(), price: 49, capacity: 6, registered: 0, status: 'open', ...opts };
  const exist = cloud.__store.events.find((x) => x._id === evId);
  if (exist) Object.assign(exist, ev);
  else cloud.__store.events.push(ev);
  return ev;
}

function makeReg(uid, evId, opts = {}) {
  cloud.__store.registrations = cloud.__store.registrations || [];
  const reg = { _id: `reg_${uid}_${evId}`, user_id: uid, event_id: evId, status: 'pending', created_at: new Date().toISOString(), ...opts };
  cloud.__store.registrations.push(reg);
  return reg;
}

const uid = 'u_pay_1';
const token = signToken({ openid: 'mock-openid', uid });

async function run() {
  // 默认 dev 占位（未配置商户号）
  delete process.env.WXPAY_SUB_MCH_ID;

  // ===== create =====
  cloud.__reset();
  makeEvent('e_pay_1', { price: 49 });
  makeUser(uid, { verified: true });

  // 1) 未报名直接下单 → 404
  let r = await main({ action: 'create', token, event_id: 'e_pay_1' });
  ok(r.code === 404, '未报名直接下单返回 404');

  // 2) 已报名(pending) 下单 → devStub 占位（不调真实 unifiedOrder）
  makeReg(uid, 'e_pay_1');
  r = await main({ action: 'create', token, event_id: 'e_pay_1' });
  ok(r.code === 0, '已报名下单成功');
  ok(r.data && r.data.devStub === true, 'dev 模式返回 devStub 占位（不触真实计费）');
  ok(r.data && r.data.outTradeNo && r.data.outTradeNo.indexOf('BBD-') === 0, '返回商户订单号 out_trade_no');
  const payCreated = cloud.__store.payments.length === 1;
  ok(payCreated, '已建一条 payments(pending) 记录');
  ok(cloud.__callLog.unifiedOrder.length === 0, 'dev 模式未调用真实 unifiedOrder');

  // 3) 已支付报名再次下单 → 409
  cloud.__store.registrations.find((x) => x._id === `reg_${uid}_e_pay_1`).status = 'paid';
  r = await main({ action: 'create', token, event_id: 'e_pay_1' });
  ok(r.code === 409, '已支付报名再次下单返回 409');

  // 4) 缺令牌 / 缺 event_id → 401 / 400
  r = await main({ action: 'create', event_id: 'e_pay_1' });
  ok(r.code === 401, '缺令牌下单返回 401');
  r = await main({ action: 'create', token });
  ok(r.code === 400, '缺 event_id 下单返回 400');

  // 5) 真实下单路径（配置商户号）→ 返回 prepay 且调 unifiedOrder
  cloud.__reset();
  process.env.WXPAY_SUB_MCH_ID = 'mock_mch_123';
  makeEvent('e_pay_2', { price: 30 });
  makeUser(uid, { verified: true });
  makeReg(uid, 'e_pay_2');
  r = await main({ action: 'create', token, event_id: 'e_pay_2' });
  ok(r.code === 0 && r.data.devStub === false, '配置商户号后走真实下单分支');
  ok(r.data && r.data.prepay && r.data.prepay.package && r.data.prepay.paySign, '真实下单返回 prepay 参数');
  ok(cloud.__callLog.unifiedOrder.length === 1, '真实下单调用了 unifiedOrder');
  delete process.env.WXPAY_SUB_MCH_ID;

  // ===== notify =====
  cloud.__reset();
  makeEvent('e_pay_3', { price: 49 });
  makeUser(uid, { verified: true });
  const reg3 = makeReg(uid, 'e_pay_3');
  cloud.__store.payments.push({ _id: 'pay_3', reg_id: reg3._id, user_id: uid, event_id: 'e_pay_3', amount: 49, status: 'pending', out_trade_no: 'BBD-notify-3', created_at: new Date().toISOString() });

  // 6) 收到成功通知 → payments/registrations 翻 paid
  const notifyEvent = { returnCode: 'SUCCESS', resultCode: 'SUCCESS', outTradeNo: 'BBD-notify-3', transactionId: 'WXTXN-notify-3' };
  const res = await main(notifyEvent); // 无 action → 视为通知
  ok(res && res.returnCode === 'SUCCESS' && res.resultCode === 'SUCCESS', 'notify 回传 SUCCESS 给微信');
  const pay3 = cloud.__store.payments.find((x) => x._id === 'pay_3');
  ok(pay3.status === 'paid' && pay3.transaction_id === 'WXTXN-notify-3', 'payments 翻 paid + 记录 transaction_id');
  const reg3After = cloud.__store.registrations.find((x) => x._id === reg3._id);
  ok(reg3After.status === 'paid', 'registrations 翻 paid');

  // 7) 重复通知幂等 → 不报错，仍 SUCCESS
  const res2 = await main(notifyEvent);
  ok(res2 && res2.resultCode === 'SUCCESS', '重复通知仍返回 SUCCESS（幂等）');

  // 8) 非成功通知 → 原样回传（不翻转）
  const failEvent = { returnCode: 'FAIL', resultCode: 'FAIL', outTradeNo: 'BBD-notify-3' };
  const res3 = await main(failEvent);
  ok(res3 && res3.resultCode === 'FAIL', '非成功通知原样回传');
  ok(cloud.__store.payments.find((x) => x._id === 'pay_3').status === 'paid', '失败通知不重复翻转（保持 paid）');

  // ===== query =====
  cloud.__reset();
  makeEvent('e_pay_4', { price: 20 });
  makeUser(uid, { verified: true });
  makeReg(uid, 'e_pay_4', { status: 'paid' });

  // 9) query 返回当前支付态
  r = await main({ action: 'query', token, event_id: 'e_pay_4' });
  ok(r.code === 0 && r.data && r.data.status === 'paid', 'query 返回当前支付态 paid');
  // 10) 缺令牌 query → 401
  r = await main({ action: 'query', event_id: 'e_pay_4' });
  ok(r.code === 401, 'query 缺令牌返回 401');

  console.log(`\n✅ payment 单测全部通过：${passed} 项断言`);
}

run().catch((err) => {
  console.error('\n❌ 单测失败:', err.message);
  process.exit(1);
});
