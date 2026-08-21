// cloudfunctions/quickstart/index.js
// 任务：task-002 — 首个云函数脚手架，验证云开发环境联通
// 用途：
//   1. 联调时由小程序端 `wx.cloud.callFunction({ name: 'quickstart' })` 调用，确认 env 配置正确
//   2. 后续 task-011~022 的云函数都基于本结构扩展
//   3. 在 DevTools 云函数日志中可见调用记录，便于排查问题
const cloud = require('wx-server-sdk');

// 显式声明 env：与小程序端 wx.cloud.init 的 env 保持一致
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  // 1. 基础连通检查
  const now = new Date().toISOString();

  // 2. 校验入参（演示用，task-011 起会演变成统一校验器）
  const action = event.action || 'ping';
  let payload = { ok: true, action, now };

  if (action === 'echo') {
    payload.echo = event.payload || null;
  } else if (action === 'sum') {
    const arr = Array.isArray(event.numbers) ? event.numbers : [];
    payload.sum = arr.reduce((a, b) => a + Number(b || 0), 0);
    payload.count = arr.length;
  } else if (action === 'whoami') {
    // 返回当前调用者的身份上下文（注意：OPENID 等仅在后端可信，不下发给前端做权限判定）
    payload.openid = wxContext.OPENID;
    payload.appid = wxContext.APPID;
    payload.unionid = wxContext.UNIONID || null;
  }

  return {
    code: 0,
    message: 'ok',
    data: payload
  };
};