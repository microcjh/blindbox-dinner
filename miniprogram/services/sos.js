// miniprogram/services/sos.js — SOS 业务门面（页面只调本模块，不裸调 callFunction）
// 对齐 coding-style 第12节：services 层 1:1 映射云函数 action；写操作默认 loading，浏览类 loading:false。
const request = require('../utils/request');

// 发起一键求助（写操作，默认 loading）
function createSos(payload = {}) {
  const { eventId, type, desc, location } = payload;
  return request.callFunction({
    name: 'sos',
    action: 'create',
    data: {
      event_id: eventId,
      type: type || 'other',
      desc: desc || '',
      location: location || null,
    },
    loading: true,
  });
}

// 查单条求助（浏览类）
function querySos(id) {
  return request.callFunction({
    name: 'sos',
    action: 'query',
    data: { id },
    loading: false,
  });
}

// 我的求助列表（浏览类）
function mySos() {
  return request.callFunction({
    name: 'sos',
    action: 'mine',
    data: {},
    loading: false,
  });
}

module.exports = { createSos, querySos, mySos };
