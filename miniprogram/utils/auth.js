/**
 * utils/auth.js — 登录态管理
 *
 * 职责:
 *   1. 登录态缓存(token / user 存 storage)
 *   2. 是否已登录 / 是否已实名判断
 *   3. 登出(清缓存 + 清除 401 重登钩子)
 *   4. 注入 401 重登钩子(由 request.js 在收到 401 时调用)
 *
 * 依赖: utils/request.js 的 callFunction / setUnauthorizedHandler
 * 后端: task-011 的 auth 云函数(action: 'login'),返回 { token, user }
 *       user 结构约定含 verified(boolean) 字段,用于 isVerified 判断
 */

const { callFunction, setUnauthorizedHandler } = require('./request');

// storage key 与 request.js 的 getToken() 保持一致(key='token')
const STORAGE_KEYS = {
  TOKEN: 'token',
  USER: 'user',
  OPENID: 'openid',
};

// 把 wx.login 回调式 API 包装为 Promise
function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res && res.code) resolve(res.code);
        else reject(new Error('wx.login 未返回 code'));
      },
      fail: (err) => reject(err),
    });
  });
}

function getToken() {
  try {
    return wx.getStorageSync(STORAGE_KEYS.TOKEN) || '';
  } catch (e) {
    return '';
  }
}

function setToken(token) {
  try {
    wx.setStorageSync(STORAGE_KEYS.TOKEN, token || '');
  } catch (e) {
    /* storage 不可用(隐私拒绝等)时静默失败 */
  }
}

function getUserInfo() {
  try {
    return wx.getStorageSync(STORAGE_KEYS.USER) || null;
  } catch (e) {
    return null;
  }
}

function setUserInfo(user) {
  try {
    wx.setStorageSync(STORAGE_KEYS.USER, user || null);
  } catch (e) {
    /* ignore */
  }
}

function isLoggedIn() {
  return !!getToken();
}

// 当前用户 uid（公开档案 id，即 users._id；token 的 uid 与之同值）
// 用于需要从本地会话识别「我是谁」的场景（如凑桌成员列表过滤自己）
function getUid() {
  const u = getUserInfo();
  return (u && u.id) || '';
}

// 是否已实名:依赖 user.verified 字段(task-012 写库后回填)
function isVerified() {
  const u = getUserInfo();
  return !!(u && u.verified === true);
}

/**
 * 微信登录:wx.login 拿 code → 调 auth 云函数换取 token + user
 * 成功后写入 storage,返回 user 对象。
 * @returns {Promise<object|null>}
 */
async function login() {
  const code = await wxLogin();
  const data = await callFunction({
    name: 'auth',
    action: 'login',
    data: { code },
    loading: false, // 登录/重登是静默操作,不盖全局 loading,由页面自行控制
  });
  if (data && data.token) setToken(data.token);
  if (data && data.user) setUserInfo(data.user);
  return (data && data.user) || null;
}

/**
 * 401 重登处理函数 —— 注入给 request.js。
 * 返回 Promise:resolve 表示重登成功、可重试原请求;reject 表示重登失败(会触发原请求 reject)。
 */
async function handle401() {
  await login();
}

/**
 * 确保已登录:未登录则执行一次登录,已登录返回缓存的 user。
 * @returns {Promise<object|null>}
 */
async function ensureLogin() {
  if (isLoggedIn()) return getUserInfo();
  return login();
}

function logout() {
  try {
    wx.removeStorageSync(STORAGE_KEYS.TOKEN);
    wx.removeStorageSync(STORAGE_KEYS.USER);
    wx.removeStorageSync(STORAGE_KEYS.OPENID);
  } catch (e) {
    /* ignore */
  }
  // 清除 401 重登钩子,避免登出后旧 token 仍触发重登
  setUnauthorizedHandler(null);
}

/**
 * App 启动时调用一次:注入 401 重登钩子。
 * 注意:仅注入钩子,不主动登录(避免冷启动弹授权 / 隐私合规风险)。
 */
function initAuth() {
  setUnauthorizedHandler(handle401);
}

module.exports = {
  STORAGE_KEYS,
  getToken,
  setToken,
  getUserInfo,
  setUserInfo,
  isLoggedIn,
  isVerified,
  getUid,
  login,
  ensureLogin,
  logout,
  handle401,
  initAuth,
};
