// miniprogram/services/match.js
// 任务：task-019 — match 云函数的 1:1 业务门面（见 coding-style 第16/22节）
//
// 页面只依赖本门面，不得裸调 callFunction。
// - runMatch: 触发某场次凑桌（写操作，走默认 loading）
// - myMatches: 查我参与的桌（浏览类，loading:false）
// - requestMatchSubscribe: 申请「凑桌成功」订阅消息授权（task-026，最佳 opt-in 时机=报名/支付成功后）
const { callFunction } = require('../utils/request');

// 触发凑桌
async function runMatch(eventId) {
  return callFunction({
    name: 'match',
    action: 'run',
    data: { event_id: eventId },
  });
}

// 我的桌
async function myMatches() {
  return callFunction({
    name: 'match',
    action: 'myMatches',
    data: {},
    loading: false,
  });
}

// 「凑桌成功」订阅消息模板 ID（task-026）
// 真实模板需在小程序后台「订阅消息」申请，此处为占位常量；未申请/未配时
// wx.requestSubscribeMessage 会失败，门面静默处理（不影响报名主流程）。
const MATCH_SUBSCRIBE_TMPL_ID = 'tmpl_match_success';

// 申请「凑桌成功」订阅授权（task-026）
// 调用时机：用户报名/支付成功后（转化 opt-in 最高），由页面层触发。
// 返回 { accepted:Boolean }，失败静默返回 { accepted:false } 不阻断主流程。
async function requestMatchSubscribe(tmplIds) {
  const ids = tmplIds && tmplIds.length ? tmplIds : [MATCH_SUBSCRIBE_TMPL_ID];
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success: (res) => {
        const accepted = ids.some((id) => res[id] === 'accept');
        resolve({ accepted, result: res });
      },
      fail: () => resolve({ accepted: false, result: {} }),
    });
  });
}

module.exports = {
  runMatch,
  myMatches,
  requestMatchSubscribe,
  MATCH_SUBSCRIBE_TMPL_ID,
};
