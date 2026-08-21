/**
 * utils/request.js — 云函数调用统一封装层
 *
 * 约定(全仓云函数必须遵守,见 docs/coding-style.md「云函数响应约定」):
 *   成功:  { code: 0, message: 'ok', data: <任意 payload> }
 *   失败:  { code: <错误码>, message: '<人类可读文案>' }
 *   错误码: 400 参数 / 401 未登录 / 402 未实名 / 403 不满足 / 404 不存在
 *          409 冲突 / 429 限频 / 500 服务异常 / 503 第三方不可用
 *
 * 能力:
 *   1. 自动注入登录态 token(从 storage 读取,key='token')
 *   2. 统一错误码 → 人类可读文案 + wx.showToast 提示
 *   3. loading 计数(并发请求只显示一次 loading,全部完成才隐藏)
 *   4. 401 自动重登(通过 setUnauthorizedHandler 注入重登函数;未注入则不重登)
 */

const DEFAULT_LOADING_TEXT = '加载中';

// 模块级状态
let loadingCount = 0;
let unauthorizedHandler = null;

// 统一错误码 → 文案
const ERROR_MESSAGES = {
  400: '请求参数有误',
  401: '登录已失效，请重新登录',
  402: '请先完成实名认证',
  403: '当前操作不满足条件',
  404: '内容不存在或已删除',
  409: '操作冲突（重复或名额已满）',
  429: '操作太频繁，请稍后再试',
  500: '服务器开小差了，请稍后再试',
  503: '服务暂时不可用',
};

// loading 计数:并发时只显示一次
function showLoading() {
  loadingCount += 1;
  if (loadingCount === 1) {
    wx.showLoading({ title: DEFAULT_LOADING_TEXT, mask: false });
  }
}

function hideLoading() {
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0) {
    wx.hideLoading();
  }
}

/**
 * 注入 401 重登处理函数。
 * 由 auth 模块实现并注入(见 task-005 / task-011),
 * 函数签名: () => Promise<void>,resolve 表示重登成功可重试原请求。
 */
function setUnauthorizedHandler(handler) {
  // 传函数则注入重登逻辑;传 null / undefined 则清除(如登出时)
  if (typeof handler === 'function') {
    unauthorizedHandler = handler;
  } else if (handler === null || handler === undefined) {
    unauthorizedHandler = null;
  }
}

/**
 * 纯函数:解释云函数返回结构。便于离线单测,不依赖 wx。
 * @returns {{ok:boolean, data?:any, error?:{code:number, message:string}}}
 */
function interpretResult(result) {
  if (!result || typeof result !== 'object') {
    return { ok: false, error: { code: -1, message: '返回数据异常' } };
  }
  const code = result.code;
  if (code === 0) {
    return { ok: true, data: result.data };
  }
  const message = result.message || ERROR_MESSAGES[code] || '未知错误';
  return { ok: false, error: { code, message } };
}

function getToken() {
  try {
    return wx.getStorageSync('token') || '';
  } catch (e) {
    return '';
  }
}

/**
 * 统一调用云函数
 * @param {Object} options
 *   name                {string}  云函数名(必填)
 *   action              {string}  云函数内部分发动作(可选)
 *   data                {Object}  业务参数(可选)
 *   loading             {boolean} 是否显示 loading(默认 true)
 *   retryOnUnauthorized {boolean} 401 时是否尝试重登并重发(默认 true)
 * @returns {Promise<any>} resolve 值为 result.data;reject 值为 {code, message}
 */
function callFunction(options) {
  const {
    name,
    action,
    data = {},
    loading = true,
    retryOnUnauthorized = true,
  } = options;

  if (!name) {
    return Promise.reject({ code: -1, message: '缺少云函数名' });
  }

  if (loading) showLoading();

  return new Promise((resolve, reject) => {
    const payload = { ...data };
    const token = getToken();
    if (token) payload.token = token;
    if (action) payload.action = action;

    wx.cloud.callFunction({
      name,
      data: payload,
      success: (res) => {
        const { ok, data: resultData, error } = interpretResult(res.result);
        if (ok) {
          resolve(resultData);
          return;
        }
        // 401 且已注入重登处理器:重登后重试一次(关闭二次重登避免死循环)
        if (error.code === 401 && retryOnUnauthorized && unauthorizedHandler) {
          unauthorizedHandler()
            .then(() => callFunction({ ...options, retryOnUnauthorized: false }))
            .then(resolve)
            .catch(reject);
          return;
        }
        wx.showToast({ title: error.message, icon: 'none' });
        reject(error);
      },
      fail: (err) => {
        const error = { code: -1, message: '网络异常，请检查网络连接', detail: err };
        wx.showToast({ title: error.message, icon: 'none' });
        reject(error);
      },
      complete: () => {
        if (loading) hideLoading();
      },
    });
  });
}

module.exports = {
  callFunction,
  setUnauthorizedHandler,
  interpretResult,
  ERROR_MESSAGES,
};
