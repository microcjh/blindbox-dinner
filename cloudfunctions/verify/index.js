// cloudfunctions/verify/index.js
// 任务：task-012 — 实名认证云函数（强实名第二重：人脸核身）
//
// 动作：
//   submit: 校验 姓名 + 身份证 + 人脸核身结果 → 回填 users(verified / real_name / id_card_hash / face_token)
//
// 身份来源：复用 common/session.verifyToken(event.token) 取 uid（无状态令牌；或改用 wxContext.OPENID）。
//
// 信任护城河（见 README / coding-style）：微信实名 + 人脸核身 + 双向评价黑名单，
//   本函数负责「人脸核身」这第二重：核身通过才置 verified=true。
//
// 隐私红线（coding-style 第7/8节）：
//   - 身份证号**只存哈希**（common/crypto.hashIdCard），明文不落库、不下发。
//   - 公开档案由 toPublicProfile 剔除 id_card_hash / openid / face_token，_id→id。
//
// 错误码：401 未登录 / 400 参数 / 403 核身未通过 / 409 已实名 / 404 用户不存在 / 500 异常
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const { getById, update } = require('common/db');
const { verifyToken } = require('common/session');
const { hashIdCard, isValidIdCard } = require('common/crypto');
const { faceVerify } = require('common/faceverify');

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

// 姓名：2 字以上中文（含·，兼容少数民族姓名）
function isValidName(name) {
  if (typeof name !== 'string') return false;
  const n = name.trim();
  return n.length >= 2 && /^[\u4e00-\u9fa5·]+$/.test(n);
}

async function handleSubmit(event) {
  // 1) 身份：无状态令牌优先
  const payload = verifyToken(event.token);
  if (!payload) {
    return { code: 401, message: '登录态已失效，请重新登录' };
  }
  const uid = payload.uid;

  // 2) 参数校验
  const { real_name, id_card, verifyResult } = event;
  if (!isValidName(real_name)) {
    return { code: 400, message: '请填写真实姓名（2 字以上中文）' };
  }
  if (!isValidIdCard(id_card)) {
    return { code: 400, message: '身份证号格式不正确' };
  }
  if (!verifyResult || typeof verifyResult !== 'string') {
    return { code: 400, message: '缺少人脸核身结果' };
  }

  // 3) 取当前用户，判断是否已实名
  const cur = await getById(COLLECTION, uid);
  if (cur.code !== 0) return { code: 500, message: cur.message };
  if (!cur.data) return { code: 404, message: '用户不存在' };
  if (cur.data.verified === true) {
    return { code: 409, message: '您已完成实名认证', data: toPublicProfile(cur.data) };
  }

  // 4) 人脸核身（腾讯云；未配 RuleId 走本地 mock，不触真实计费）
  const fv = await faceVerify(verifyResult);
  if (!fv.ok) {
    return { code: 403, message: fv.message || '人脸核身未通过' };
  }

  // 5) 写库：只存哈希，不存明文身份证
  const patch = {
    _id: uid,
    verified: true,
    real_name: String(real_name).trim(),
    id_card_hash: hashIdCard(id_card),
    face_token: fv.face_token,
  };
  const upd = await update(COLLECTION, patch);
  if (upd.code !== 0) return { code: 500, message: upd.message };

  // 6) 重新读取最新档案返回（含 verified=true）
  const after = await getById(COLLECTION, uid);
  if (after.code !== 0) return { code: 500, message: after.message };
  return {
    code: 0,
    message: 'ok',
    data: toPublicProfile(after.data),
  };
}

exports.main = async (event, context) => {
  const action = (event && event.action) || 'submit';
  try {
    if (action === 'submit') return await handleSubmit(event);
    return { code: 400, message: `未知 action: ${action}` };
  } catch (err) {
    return { code: 500, message: err.message || '实名认证失败' };
  }
};
