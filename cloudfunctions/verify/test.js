// verify 云函数最小单元测试
// 不依赖真实云环境，用 __mocks__/wx-server-sdk.js 拦截 require('wx-server-sdk')，
// 并复用真实的 common/db / common/session / common/crypto / common/faceverify。
//
// 验收点：
//   - 未登录（无效令牌）→ 401
//   - 姓名非法 / 身份证非法 / 缺核身结果 → 400
//   - 人脸核身失败（verifyResult 过短）→ 403
//   - 实名成功 → code 0，verified=true，real_name 回填，身份证只存哈希（明文不落库），face_token 落库
//   - 公开档案剔除敏感字段（id_card_hash / openid / face_token 不下发）
//   - 重复实名 → 409
//   - crypto（isValidIdCard / hashIdCard 不可逆一致）+ faceverify（本地路径）单元
const assert = require('assert');
const path = require('path');

// ---- 拦截 wx-server-sdk 指向 mock ----
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
  if (req === 'wx-server-sdk') {
    return require.resolve('./__mocks__/wx-server-sdk.js');
  }
  return origResolve.call(this, req, parent, ...rest);
};

const cloud = require('wx-server-sdk');
const { signToken } = require('common/session');
const { isValidIdCard, hashIdCard } = require('common/crypto');
const { faceVerify } = require('common/faceverify');
const main = require('./index.js').main;

const SENSITIVE = ['openid', 'id_card_hash', 'face_token'];

function makeUser(uid, overrides = {}) {
  if (!cloud.__store.users) cloud.__store.users = [];
  cloud.__store.users.push({
    _id: uid,
    openid: 'mock-openid',
    phone: '',
    real_name: '',
    id_card_hash: '',
    face_token: '',
    gender: 0,
    age: 0,
    mbti: '',
    education: '',
    occupation: '',
    tags: [],
    verified: false,
    status: 'active',
    created_at: '2026-08-24T00:00:00.000Z',
    ...overrides,
  });
}

const ID = '11010119900307123X';
const VERIFY_RESULT = 'valid-verify-result-string-1234';

(async () => {
  cloud.__reset();

  // 0) crypto 单元
  assert.strictEqual(isValidIdCard(ID), true, '合法身份证应通过');
  assert.strictEqual(isValidIdCard('123'), false, '短串应不通过');
  assert.strictEqual(isValidIdCard('11010119900307123'), false, '17 位应不通过');
  const h1 = hashIdCard(ID);
  assert.strictEqual(h1, hashIdCard(ID), '同身份证哈希一致（幂等）');
  assert.notStrictEqual(h1, hashIdCard('110101199003071239'), '不同身份证哈希不同');
  assert.ok(/^[a-f0-9]{64}$/.test(h1), '哈希应为 64 位 hex');

  // 1) faceverify 本地路径（无 RuleId，不触真实计费）
  const fv = await faceVerify(VERIFY_RESULT);
  assert.strictEqual(fv.ok, true, '本地核身应通过');
  assert.ok(fv.face_token, '应返回 face_token');
  assert.strictEqual(
    fv.face_token,
    (await faceVerify(VERIFY_RESULT)).face_token,
    '同结果 face_token 稳定'
  );
  assert.strictEqual((await faceVerify('short')).ok, false, '过短核身结果应失败');

  // 2) 未登录：无效令牌 → 401
  let r = await main({
    action: 'submit',
    token: 'bad.token',
    real_name: '张三',
    id_card: ID,
    verifyResult: VERIFY_RESULT,
  });
  assert.strictEqual(r.code, 401, '无效令牌应返回 401');

  // 3) 准备一个已登录用户（未实名）
  const uid = 'u_verify_1';
  makeUser(uid);
  const token = signToken({ openid: 'mock-openid', uid });

  // 4) 姓名非法 → 400
  r = await main({ action: 'submit', token, real_name: 'A', id_card: ID, verifyResult: VERIFY_RESULT });
  assert.strictEqual(r.code, 400, '姓名过短应返回 400');

  // 5) 身份证非法 → 400
  r = await main({ action: 'submit', token, real_name: '张三', id_card: '123', verifyResult: VERIFY_RESULT });
  assert.strictEqual(r.code, 400, '身份证非法应返回 400');

  // 6) 缺核身结果 → 400
  r = await main({ action: 'submit', token, real_name: '张三', id_card: ID });
  assert.strictEqual(r.code, 400, '缺核身结果应返回 400');

  // 7) 核身失败（verifyResult 过短）→ 403
  r = await main({ action: 'submit', token, real_name: '张三', id_card: ID, verifyResult: 'short' });
  assert.strictEqual(r.code, 403, '人脸核身失败应返回 403');

  // 8) 实名成功 → 0，落库 verified + 哈希，公开档案脱敏
  r = await main({ action: 'submit', token, real_name: '张三', id_card: ID, verifyResult: VERIFY_RESULT });
  assert.strictEqual(r.code, 0, '实名成功应返回 code=0');
  assert.strictEqual(r.data.verified, true, 'verified 应为 true');
  assert.strictEqual(r.data.real_name, '张三', 'real_name 应回填');
  SENSITIVE.forEach((k) => {
    assert.ok(!(k in r.data), `公开档案不得下发敏感字段 ${k}`);
  });
  // 落库校验
  const rec = cloud.__store.users.find((u) => u._id === uid);
  assert.strictEqual(rec.verified, true, '落库 verified 应为 true');
  assert.strictEqual(rec.id_card_hash, hashIdCard(ID), '落库应为身份证哈希');
  assert.ok(rec.id_card_hash && rec.id_card_hash !== ID, '明文身份证不得落库');
  assert.strictEqual(rec.real_name, '张三', '落库 real_name 应为张三');
  assert.ok(rec.face_token, '落库应有 face_token');

  // 9) 重复实名 → 409
  r = await main({ action: 'submit', token, real_name: '张三', id_card: ID, verifyResult: VERIFY_RESULT });
  assert.strictEqual(r.code, 409, '已实名重复提交应返回 409');
  assert.strictEqual(cloud.__callLog.update.filter((n) => n === 'users').length, 1, '已实名不应再次写库');

  // 10) 未知 action → 400
  r = await main({ action: 'unknown', token });
  assert.strictEqual(r.code, 400, '未知 action 应返回 400');

  console.log(
    '✅ verify 单测通过（未登录401/已实名409/姓名身份证400/缺核身400/核身失败403/实名成功回填+脱敏 / crypto+faceverify 单元均 OK）'
  );
})().catch((e) => {
  console.error('❌ verify 单测失败:', e.message);
  process.exit(1);
});
