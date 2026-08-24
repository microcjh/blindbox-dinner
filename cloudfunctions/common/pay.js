// cloudfunctions/common/pay.js
// 任务：task-017 — 微信支付（云调用 cloudPay）薄封装层
//
// 设计：
//   - 统一封装 wx-server-sdk 的 cloud.cloudPay.unifiedOrder / resultNotification，
//     让业务云函数（payment）只关心「下单 / 收通知」，不裸拼微信支付 API。
//   - 真实路径需在小程序绑定微信支付商户号 + 云开发启用云支付后，于云函数环境变量
//     配置 WXPAY_SUB_MCH_ID（普通商户号 / 服务商特约商户号）；未配置时 isPayConfigured()
//     返回 false，业务侧走 dev 占位（不触真实计费），与 faceverify 的 dev 占位同范式。
//   - 真实商户配置接入预留为独立任务（商户号/证书/APIv3 key），本文件只消费环境变量。

const cloud = require('wx-server-sdk');

/**
 * 是否已配置微信支付商户号。
 * 未配置时 payment 云函数返回 dev 占位 prepay，便于前端流程在开发期可演示，
 * 不触发真实计费（与 faceverify dev 占位一致）。
 */
function isPayConfigured() {
  return !!process.env.WXPAY_SUB_MCH_ID;
}

/**
 * 微信支付·云调用 统一下单。
 * @param {Object} opts 见微信支付·云调用 unifiedOrder 参数
 *   body / outTradeNo / spbillCreateIp / subMchId / totalFee / envId / functionName
 * @returns {Promise<Object>} 成功返回 prepay 参数 { nonceStr, package, paySign, signType, timeStamp }
 */
function unifiedOrder(opts) {
  return cloud.cloudPay.unifiedOrder(opts);
}

/**
 * 解析支付结果通知（在 unifiedOrder 指定的接收云函数内调用）。
 * @param {Object} event 云函数入参（含支付通知报文）
 * @param {Object} context 云函数上下文
 * @returns {Promise<Object>} 解析后的通知 { returnCode, resultCode, outTradeNo, transactionId, ... }
 */
function resultNotification(event, context) {
  return cloud.cloudPay.resultNotification(event, context);
}

module.exports = {
  isPayConfigured,
  unifiedOrder,
  resultNotification,
};
