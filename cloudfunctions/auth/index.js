// cloudfunctions/auth/index.js
// 任务：task-011 — 登录与身份云函数（首个真正消费 common/db 写 users 集合的云函数）
// 动作：
//   login: 微信登录换令牌 + 用户（find-or-create by openid）
//   me:    校验令牌，返回当前用户公开档案（App 启动刷新 / 下游校验身份）
//
// 身份来源：云开发下 wx.cloud.callFunction 会在 wxContext.OPENID 自动注入调用者 openid，
//           比前端传来的 code 更权威（无需 auth.code2Session 换 session_key）。
//           event.code 仅保留兼容（后续可用于微信手机号能力等），不强制。
//
// 令牌：签发/校验走 common/session（HMAC-SHA256 无状态令牌，TTL 7 天，密钥 AUTH_TOKEN_SECRET）。
// 依赖：common/db（查询/写入）、common/session（令牌）。
const cloud = require('wx-server-sdk');
const path = require('path');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const { query, insert, getById } = require(path.join(__dirname, '..', 'common', 'db'));
const { signToken, verifyToken } = require(path.join(__dirname, '..', 'common', 'session'));

const COLLECTION = 'users';

// 公开档案：剔除敏感字段，避免本地存储泄露（见 coding-style 第7/8节）
const SENSITIVE_FIELDS = ['id_card_hash', 'openid', 'face_token'];

function toPublicProfile(user) {
  if (!user) return null;
  const { _id, ...rest } = user;
  const out = { id: _id, ...rest };
  SENSITIVE_FIELDS.forEach((k) => { delete out[k]; });
  return out;
}

// 新建用户默认档案：status=active，verified=false（实名后由 task-012 verify 回填）
function buildNewUser(openid) {
  return {
    openid,
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
    created_at: new Date().toISOString(),
  };
}

// 按 openid 查用户（后端内部用，含敏感字段，不下发）
async function findUserByOpenid(openid) {
  const res = await query(COLLECTION, {
    where: { openid },
    page: 1,
    pageSize: 1,
  });
  if (res.code !== 0) throw new Error(res.message);
  return (res.data && res.data.list[0]) || null;
}

async function handleLogin(event, wxContext) {
  const openid = wxContext.OPENID;
  if (!openid) {
    return { code: 401, message: '无法获取微信身份（OPENID 缺失）' };
  }
  // 注：event.code 在云开发下非必需；保留以便未来微信手机号能力扩展。

  let user = await findUserByOpenid(openid);
  let isNew = false;
  if (!user) {
    const ins = await insert(COLLECTION, buildNewUser(openid));
    if (ins.code !== 0) {
      return { code: 500, message: ins.message };
    }
    user = await findUserByOpenid(openid);
    isNew = true;
  }
  if (!user) {
    return { code: 500, message: '用户创建后读取失败' };
  }

  const token = signToken({ openid, uid: user._id });
  return {
    code: 0,
    message: 'ok',
    data: {
      token,
      user: toPublicProfile(user),
      isNew,
    },
  };
}

async function handleMe(event) {
  // 优先用令牌解析身份（无状态、可离线校验）；校验失败 → 401 引导重登
  const payload = verifyToken(event.token);
  if (!payload) {
    return { code: 401, message: '登录态已失效，请重新登录' };
  }
  const res = await getById(COLLECTION, payload.uid);
  if (res.code !== 0) return { code: 500, message: res.message };
  if (!res.data) return { code: 404, message: '用户不存在' };
  return {
    code: 0,
    message: 'ok',
    data: toPublicProfile(res.data),
  };
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const action = (event && event.action) || 'login';
  try {
    if (action === 'login') return await handleLogin(event, wxContext);
    if (action === 'me') return await handleMe(event);
    return { code: 400, message: `未知 action: ${action}` };
  } catch (err) {
    return { code: 500, message: err.message || '登录失败' };
  }
};
