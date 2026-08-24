// miniprogram/services/blacklist.js
// 任务：task-020 — blacklist 云函数的 1:1 业务门面（见 coding-style 第16/23节）
//
// 页面只依赖本门面，不得裸调 callFunction。
// - reportBlacklist: 举报某用户（写操作，走默认 loading）
// - listMyBlacklist: 查我的举报记录（浏览类，loading:false）
const { callFunction } = require('../utils/request');

// 举报
async function reportBlacklist({ target, reason, detail }) {
  return callFunction({
    name: 'blacklist',
    action: 'report',
    data: {
      target,
      reason,
      detail: detail || '',
    },
  });
}

// 我的举报记录（我举报的 + 关于我的）
async function listMyBlacklist() {
  return callFunction({
    name: 'blacklist',
    action: 'list',
    data: {},
    loading: false,
  });
}

module.exports = {
  reportBlacklist,
  listMyBlacklist,
};
