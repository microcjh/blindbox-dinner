/**
 * services/event.js — 场次浏览 + 报名业务门面
 *
 * 定位:页面/组件的统一入口,封装「调云函数」这一层,页面不直接依赖 utils/request。
 *
 * 依赖:
 *   - ../utils/request 的 callFunction (统一云函数调用 + token 注入 + 错误提示)
 *   - ../utils/auth 的 isLoggedIn/isVerified (报名态前置分流由页面消费)
 *
 * 后端契约:
 *   - events 云函数  (task-014): action 'list' / 'detail'
 *       list   返回 { list:[eventView], total }；默认 status=open(只出可报名)
 *       detail 返回 eventView + { restaurant }（餐厅仅基础展示字段）
 *   - register 云函数 (task-015): action 'register' / 'unregister' / 'my'
 *       register   入参 { event_id }；返回 regView{id,user_id,event_id,status,created_at}
 *       unregister 入参 { event_id }；成功仅 {code,message} 无 data
 *       my         返回 { list:[regView(含 event 摘要)], total }
 *
 * 注意:
 *   - list/detail/my 为「浏览类」,loading=false（不盖全局 loading,列表自身有骨架态）
 *   - register/unregister 为写操作,走默认 loading（操作反馈由 request 层 + 页面 toast 共同处理）
 */

const { callFunction } = require('../utils/request');
const auth = require('../utils/auth');

/**
 * 公开浏览场次列表（默认只出可报名）。
 * @param {Object} params
 *   city {string} 城市（默认 北京）
 *   district {string} 区（可选，空串表示不限）
 *   status {string} 状态（可选，空串走云函数默认 open）
 *   page {number} 页码（默认 1）
 *   pageSize {number} 每页条数（默认 20）
 * @returns {Promise<{list:Array,total:number}>}
 */
async function listEvents(params = {}) {
  const {
    city = '北京',
    district = '',
    status = '',
    page = 1,
    pageSize = 20,
  } = params;
  const data = await callFunction({
    name: 'events',
    action: 'list',
    data: { city, district, status, page, pageSize },
    loading: false,
  });
  return data || { list: [], total: 0 };
}

/**
 * 场次详情（含关联餐厅基础信息）。
 * @param {string} id 场次 id
 * @returns {Promise<object|null>} eventView + restaurant，不存在返回 null
 */
async function getEvent(id) {
  if (!id) return null;
  const data = await callFunction({
    name: 'events',
    action: 'detail',
    data: { id },
    loading: false,
  });
  return data || null;
}

/**
 * 报名一场约饭（需登录 + 强实名，由 request 层 402 提示引导）。
 * @param {string} eventId 场次 id
 * @returns {Promise<object|null>} regView
 */
async function register(eventId) {
  const data = await callFunction({
    name: 'register',
    action: 'register',
    data: { event_id: eventId },
  });
  return data || null;
}

/**
 * 取消报名（已支付需走退款流程，由 request 层 409 拦截）。
 * @param {string} eventId 场次 id
 */
async function unregister(eventId) {
  const data = await callFunction({
    name: 'register',
    action: 'unregister',
    data: { event_id: eventId },
  });
  return data || null;
}

/**
 * 我的全部报名 + 关联场次摘要。
 * @returns {Promise<{list:Array,total:number}>}
 */
async function myRegistrations() {
  const data = await callFunction({
    name: 'register',
    action: 'my',
    loading: false,
  });
  return data || { list: [], total: 0 };
}

module.exports = {
  listEvents,
  getEvent,
  register,
  unregister,
  myRegistrations,
};
