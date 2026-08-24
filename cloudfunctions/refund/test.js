// cloudfunctions/refund/test.js — refund 云函数单测
// 运行: node test.js（CI 由 scripts/test-all.sh 统一驱动）
const assert = require('assert');
const path = require('path');
const Module = require('module');

// 重定向 wx-server-sdk → 本地 mock（同 match/blacklist 范式）
const mockPath = path.join(__dirname, '__mocks__', 'wx-server-sdk.js');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'wx-server-sdk') return mockPath;
  return origResolve.call(this, request, ...args);
};
const mock = require('wx-server-sdk');
const main = require('./index').main;
const { signToken } = require(path.join(__dirname, '..', 'common', 'session'));

// 生成合法令牌（uid 默认 u1）
function tokenOf(uid = 'u1') {
  return signToken({ openid: `o_${uid}`, uid });
}

function setStore(name, data) { mock.__setStore(name, data); }
function reset() { mock.__reset(); delete process.env.WXPAY_SUB_MCH_ID; }

let passed = 0;
function ok(name) { passed += 1; console.log(`  ✓ ${name}`); }

async function run() {
  // ---- 401 未登录 ----
  reset();
  setStore('registrations', []);
  {
    const r = await main({ action: 'apply', event_id: 'e1' });
    assert.strictEqual(r.code, 401);
    ok('apply 未登录 → 401');
  }

  // ---- 400 缺 event_id ----
  {
    const r = await main({ action: 'apply', token: tokenOf(), event_id: '' });
    assert.strictEqual(r.code, 400);
    ok('apply 缺 event_id → 400');
  }

  // ---- 404 无报名 ----
  reset();
  setStore('registrations', []);
  {
    const r = await main({ action: 'apply', token: tokenOf(), event_id: 'e1' });
    assert.strictEqual(r.code, 404);
    ok('apply 无报名 → 404');
  }

  // ---- 409 pending（应走取消报名） ----
  reset();
  setStore('registrations', [{ _id: 'r1', user_id: 'u1', event_id: 'e1', status: 'pending' }]);
  {
    const r = await main({ action: 'apply', token: tokenOf(), event_id: 'e1' });
    assert.strictEqual(r.code, 409);
    assert.match(r.message, /取消/);
    ok('apply pending → 409（提示走取消报名）');
  }

  // ---- 409 已退款（幂等保护） ----
  reset();
  setStore('registrations', [{ _id: 'r1', user_id: 'u1', event_id: 'e1', status: 'refunded' }]);
  setStore('refunds', [{ _id: 'rf1', reg_id: 'r1', user_id: 'u1', event_id: 'e1', status: 'success' }]);
  {
    const r = await main({ action: 'apply', token: tokenOf(), event_id: 'e1' });
    assert.strictEqual(r.code, 409);
    assert.match(r.message, /已退款/);
    ok('apply 已退款 → 409');
  }

  // ---- 409 无支付记录（paid 但 payments 无 transaction_id） ----
  reset();
  setStore('registrations', [{ _id: 'r1', user_id: 'u1', event_id: 'e1', status: 'paid' }]);
  setStore('payments', []);
  {
    const r = await main({ action: 'apply', token: tokenOf(), event_id: 'e1' });
    assert.strictEqual(r.code, 409);
    ok('apply paid 但无支付记录 → 409');
  }

  // ---- 409 支付未完成（无 transaction_id） ----
  reset();
  setStore('registrations', [{ _id: 'r1', user_id: 'u1', event_id: 'e1', status: 'paid' }]);
  setStore('payments', [{ _id: 'p1', reg_id: 'r1', user_id: 'u1', event_id: 'e1', amount: 88, status: 'paid' }]);
  {
    const r = await main({ action: 'apply', token: tokenOf(), event_id: 'e1' });
    assert.strictEqual(r.code, 409);
    ok('apply 支付未完成（无 transaction_id）→ 409');
  }

  // ---- 成功：devStub 占位退款 ----
  reset();
  setStore('registrations', [{ _id: 'r1', user_id: 'u1', event_id: 'e1', status: 'paid' }]);
  setStore('payments', [{ _id: 'p1', reg_id: 'r1', user_id: 'u1', event_id: 'e1', amount: 88, status: 'paid', transaction_id: 'T123', out_trade_no: 'OT1' }]);
  setStore('refunds', []);
  {
    const r = await main({ action: 'apply', token: tokenOf(), event_id: 'e1' });
    assert.strictEqual(r.code, 0);
    assert.strictEqual(r.data.devStub, true);
    assert.strictEqual(r.data.amount, 88);
    // 验证落 refunds + 翻转 registrations
    const refunds = mock.__getStore('refunds');
    assert.strictEqual(refunds.length, 1);
    assert.strictEqual(refunds[0].status, 'success');
    const regs = mock.__getStore('registrations');
    assert.strictEqual(regs[0].status, 'refunded');
    ok('apply 成功（devStub）→ 落 refunds + registrations 翻 refunded');
  }

  // ---- 幂等：重复申请返回既有单 ----
  reset();
  setStore('registrations', [{ _id: 'r1', user_id: 'u1', event_id: 'e1', status: 'paid' }]);
  setStore('payments', [{ _id: 'p1', reg_id: 'r1', user_id: 'u1', event_id: 'e1', amount: 88, status: 'paid', transaction_id: 'T123', out_trade_no: 'OT1' }]);
  setStore('refunds', [{ _id: 'rf0', reg_id: 'r1', user_id: 'u1', event_id: 'e1', status: 'success' }]);
  {
    const r = await main({ action: 'apply', token: tokenOf(), event_id: 'e1' });
    assert.strictEqual(r.code, 0);
    assert.strictEqual(r.data.duplicated, true);
    const refunds = mock.__getStore('refunds');
    assert.strictEqual(refunds.length, 1); // 不新增
    ok('apply 幂等 → 返回既有退款单，不重复退');
  }

  // ---- query 401 ----
  reset();
  {
    const r = await main({ action: 'query', registration_id: 'r1' });
    assert.strictEqual(r.code, 401);
    ok('query 未登录 → 401');
  }

  // ---- query 400 缺 registration_id ----
  {
    const r = await main({ action: 'query', token: tokenOf(), registration_id: '' });
    assert.strictEqual(r.code, 400);
    ok('query 缺 registration_id → 400');
  }

  // ---- query 成功返回列表 ----
  reset();
  setStore('refunds', [
    { _id: 'rf1', reg_id: 'r1', user_id: 'u1', status: 'success', amount: 88 },
    { _id: 'rf2', reg_id: 'r2', user_id: 'u1', status: 'pending', amount: 50 },
  ]);
  {
    const r = await main({ action: 'query', token: tokenOf(), registration_id: 'r1' });
    assert.strictEqual(r.code, 0);
    assert.strictEqual(r.data.list.length, 1);
    assert.strictEqual(r.data.list[0]._id, 'rf1');
    ok('query 成功 → 返回该报名退款单');
  }

  console.log(`\nrefund 云函数单测: ${passed} 项全部通过 ✓`);
}

run().catch((e) => { console.error('单测失败:', e); process.exit(1); });
