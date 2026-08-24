// auth 云函数最小单元测试
// 不依赖真实云环境，用 __mocks__/wx-server-sdk.js 拦截 require('wx-server-sdk')，
// 并复用真实的 cloudfunctions/common/db.js 与 cloudfunctions/common/session.js
// （其内部 require('wx-server-sdk') 同样被拦截到 mock）。
//
// 验收点：
//   - login 首次：创建用户，返回 { token, user, isNew:true }，user 含 id、verified=false
//   - login 二次：复用已有用户，isNew:false，user.id 与首次一致（find-or-create 正确）
//   - login 无 OPENID：返回 401（身份缺失）
//   - me 合法令牌：返回公开档案；me 非法令牌：401；me 过期令牌：401
//   - 公开档案剔除敏感字段（openid/id_card_hash/face_token 不下发）
//   - common/session 签名校验：往返一致；空/畸形/篡改/过期令牌均返回 null
const assert = require('assert');
const path = require('path');
const crypto = require('crypto');

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
const { signToken, verifyToken, DEFAULT_SECRET } = require(path.join(__dirname, '..', 'common', 'session'));
const main = require('./index.js').main;

// base64url 工具（与 session.js 同实现，用于构造过期令牌用例）
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlJson(obj) {
  return b64url(Buffer.from(JSON.stringify(obj), 'utf8'));
}

const SENSITIVE = ['openid', 'id_card_hash', 'face_token'];

function assertPublicProfile(user) {
  assert.ok(user && user.id, '公开档案应含 id');
  SENSITIVE.forEach((k) => {
    assert.ok(!(k in user), `公开档案不得下发敏感字段 ${k}`);
  });
  assert.strictEqual(user.verified, false, '新用户 verified 默认应为 false');
}

(async () => {
  // 0) 前置：清空 store
  cloud.__reset();

  const wxCtx = { OPENID: 'mock-openid', APPID: 'mock-appid', UNIONID: null };

  // 1) login 首次：创建用户
  let r = await main({ action: 'login', code: 'fake-code' }, { /* context */ });
  // 注：index 内部用 cloud.getWXContext() 取 OPENID，mock 默认返回 mock-openid
  assert.strictEqual(r.code, 0, 'login 应返回 code=0');
  assert.ok(r.data.token, '应返回 token');
  assert.strictEqual(r.data.isNew, true, '首次登录 isNew 应为 true');
  assertPublicProfile(r.data.user);
  const firstId = r.data.user.id;
  assert.strictEqual(cloud.__store.users.length, 1, 'users 应落地 1 条');
  assert.strictEqual(cloud.__store.users[0].openid, 'mock-openid', '落库 openid 应与 wxContext 一致');

  // 2) login 二次：复用已有用户，isNew=false，id 一致
  r = await main({ action: 'login' });
  assert.strictEqual(r.code, 0, '二次 login 应返回 code=0');
  assert.strictEqual(r.data.isNew, false, '二次登录 isNew 应为 false');
  assert.strictEqual(r.data.user.id, firstId, '二次登录 user.id 应一致');
  assert.strictEqual(cloud.__store.users.length, 1, '不应重复建用户');

  // 3) login 无 OPENID：401
  const origCtx = cloud.getWXContext;
  cloud.getWXContext = () => ({ OPENID: null, APPID: 'mock', UNIONID: null });
  r = await main({ action: 'login' });
  assert.strictEqual(r.code, 401, 'OPENID 缺失应返回 401');
  cloud.getWXContext = origCtx; // 还原

  // 4) me 合法令牌：返回公开档案
  r = await main({ action: 'me', token: signToken({ openid: 'mock-openid', uid: firstId }) });
  assert.strictEqual(r.code, 0, 'me 合法令牌应返回 code=0');
  assertPublicProfile(r.data);
  assert.strictEqual(r.data.id, firstId, 'me 返回的用户应为登录用户');

  // 5) me 非法令牌：401（畸形）
  r = await main({ action: 'me', token: 'not-a-valid-token' });
  assert.strictEqual(r.code, 401, '非法令牌应返回 401');

  // 6) me 过期令牌：401（手写一个 exp 已过的令牌，用同密钥签名）
  const expiredData = b64urlJson({ openid: 'mock-openid', uid: firstId, iat: 1, exp: 2 });
  const expiredSig = b64url(crypto.createHmac('sha256', DEFAULT_SECRET).update(expiredData).digest());
  r = await main({ action: 'me', token: `${expiredData}.${expiredSig}` });
  assert.strictEqual(r.code, 401, '过期令牌应返回 401');

  // 7) me 不存在用户：404（token 合法但 uid 无对应记录）
  r = await main({ action: 'me', token: signToken({ openid: 'ghost', uid: 'no-such-id' }) });
  assert.strictEqual(r.code, 404, '令牌合法但用户不存在应返回 404');

  // 8) 未知 action：400
  r = await main({ action: 'unknown' });
  assert.strictEqual(r.code, 400, '未知 action 应返回 400');

  // 9) session 签名校验单元
  const payload = signToken({ openid: 'o1', uid: 'u1' });
  const decoded = verifyToken(payload);
  assert.ok(decoded, 'verifyToken 应解析合法令牌');
  assert.strictEqual(decoded.openid, 'o1');
  assert.strictEqual(decoded.uid, 'u1');
  assert.ok(decoded.exp > Math.floor(Date.now() / 1000), 'exp 应大于当前时间');

  assert.strictEqual(verifyToken(null), null, 'null 令牌应返回 null');
  assert.strictEqual(verifyToken(''), null, '空令牌应返回 null');
  assert.strictEqual(verifyToken('a.b.c'), null, '三段式畸形令牌应返回 null');
  assert.strictEqual(verifyToken('garbage'), null, '无点分隔令牌应返回 null');
  // 篡改签名
  const tampered = `${expiredData}.${expiredSig}x`;
  assert.strictEqual(verifyToken(tampered), null, '篡改签名应返回 null');

  console.log('✅ auth 单测通过（login find-or-create / me 校验 / 公开档案脱敏 / session 令牌均 OK）');
})().catch((e) => {
  console.error('❌ auth 单测失败:', e.message);
  process.exit(1);
});
