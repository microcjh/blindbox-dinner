/**
 * services/refund.js — 退款业务门面
 *
 * 定位:页面/组件的统一入口,封装「调 refund 云函数」这一层,页面不直接依赖 utils/request。
 *
 * 后端契约:
 *   refund 云函数 (task-021): action 'apply' / 'query'
 *     apply  入参 { event_id }；成功返回 { devStub, refundId, outRefundNo, amount }
 *            幂等返回 { duplicated:true, refund }
 *     query  入参 { registration_id }；返回 { list:[refundView], total }
 *
 * 注意:
 *   - apply 为写操作,走默认 loading（操作反馈由 request 层 + 页面 toast 共同处理）
 *   - query 为浏览类,loading=false
 */
const { callFunction } = require('../utils/request');

/**
 * 申请退款（全额退报名费）。
 * @param {string} eventId 场次 id
 * @returns {Promise<Object>} 退款结果 { devStub, refundId, outRefundNo, amount, duplicated }
 */
async function applyRefund(eventId) {
  if (!eventId || typeof eventId !== 'string') {
    throw { code: 400, message: '缺少场次 id' };
  }
  const data = await callFunction({
    name: 'refund',
    action: 'apply',
    data: { event_id: eventId },
  });
  return data || {};
}

/**
 * 查询某报名的退款单列表。
 * @param {string} registrationId 报名记录 id（云函数侧 registrations._id）
 * @returns {Promise<{list:Array,total:number}>}
 */
async function queryRefund(registrationId) {
  if (!registrationId || typeof registrationId !== 'string') {
    return { list: [], total: 0 };
  }
  const data = await callFunction({
    name: 'refund',
    action: 'query',
    data: { registration_id: registrationId },
    loading: false,
  });
  return data || { list: [], total: 0 };
}

module.exports = {
  applyRefund,
  queryRefund,
};
