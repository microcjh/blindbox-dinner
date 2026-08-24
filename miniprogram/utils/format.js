// utils/format.js — 纯展示格式化工具（无 wx 依赖，可单测）
// 专供前端页面/组件把云函数返回的原始字段转成人类可读文案。

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/**
 * ISO 时间 → 'MM-DD HH:mm'（按本地时区展示）
 * @param {string} iso ISO 时间字符串
 * @returns {string}
 */
function formatEventTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 价格 → '¥xx'（整数不加小数，非整数保留两位）
 * @param {number} n
 * @returns {string}
 */
function formatPrice(n) {
  const num = Number(n) || 0;
  return '¥' + (Number.isInteger(num) ? num : num.toFixed(2));
}

module.exports = { formatEventTime, formatPrice, pad };
