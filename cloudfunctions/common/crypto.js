// cloudfunctions/common/crypto.js
// 任务：task-012 — 身份证脱敏哈希公共模块（供 verify 实名 / 支付实名等复用）
//
// 设计要点（见 coding-style 第7/8节、PIPL 合规）：
//   - 身份证号等强隐私字段**只存哈希，绝不落库明文**，也不下发前端（公开档案已剔除 id_card_hash）。
//   - 哈希用 HMAC-SHA256 + 密钥（加盐），相同身份证在不同部署下哈希不同，且不可逆推。
//   - 校验位只做「格式」级拦截（挡明显非法输入），不做完整 ISO 7064 校验位算法 —— 真实验证交给人脸核身（第二重护城河）。
//   - 纯 Node crypto，无 wx-server-sdk 依赖，任意云函数 / 测试可直接 require。
const crypto = require('crypto');

const DEV_SECRET = 'dev-insecure-idcard-secret-change-me';

function getSecret() {
  // 优先专用密钥；未配则回退登录令牌密钥；再回退开发常量（仅本地/测试，严禁生产依赖回退值）
  return process.env.ID_CARD_HASH_SECRET || process.env.AUTH_TOKEN_SECRET || DEV_SECRET;
}

/**
 * 身份证号基础格式校验（不含校验位算法）。
 * @param {string} idCard
 * @returns {boolean}
 */
function isValidIdCard(idCard) {
  if (!idCard || typeof idCard !== 'string') return false;
  // 17 位数字 + 末位数字或 X（大陆居民身份证）
  return /^\d{17}[\dXx]$/.test(idCard.trim());
}

/**
 * 计算身份证号哈希（不可逆、加盐）。
 * @param {string} idCard
 * @returns {string} hex
 */
function hashIdCard(idCard) {
  return crypto
    .createHmac('sha256', getSecret())
    .update(String(idCard).trim())
    .digest('hex');
}

module.exports = {
  isValidIdCard,
  hashIdCard,
  DEV_SECRET,
};
