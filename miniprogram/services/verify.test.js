/**
 * services/verify.test.js — verify 业务层离线单测(Node 环境 mock wx)
 * 运行: node verify.test.js  (由 package.json test / scripts/test-all.sh 调用)
 */
const assert = require('assert');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log('  ✓', msg); }
  else { failed += 1; console.error('  ✗', msg); }
}

let queue = [];        // wx.cloud.callFunction 依次返回的 result.result
let lastCall = null;   // 最近一次 callFunction 的 data(用于参数透传断言)
const store = {};

function installWx(opts = {}) {
  queue = [];
  lastCall = null;
  global.wx = {
    cloud: {
      callFunction({ name, data, success }) {
        lastCall = { name, data };
        const r = queue.shift() || { code: 0, data: {} };
        success({ result: r });
      },
    },
    getStorageSync: (k) => (k in store ? store[k] : ''),
    setStorageSync: (k, v) => { store[k] = v; },
    removeStorageSync: (k) => { delete store[k]; },
    showLoading: () => {},
    hideLoading: () => {},
    showToast: () => {},
    startFacialRecognitionVerify: opts.faceVerify, // 不传则模拟「无核身能力」
  };
}

const verify = require('./verify');
const auth = require('../utils/auth');

async function run() {
  // 1. startFaceVerify:无核身能力 → dev 占位(不触真实计费)
  installWx();
  auth.logout();
  const devRes = await verify.startFaceVerify({ name: '张三', idCard: '11010119900307123X' });
  ok(devRes && devRes.__dev === true, '无核身能力时返回 dev 占位结果(__dev)');
  ok(devRes.errMsg === 'startFacialRecognitionVerify:ok', 'dev 占位 errMsg 为 ok');

  // 2. startFaceVerify:真机核身成功路径(透传 name/idCard)
  let captured = null;
  installWx({
    faceVerify: ({ name, idCard, success }) => {
      captured = { name, idCard };
      success({ errMsg: 'startFacialRecognitionVerify:ok', verifyResult: 'real-token-xyz' });
    },
  });
  const realRes = await verify.startFaceVerify({ name: '张三', idCard: '11010119900307123X' });
  ok(captured && captured.name === '张三' && captured.idCard === '11010119900307123X', '真机核身透传 name/idCard');
  ok(realRes.verifyResult === 'real-token-xyz', '真机核身返回 verifyResult');

  // 3. submit:成功 → 更新本地缓存 verified
  auth.logout();
  queue = [{ code: 0, data: { user: { id: 'u1', verified: true, nickName: '张三' } } }];
  const user = await verify.submit({ realName: '张三', idCard: '11010119900307123X', verifyResult: realRes });
  ok(user && user.verified === true, 'submit 成功返回 verified=true');
  ok(auth.isVerified() === true, 'submit 成功后本地缓存 isVerified=true');

  // 4. submit:参数透传(verify 云函数收到 action/realName/idCard/verifyResult/token)
  store.token = 'tok-x';
  queue = [{ code: 0, data: { user: { id: 'u1', verified: true } } }];
  await verify.submit({ realName: '李四', idCard: '31010119900101567X', verifyResult: { verifyResult: 'tk' } });
  ok(lastCall && lastCall.name === 'verify' && lastCall.data.action === 'submit', 'submit 调 verify 云函数 action=submit');
  ok(lastCall.data.realName === '李四' && lastCall.data.idCard === '31010119900101567X', 'submit 透传 realName/idCard');
  ok(lastCall.data.verifyResult && lastCall.data.verifyResult.verifyResult === 'tk', 'submit 透传 verifyResult');
  ok(lastCall.data.token === 'tok-x', 'submit 自动注入登录态 token');

  // 5. submit:云函数错误(403 核身未过)→ 抛错且不更新缓存
  auth.setUserInfo({ id: 'u1', verified: false });
  queue = [{ code: 403, message: '人脸核身未通过' }];
  let threw = false;
  try {
    await verify.submit({ realName: '李四', idCard: '31010119900101567X', verifyResult: {} });
  } catch (e) {
    threw = true;
    ok(e.code === 403, 'submit 核身未过抛 code=403');
  }
  ok(threw === true, 'submit 业务错误进入 catch');
  ok(auth.isVerified() === false, 'submit 失败不更新 verified 缓存');

  console.log(`\nverify.test.js: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => { console.error('FATAL', e); process.exit(1); });
