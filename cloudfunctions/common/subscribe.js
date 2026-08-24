// cloudfunctions/common/subscribe.js
// 任务：task-026 — 微信订阅消息薄封装层
//
// 设计：
//   - 统一封装「凑桌成功」等订阅消息发送，让业务云函数（match）只关心「通知触发点」，
//     不裸拼 wx-server-sdk 的 openapi 调用。
//   - 真实路径需在小程序后台申请订阅消息模板，并于云函数环境变量配置
//     SUBSCRIBE_TMPL_MATCH（凑桌成功模板 ID）；未配置时 isSubscribeConfigured()
//     返回 false，业务侧走 dev 占位（不触真实发送），与 pay / faceverify 的 dev 占位同范式。
//   - 真实模板 ID 接入预留为独立任务（后台申请模板 + 配置 env），本文件只消费环境变量。

const cloud = require('wx-server-sdk');

/**
 * 是否已配置「凑桌成功」订阅消息模板。
 * 未配置时 sendMatchSuccess 走 dev 占位（不触真实发送），便于开发期流程演示。
 */
function isSubscribeConfigured() {
  return !!process.env.SUBSCRIBE_TMPL_MATCH;
}

/**
 * 发送「凑桌成功」订阅消息给单个用户。
 * @param {Object} opts
 *   openid   {String}  接收者 openid（从 users 集合反查）
 *   event    {Object}  场次摘要 { city, district, time, price }
 *   members  {Array}   同桌人数（含自己）
 * @returns {Promise<Object>} { sent:Boolean, stub:Boolean, detail? }
 *   - stub=true 表示未配置模板，未真实发送（开发占位）
 *   - sent=true 表示已真实调用 openapi.send
 */
async function sendMatchSuccess({ openid, event = {}, members = [] }) {
  if (!openid) return { sent: false, stub: true, detail: 'no openid' };
  if (!isSubscribeConfigured()) {
    return { sent: false, stub: true };
  }
  const data = {
    thing1: { value: `${event.city || ''}${event.district ? '·' + event.district : ''}盲盒饭局` },
    time2: { value: event.time || '' },
    number3: { value: String(members.length) },
  };
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: process.env.SUBSCRIBE_TMPL_MATCH,
      data,
      // 跳转：进入小程序「我的」页查看我的桌
      page: 'pages/profile/profile',
    });
    return { sent: true, stub: false };
  } catch (err) {
    // 订阅消息失败不影响主流程（凑桌已成功），仅记录
    return { sent: false, stub: false, detail: err.message || 'send failed' };
  }
}

module.exports = {
  isSubscribeConfigured,
  sendMatchSuccess,
};
