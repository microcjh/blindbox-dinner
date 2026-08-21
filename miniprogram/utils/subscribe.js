/**
 * utils/subscribe.js — 微信订阅消息封装
 *
 * 职责:
 *   1. 集中管理订阅消息模板 ID(按业务场景分组)
 *   2. 在「用户点击手势」中请求授权(微信审核强约束:不能在 onLoad 自动弹)
 *   3. 解析授权结果(accept/reject/ban),缓存已接受的模板,避免重复弹窗
 *   4. 提供查询/清除接口
 *
 * 重要边界:
 *   - 订阅消息的「发送」在云函数侧调用 cloud.openapi.subscribeMessage.send 完成,
 *     前端只负责「请求授权」与「记录授权状态」,本模块不涉及发送。
 *   - 一次性订阅:用户授权后,服务端仅在 7 天内可发 1 条;社交类目无长期订阅权限。
 *   - 授权失败/拒绝绝不可阻断主流程(如报名成功但用户拒订阅,饭局照常)。
 *
 * 依赖: 无(纯前端,不依赖 request.js / auth.js)
 * 后端: task-015 match / task-016 register 等云函数在发送时读取场景模板 ID
 *
 * 模板 ID 占位说明:
 *   以下 tmpl_* 均为占位串,需在「微信公众平台 → 功能 → 订阅消息 → 我的模板」
 *   申请真实模板后,用真实模板 ID 替换(形如 wSxjJxxxxxxxxxxxxxxxxxxxx)。
 */

// 订阅场景 → 模板 ID 映射(占位,待替换真实 ID)
const TEMPLATES = {
  // 报名成功通知:用户完成报名支付后
  enroll_success: 'tmpl_enroll_success_placeholder',
  // 盲盒揭晓(匹配成功):组局完成、同桌确定后
  match_success: 'tmpl_match_success_placeholder',
  // 饭局开始前提醒:开饭前 2 小时
  meal_reminder: 'tmpl_meal_reminder_placeholder',
  // 评价提醒:饭局结束后
  review_reminder: 'tmpl_review_reminder_placeholder',
  // SOS 求助响应:求助被附近用户响应时
  sos_alert: 'tmpl_sos_alert_placeholder',
};

// 授权状态缓存的 storage key
const STORAGE_KEY = 'subscribed_templates';

// 微信 errCode: 用户勾选「总是保持以上选择,不再询问」(即 ban)
const ERR_USER_BAN = 20004;

function hasWx() {
  return typeof wx !== 'undefined' && wx && typeof wx.requestSubscribeMessage === 'function';
}

function getGranted() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || {};
  } catch (e) {
    return {};
  }
}

function setGranted(map) {
  try {
    wx.setStorageSync(STORAGE_KEY, map || {});
  } catch (e) {
    /* storage 不可用(隐私拒绝等)时静默失败 */
  }
}

/**
 * 判断某场景是否已授权(用于决定是否弹授权框 / 是否提示去设置页)。
 * @param {string} key 场景键,取值见 TEMPLATES
 * @returns {boolean}
 */
function isGranted(key) {
  const g = getGranted();
  return !!(g && g[key] === true);
}

/**
 * 返回所有已授权场景键列表。
 * @returns {string[]}
 */
function getGrantedKeys() {
  const g = getGranted();
  return Object.keys(g).filter((k) => g[k] === true);
}

/**
 * 登出 / 清空授权缓存(通常在 auth.logout 内一并调用)。
 */
function clearGranted() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch (e) {
    /* ignore */
  }
}

/**
 * 解析一组场景键为模板 ID 数组。
 * @private
 */
function resolveTmplIds(keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  return list
    .map((k) => TEMPLATES[k])
    .filter((id) => typeof id === 'string' && id.length > 0);
}

/**
 * 请求订阅消息授权。
 *
 * ⚠️ 必须由页面「用户点击」事件处理函数调用(如 bindtap 回调),
 *    禁止在 onLoad / 定时器里自动调用,否则微信审核会拒。
 *
 * 不 reject(订阅失败不应阻断主流程),始终 resolve 一个结果对象。
 *
 * @param {string|string[]} keys 场景键或数组,取值见 TEMPLATES
 * @param {object} [options]
 * @param {boolean} [options.silent=false] 是否静默(不业务侧 toast);默认 false 由调用方自行处理
 * @returns {Promise<{accepted:string[],rejected:string[],banned:boolean,all:object,granted:object}>}
 */
function requestSubscribe(keys, options = {}) {
  const list = Array.isArray(keys) ? keys : [keys];
  const validKeys = list.filter((k) => Object.prototype.hasOwnProperty.call(TEMPLATES, k));
  const tmplIds = resolveTmplIds(validKeys);

  // 无有效模板:直接返回空结果,不触碰 wx
  if (tmplIds.length === 0 || !hasWx()) {
    return Promise.resolve({
      accepted: [],
      rejected: [],
      banned: false,
      all: {},
      granted: getGranted(),
    });
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        const accepted = [];
        const rejected = [];
        const all = {};
        const granted = getGranted();
        validKeys.forEach((k) => {
          const status = res[TEMPLATES[k]];
          all[k] = status;
          if (status === 'accept') {
            accepted.push(k);
            granted[k] = true;
          } else if (status === 'reject') {
            rejected.push(k);
            granted[k] = false;
          }
          // status === 'ban' 时:本次及以后不再弹窗,直到用户去设置页手动开启
        });
        setGranted(granted);
        resolve({ accepted, rejected, banned: false, all, granted });
      },
      fail: (err) => {
        const errMsg = (err && (err.errMsg || '')) || '';
        const banned =
          (err && err.errCode === ERR_USER_BAN) || errMsg.indexOf(String(ERR_USER_BAN)) >= 0;
        resolve({ accepted: [], rejected: [], banned, error: err, all: {}, granted: getGranted() });
      },
    });
  });
}

/**
 * 便捷封装:请求单个场景授权。
 * @param {string} key 场景键
 * @param {object} [options]
 * @returns {Promise<object>} 同 requestSubscribe 返回
 */
function requestScene(key, options = {}) {
  return requestSubscribe(key, options);
}

module.exports = {
  TEMPLATES,
  STORAGE_KEY,
  ERR_USER_BAN,
  hasWx,
  isGranted,
  getGrantedKeys,
  clearGranted,
  resolveTmplIds,
  requestSubscribe,
  requestScene,
};
