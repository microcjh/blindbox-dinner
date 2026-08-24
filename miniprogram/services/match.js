// miniprogram/services/match.js
// 任务：task-019 — match 云函数的 1:1 业务门面（见 coding-style 第16/22节）
//
// 页面只依赖本门面，不得裸调 callFunction。
// - runMatch: 触发某场次凑桌（写操作，走默认 loading）
// - myMatches: 查我参与的桌（浏览类，loading:false）
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

module.exports = {
  runMatch,
  myMatches,
};
