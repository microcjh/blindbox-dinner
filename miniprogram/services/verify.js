/**
 * services/verify.js — 实名认证业务层
 *
 * 定位:封装「人脸核身 → 提交实名」全链路,供 realname 页调用。
 *
 * 依赖:
 *   - ../utils/request 的 callFunction (统一云函数调用 + token 注入)
 *   - ../utils/auth 的 setUserInfo (实名成功后刷新本地缓存)
 *
 * 后端: task-012 的 verify 云函数(action: 'submit')
 *   校验 姓名 + 身份证 + 人脸核身结果 → 核身通过回填 users(verified/real_name/id_card_hash/face_token)
 *
 * 人脸核身:
 *   - 真机/已配核身服务:wx.startFacialRecognitionVerify 返回 verifyResult
 *   - DevTools / 未配能力:返回 dev 占位结果(不触真实计费),便于联调
 *     生产环境真实核身接入见 task-034
 */

const { callFunction } = require('../utils/request');
const auth = require('../utils/auth');

/**
 * 调起微信原生人脸核身。
 * @param {Object} params
 *   name   {string} 真实姓名(需与身份证一致)
 *   idCard {string} 身份证号
 * @returns {Promise<object>} 核身结果 verifyResult(含 errMsg / verifyResult 等)
 */
function startFaceVerify({ name, idCard } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || !wx.startFacialRecognitionVerify) {
      // 开发/DevTools 环境无核身能力:返回 dev 占位,便于联调(生产必须真机核身)
      console.warn('[verify] wx.startFacialRecognitionVerify 不可用,使用 dev 占位结果(不触真实计费)');
      resolve({ errMsg: 'startFacialRecognitionVerify:ok', verifyResult: 'dev-mock-verify-token', __dev: true });
      return;
    }
    wx.startFacialRecognitionVerify({
      name,
      idCard,
      success: (res) => resolve(res),
      fail: (err) => reject(err),
    });
  });
}

/**
 * 提交实名。
 * @param {Object} params
 *   realName     {string} 真实姓名
 *   idCard       {string} 身份证号
 *   verifyResult {object} startFaceVerify 返回的核身结果
 * @returns {Promise<object|null>} 更新后的公开档案 user(verified=true)
 */
async function submit({ realName, idCard, verifyResult } = {}) {
  const data = await callFunction({
    name: 'verify',
    action: 'submit',
    data: { realName, idCard, verifyResult },
  });
  // 实名成功后刷新本地登录态(verified 等公开档案字段)
  if (data && data.user) auth.setUserInfo(data.user);
  return (data && data.user) || null;
}

module.exports = { startFaceVerify, submit };
