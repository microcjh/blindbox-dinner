/**
 * services/payment.js — 支付业务门面
 *
 * 定位:页面/组件的统一入口,封装「调支付云函数」+「调起微信支付」这一层。
 *
 * 后端契约:
 *   - payment 云函数（task-017）: action 'create' / 'query'
 *       create 入参 { event_id }；dev 模式返回 { devStub:true, outTradeNo, amount }，
 *             真实模式返回 { devStub:false, outTradeNo, prepay:{nonceStr,package,paySign,signType,timeStamp} }
 *       query  入参 { event_id }；返回 { status }（pending/paid/refunded/null）
 *
 * 微信支付调起:
 *   - 真实模式: 用 prepay 参数调 wx.requestPayment（见 coding-style 第20节）
 *   - dev 模式: 未配置商户号时走占位，pay() 直接 resolve（不弹真实收银台，便于开发演示）
 *
 * 注意:
 *   - createPrepay 为写操作,走默认 loading（request 层）
 *   - pay 内部调 wx.requestPayment，错误由本层 toast；取消支付 resolve({success:false,reason:'cancelled'})
 *   - query 为浏览类,loading=false
 */

const { callFunction } = require('../utils/request');

/**
 * 创建支付单（统一下单）。
 * @param {string} eventId 场次 id
 * @returns {Promise<{devStub:boolean, outTradeNo:string, amount?:number, prepay?:object}>}
 */
async function createPrepay(eventId) {
  const data = await callFunction({
    name: 'payment',
    action: 'create',
    data: { event_id: eventId },
  });
  return data || { devStub: true, outTradeNo: '', amount: 0 };
}

/**
 * 调起微信支付。
 * @param {Object} prepayResult createPrepay 的返回
 * @returns {Promise<{success:boolean, reason?:string, detail?:any}>}
 */
function pay(prepayResult) {
  return new Promise((resolve) => {
    if (!prepayResult || prepayResult.devStub) {
      // 开发占位：未配置商户号，不弹真实收银台，直接视为支付成功（便于流程演示）
      resolve({ success: true, devStub: true });
      return;
    }
    const { nonceStr, package: pkg, paySign, signType, timeStamp } = prepayResult.prepay || {};
    wx.requestPayment({
      timeStamp,
      nonceStr,
      package: pkg,
      signType,
      paySign,
      success: () => resolve({ success: true }),
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) {
          resolve({ success: false, reason: 'cancelled' });
        } else {
          resolve({ success: false, reason: 'payment_failed', detail: err });
        }
      },
    });
  });
}

/**
 * 查询支付态（兜底：notify 异步翻转前客户端可见）。
 * @param {string} eventId 场次 id
 * @returns {Promise<{status:string|null}>}
 */
async function queryStatus(eventId) {
  const data = await callFunction({
    name: 'payment',
    action: 'query',
    data: { event_id: eventId },
    loading: false,
  });
  return (data && data.status != null) ? { status: data.status } : { status: null };
}

module.exports = {
  createPrepay,
  pay,
  queryStatus,
};
