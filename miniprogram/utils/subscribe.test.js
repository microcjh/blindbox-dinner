/**
 * utils/subscribe.test.js — 离线单测(mock wx,不依赖微信运行时)
 * 运行: node subscribe.test.js
 */
const assert = require('assert');
const mod = require('./subscribe.js');

// ---- 内存 storage + wx mock 工厂 ----
function makeWx(responder) {
  const store = {};
  const wx = {
    _store: store,
    getStorageSync: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : ''),
    setStorageSync: (k, v) => {
      store[k] = v;
    },
    removeStorageSync: (k) => {
      delete store[k];
    },
    requestSubscribeMessage: (opts) => responder(opts),
  };
  return wx;
}

function setWx(wx) {
  global.wx = wx;
}
function clearWx() {
  delete global.wx;
}

const acceptAll = () => (opts) => {
  const res = {};
  opts.tmplIds.forEach((id) => {
    res[id] = 'accept';
  });
  opts.success(res);
};
const rejectOne = (rejectId) => (opts) => {
  const res = {};
  opts.tmplIds.forEach((id) => {
    res[id] = id === rejectId ? 'reject' : 'accept';
  });
  opts.success(res);
};
const ban = () => (opts) => opts.fail({ errCode: 20004, errMsg: 'requestSubscribeMessage:fail 20004' });
const failWith = (code) => (opts) => opts.fail({ errCode: code, errMsg: 'requestSubscribeMessage:fail ' + code });

let passed = 0;
let failed = 0;
function ok(name) {
  passed += 1;
  console.log('  \u2713 ' + name);
}
function bad(name, err) {
  failed += 1;
  console.error('  \u2717 ' + name + ' :: ' + (err && err.message));
}

async function run() {
  // T1 接受全部
  try {
    setWx(makeWx(acceptAll()));
    const r = await mod.requestSubscribe(['enroll_success', 'match_success']);
    assert.deepStrictEqual(r.accepted.sort(), ['enroll_success', 'match_success']);
    assert.strictEqual(r.banned, false);
    assert.strictEqual(mod.isGranted('enroll_success'), true);
    ok('T1 接受全部:accepted 完整且缓存 granted');
  } catch (e) {
    bad('T1 接受全部', e);
  }

  // T2 部分拒绝
  try {
    const rejectId = mod.TEMPLATES.match_success;
    setWx(makeWx(rejectOne(rejectId)));
    const r = await mod.requestSubscribe(['enroll_success', 'match_success']);
    assert.deepStrictEqual(r.accepted, ['enroll_success']);
    assert.deepStrictEqual(r.rejected, ['match_success']);
    assert.strictEqual(mod.isGranted('match_success'), false);
    ok('T2 部分拒绝:accepted/rejected 正确且 rejected 不缓存');
  } catch (e) {
    bad('T2 部分拒绝', e);
  }

  // T3 用户 ban(不再询问)
  try {
    setWx(makeWx(ban()));
    const r = await mod.requestSubscribe(['enroll_success']);
    assert.strictEqual(r.banned, true);
    assert.deepStrictEqual(r.accepted, []);
    assert.strictEqual(r.banned && typeof r.error === 'object', true);
    ok('T3 ban:返回 banned=true 且不抛错');
  } catch (e) {
    bad('T3 ban', e);
  }

  // T4 空/无效 key 不触碰 wx
  try {
    let called = false;
    setWx(makeWx(() => { called = true; }));
    const r = await mod.requestSubscribe(['nonexistent_key']);
    assert.strictEqual(called, false);
    assert.deepStrictEqual(r.accepted, []);
    ok('T4 无效 key:不调 wx 直接返回空结果');
  } catch (e) {
    bad('T4 无效 key', e);
  }

  // T5 isGranted / getGrantedKeys
  try {
    setWx(makeWx(acceptAll()));
    await mod.requestSubscribe(['meal_reminder']);
    assert.strictEqual(mod.isGranted('meal_reminder'), true);
    assert.ok(mod.getGrantedKeys().includes('meal_reminder'));
    ok('T5 isGranted/getGrantedKeys 正确');
  } catch (e) {
    bad('T5 isGranted', e);
  }

  // T6 clearGranted 清缓存
  try {
    setWx(makeWx(acceptAll()));
    await mod.requestSubscribe(['review_reminder']);
    assert.strictEqual(mod.isGranted('review_reminder'), true);
    mod.clearGranted();
    assert.strictEqual(mod.isGranted('review_reminder'), false);
    ok('T6 clearGranted 清除授权缓存');
  } catch (e) {
    bad('T6 clearGranted', e);
  }

  // T7 非小程序环境(wx 未定义)降级
  try {
    clearWx();
    const r = await mod.requestSubscribe(['enroll_success']);
    assert.deepStrictEqual(r.accepted, []);
    assert.strictEqual(r.banned, false);
    ok('T7 无 wx 环境:不抛错,返回空结果');
  } catch (e) {
    bad('T7 无 wx 环境', e);
  }

  // T8 同一实例跨调用持久化(合并 granted)
  try {
    const wx = makeWx(acceptAll());
    setWx(wx);
    await mod.requestSubscribe(['enroll_success']);
    await mod.requestSubscribe(['match_success']);
    assert.strictEqual(mod.isGranted('enroll_success'), true);
    assert.strictEqual(mod.isGranted('match_success'), true);
    assert.deepStrictEqual(mod.getGrantedKeys().sort(), ['enroll_success', 'match_success']);
    ok('T8 跨调用合并授权状态');
  } catch (e) {
    bad('T8 跨调用持久化', e);
  }

  // T9 requestScene 单键便捷封装
  try {
    setWx(makeWx(acceptAll()));
    const r = await mod.requestScene('sos_alert');
    assert.deepStrictEqual(r.accepted, ['sos_alert']);
    ok('T9 requestScene 单键封装正常');
  } catch (e) {
    bad('T9 requestScene', e);
  }

  // T10 先 reject 后改主意 accept:状态可被更新为 true
  try {
    const wx1 = makeWx(rejectOne(mod.TEMPLATES.match_success));
    setWx(wx1);
    await mod.requestSubscribe(['enroll_success', 'match_success']);
    assert.strictEqual(mod.isGranted('match_success'), false);
    setWx(makeWx(acceptAll()));
    await mod.requestSubscribe(['match_success']);
    assert.strictEqual(mod.isGranted('match_success'), true);
    ok('T10 二次接受可把 rejected 更新为 granted');
  } catch (e) {
    bad('T10 状态更新', e);
  }

  console.log('\n订阅消息单测: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
}

run();
