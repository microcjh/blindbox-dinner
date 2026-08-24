// cloudfunctions/common/faceverify.js
// 任务：task-012 — 腾讯云人脸核身结果校验封装（强实名第二重护城河）
//
// 背景：小程序端 `wx.startFacialRecognitionVerify({ name, idCardNumber })` 完成活体检测后，
//       回调返回 `verifyResult`（腾讯云下发的加密核身结果串）；前端将其发往本模块做解析。
//
// 设计（见 testing.md：实名等外部依赖用 mock，不触发真实计费）：
//   - 生产路径：调用腾讯云 慧眼/E证通 `CheckE证通` 解析 verifyResult，拿核身结果 + FaceToken；
//     需环境变量 `WX_FACE_VERIFY_RULE_ID`（task-034 安装并接入 tencentcloud SDK）。
//   - 本地/测试/未配置 RuleId：仅做格式校验，派生一个稳定的 face_token 占位，
//     **不发起真实腾讯云调用、不触发实名计费**，保证 MVP 端到端可联调、单测可离线跑。
//   - 对外契约稳定：verify 云函数只依赖 `faceVerify(verifyResult)` 的返回值，真实 SDK 接入不影响调用方。
const crypto = require('crypto');

/**
 * 本地校验（不触真实计费）。
 * @param {string} verifyResult
 * @returns {{ok:boolean, face_token?:string, message?:string}}
 */
function verifyLocal(verifyResult) {
  if (!verifyResult || typeof verifyResult !== 'string' || verifyResult.length < 8) {
    return { ok: false, message: '人脸核身结果无效' };
  }
  // 用 verifyResult 派生稳定 face_token 占位（生产由腾讯云返回真实 FaceToken）
  const face_token = crypto.createHash('sha256').update(verifyResult).digest('hex').slice(0, 32);
  return { ok: true, face_token };
}

/**
 * 校验人脸核身结果。
 * @param {string} verifyResult 前端 wx.startFacialRecognitionVerify 回调返回的核身结果串
 * @returns {Promise<{ok:boolean, face_token?:string, message?:string}>}
 */
async function faceVerify(verifyResult) {
  const ruleId = process.env.WX_FACE_VERIFY_RULE_ID;

  if (!ruleId) {
    // 未配置 RuleId：本地校验，不触真实计费（MVP / 测试 / 本地）
    return verifyLocal(verifyResult);
  }

  // ---- 生产路径（task-034 接入真实 SDK 后启用）----
  // const tencentcloud = require('tencentcloud-sdk-nodejs-ai'); // 或 -faceid
  // const client = new tencentcloud.faceid.v20181201.Client({ credential, region: 'ap-shanghai', profile });
  // const res = await client.CheckE证通Verify({ RuleId: ruleId, VerifyResult: verifyResult });
  // if (res.Status === 'Success') return { ok: true, face_token: res.FaceToken };
  // return { ok: false, message: res.Description || '人脸核身未通过' };
  //
  // 当前 SDK 尚未安装：回退本地校验并告警，保证 MVP 在 task-034 前可端到端跑通
  // （生产上线前必须由 task-034 安装 SDK 并接真实 CheckE证通，否则等同于「未真实验证」）。
  console.warn(
    '[faceverify] WX_FACE_VERIFY_RULE_ID 已配置但腾讯云 SDK 未接入（task-034），临时回退本地校验（非真实核身）'
  );
  return verifyLocal(verifyResult);
}

module.exports = { faceVerify };
