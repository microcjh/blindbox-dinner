/**
 * services/auth.js — 登录态业务门面
 *
 * 定位:
 *   - utils/auth.js 负责「会话态存储 + 401 重登钩子」(被 app.js 全局依赖)
 *   - services/auth.js 是页面/组件的统一入口,封装「调云函数刷新档案」等业务动作
 *
 * 依赖:
 *   - ../utils/auth  (会话态存储 + login/ensureLogin/isLoggedIn/isVerified/logout)
 *   - ../utils/request 的 callFunction (统一云函数调用 + token 注入)
 *
 * 后端: task-011 的 auth 云函数
 *   - login  action: 见 utils/auth.login(由 wxContext.OPENID find-or-create)
 *   - me     action: 校验 token 返回公开档案(脱敏,_id→id)
 */

const auth = require('../utils/auth');
const { callFunction } = require('../utils/request');

/**
 * 刷新当前用户公开档案:调 auth.me 云函数,成功后写回本地缓存。
 * 用于「登录后 / 实名后 / 进页面时」校准 verified 等字段,避免缓存陈旧。
 * @returns {Promise<object|null>}
 */
async function me() {
  const data = await callFunction({
    name: 'auth',
    action: 'me',
    loading: false, // 静默刷新,不盖 loading
  });
  if (data && data.user) auth.setUserInfo(data.user);
  return (data && data.user) || null;
}

/**
 * 进入需要登录的页面时调用:确保有登录态,必要时刷新档案。
 * 顺序:已登录 → me() 校准;未登录 → ensureLogin() 触发登录。
 * @returns {Promise<object|null>}
 */
async function ensureSession() {
  if (auth.isLoggedIn()) return me();
  return auth.ensureLogin();
}

module.exports = {
  login: auth.login,
  logout: auth.logout,
  ensureLogin: auth.ensureLogin,
  isLoggedIn: auth.isLoggedIn,
  isVerified: auth.isVerified,
  getUid: auth.getUid,
  getUserInfo: auth.getUserInfo,
  setUserInfo: auth.setUserInfo,
  me,
  ensureSession,
};
