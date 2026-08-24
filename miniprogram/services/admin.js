// services/admin.js — 管理端（举报审核 + SOS 处置）业务层门面
// 页面只调本文件，不裸调 callFunction（见 coding-style §16）。
const { callFunction } = require('../utils/request');

// 列出待审举报（浏览类）
function listReports(params = {}) {
  const { page = 1, pageSize = 20 } = params;
  return callFunction({
    name: 'admin',
    action: 'listReports',
    data: { page, pageSize },
    loading: false,
  });
}

// 处置举报：decision=resolved|banned
function handleReport(id, decision, note = '') {
  return callFunction({
    name: 'admin',
    action: 'handleReport',
    data: { id, decision, note },
    loading: true,
  });
}

// 列出待处置求助（浏览类）
function listSos(params = {}) {
  const { page = 1, pageSize = 20 } = params;
  return callFunction({
    name: 'admin',
    action: 'listSos',
    data: { page, pageSize },
    loading: false,
  });
}

// 处置求助：标记 handled + 可选 note
function handleSos(id, note = '') {
  return callFunction({
    name: 'admin',
    action: 'handleSos',
    data: { id, note },
    loading: true,
  });
}

module.exports = {
  listReports,
  handleReport,
  listSos,
  handleSos,
};
