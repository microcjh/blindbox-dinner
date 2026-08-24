// cloudfunctions/common/session.js
// 任务：task-011 — 登录态 / 令牌公共模块（供 auth 云函数及后续云函数复用）
// 用途：
//   1. signToken({ openid, uid })：签发自描述 HMAC-SHA256 无状态令牌
//   2. verifyToken(token)：校验签名与有效期，返回载荷；无效/过期返回 null
//   3. 纯 Node crypto 实现，不依赖 wx-server-sdk，任意云函数可直接 require
//
// 设计要点：
//   - 无状态：令牌自带 { openid, uid, iat, exp }，下游云函数 verifyToken 即可取身份，
//     无需查库或存会话；与云开发「wxContext.OPENID 恒可靠」互补（二选一解析身份即可）。
//   - 密钥：生产必须配置环境变量 AUTH_TOKEN_SECRET；未配置时回退开发期常量，
//     仅用于本地/测试，严禁生产环境依赖回退值。
//   - 安全：签名用 timingSafeEqual 定长比较防时序攻击；令牌不可伪造（无密钥无法签名）。
const crypto = require('crypto');

const DEFAULT_SECRET = 'dev-insecure-secret-change-me';
const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 天

function getSecret() {
  return process.env.AUTH_TOKEN_SECRET || DEFAULT_SECRET;
}

// base64url 编码（URL 安全、去填充）
function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlJson(obj) {
  return b64url(Buffer.from(JSON.stringify(obj), 'utf8'));
}

function b64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64').toString('utf8');
}

/**
 * 签发令牌。
 * @param {{openid:string, uid:string}} payload 至少含 openid 与用户 _id(uid)
 * @returns {string} `${data}.${sig}`
 */
function signToken(payload) {
  const iat = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat, exp: iat + TTL_SECONDS };
  const data = b64urlJson(body);
  const sig = b64url(crypto.createHmac('sha256', getSecret()).update(data).digest());
  return `${data}.${sig}`;
}

/**
 * 校验令牌。
 * @param {string} token
 * @returns {{openid:string,uid:string,iat:number,exp:number}|null} 有效返回载荷，否则 null
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;

  // 定长比较，防时序攻击
  const expected = b64url(crypto.createHmac('sha256', getSecret()).update(data).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let body;
  try {
    body = JSON.parse(b64urlDecode(data));
  } catch (e) {
    return null;
  }
  if (!body || typeof body.exp !== 'number') return null;
  if (body.exp < Math.floor(Date.now() / 1000)) return null; // 过期
  return body;
}

module.exports = {
  signToken,
  verifyToken,
  TTL_SECONDS,
  DEFAULT_SECRET,
};
