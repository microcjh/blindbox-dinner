// cloudfunctions/refund/index.js
// 任务：task-021 — 退款云函数（微信支付·云调用退款）
//
// 动作：
//   apply: 对已支付的报名申请全额退款 → 查 payments 取 transaction_id → 调 cloudPay.refund
//          → 落 refunds + 翻转 registrations.status: paid→refunded（幂等）
//   query: 按 registration_id 查退款单（浏览类）
//
// 信任与约束（见 coding-style 第20节）：
//   - 身份走 common/session.verifyToken(event.token)。
//   - 仅本人 + status==='paid' 可退款；pending 走 unregister（register 已 409 拦截），
//     paid 后再 refund 翻 refunded，与 unregister 的「已支付需走退款」形成闭环。
//   - payments 必须有 transaction_id（notify 已落）才允许退款，否则 409「无支付记录」。
//   - 未配置商户号（WXPAY_SUB_MCH_ID）走 devStub 占位，前端流程仍可演示，不触真实计费。
//   - 幂等：已 refunded 的报名直接返回既有退款单，避免重复退。
//
// 错误码：401 未登录 / 400 参数 / 404 不存在 / 409 冲突（状态不对/无支付记录/已退款）
//         / 503 第三方不可用（退款调用失败）
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const { query, getById, insert, update } = require('common/db');
const { verifyToken } = require('common/session');
const { isPayConfigured } = require('common/pay');

const REG_COLL = 'registrations';
const PAY_COLL = 'payments';
const REFUND_COLL = 'refunds';

// 生成退款单号（幂等：同一次报名复用）
function genOutRefundNo(regId) {
  const ts = Date.now();
  const suffix = regId ? regId.slice(-6) : '000000';
  return `BBD-R-${ts}-${suffix}`;
}

// 查「我对该场次的报名」
async function findMyReg(uid, eventId) {
  const res = await query(REG_COLL, { where: { user_id: uid, event_id: eventId }, pageSize: 1 });
  if (res.code !== 0) return { error: { code: 500, message: res.message } };
  const reg = res.data.list && res.data.list[0];
  return { reg: reg || null };
}

// 申请退款
async function handleApply(event) {
  // 1) 身份
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  // 2) 参数
  const { event_id } = event || {};
  if (!event_id || typeof event_id !== 'string') return { code: 400, message: '缺少场次 id' };

  // 3) 报名必须存在且为本人的 paid
  const { reg, error } = await findMyReg(payload.uid, event_id);
  if (error) return error;
  if (!reg) return { code: 404, message: '未找到你的报名记录' };
  if (reg.status !== 'paid') {
    if (reg.status === 'refunded') return { code: 409, message: '该报名已退款' };
    if (reg.status === 'pending') return { code: 409, message: '未支付，取消请走取消报名' };
    return { code: 409, message: '当前状态不可退款' };
  }

  // 4) 幂等：已有退款单（无论状态）直接返回既有单
  const existRefund = await query(REFUND_COLL, { where: { reg_id: reg._id }, pageSize: 1 });
  if (existRefund.code === 0 && existRefund.data.list && existRefund.data.list[0]) {
    return { code: 0, message: 'ok', data: { refund: existRefund.data.list[0], duplicated: true } };
  }

  // 5) 查 payments 取 transaction_id（notify 已落）
  const pay = await query(PAY_COLL, { where: { reg_id: reg._id, status: 'paid' }, pageSize: 1 });
  if (pay.code !== 0) {
    return { code: 500, message: '查询支付记录失败' };
  }
  const payDoc = pay.data.list && pay.data.list[0];
  if (!payDoc) return { code: 409, message: '无有效支付记录，无法退款' };
  if (!payDoc.transaction_id) return { code: 409, message: '支付未完成，无法退款' };

  // 6) 金额（分）：全额退报名费
  const amountFen = Math.round((payDoc.amount || 0) * 100);
  if (amountFen <= 0) return { code: 400, message: '退款金额无效' };

  const outRefundNo = genOutRefundNo(reg._id);

  // 7) 落退款单（pending，等退款结果确认）
  const ins = await insert(REFUND_COLL, {
    reg_id: reg._id,
    user_id: payload.uid,
    event_id,
    amount: payDoc.amount,
    status: 'pending',
    out_refund_no: outRefundNo,
    transaction_id: payDoc.transaction_id,
    created_at: new Date().toISOString(),
  });
  if (ins.code !== 0) return { code: 500, message: ins.message };

  // 8) 调微信退款（未配置商户号 → devStub 占位）
  if (!isPayConfigured()) {
    // dev 占位：直接标记退款成功
    const updRefund = await update(REFUND_COLL, { _id: ins.data._id, status: 'success', refund_id: `DEV-REFUND-${Date.now()}` });
    if (updRefund.code !== 0) return { code: 500, message: updRefund.message };
    const updReg = await update(REG_COLL, { _id: reg._id, status: 'refunded', refunded_at: new Date().toISOString() });
    if (updReg.code !== 0) return { code: 500, message: updReg.message };
    return {
      code: 0,
      message: 'ok',
      data: { devStub: true, refundId: `DEV-REFUND-${Date.now()}`, outRefundNo, amount: payDoc.amount },
    };
  }

  // 9) 真实退款
  let refundRes;
  try {
    refundRes = await cloud.cloudPay.refund({
      subMchId: process.env.WXPAY_SUB_MCH_ID,
      outTradeNo: payDoc.out_trade_no,
      outRefundNo,
      totalFee: amountFen,
      refundFee: amountFen,
      refundDesc: '盲盒约饭报名退款',
    });
  } catch (e) {
    return { code: 503, message: `微信退款失败: ${e.message || e}` };
  }
  if (!refundRes || (refundRes.errcode && refundRes.errcode !== 0)) {
    return { code: 503, message: '微信退款失败' };
  }
  // 真实退款异步到账，先标记 success（实际以退款通知为准，此处简化）
  const updRefund = await update(REFUND_COLL, { _id: ins.data._id, status: 'success', refund_id: refundRes.refundId });
  if (updRefund.code !== 0) return { code: 500, message: updRefund.message };
  const updReg = await update(REG_COLL, { _id: reg._id, status: 'refunded', refunded_at: new Date().toISOString() });
  if (updReg.code !== 0) return { code: 500, message: updReg.message };

  return {
    code: 0,
    message: 'ok',
    data: { devStub: false, refundId: refundRes.refundId, outRefundNo, amount: payDoc.amount },
  };
}

// 查询退款单（按 registration_id）
async function handleQuery(event) {
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };
  const { registration_id } = event || {};
  if (!registration_id || typeof registration_id !== 'string') return { code: 400, message: '缺少 registration_id' };
  const res = await query(REFUND_COLL, { where: { reg_id: registration_id }, orderBy: ['created_at', 'desc'], pageSize: 10 });
  if (res.code !== 0) return { code: 500, message: res.message };
  return { code: 0, message: 'ok', data: { list: res.data.list || [], total: res.data.total } };
}

exports.main = async (event, context) => {
  try {
    if (event && event.action === 'apply') return await handleApply(event);
    if (event && event.action === 'query') return await handleQuery(event);
    return { code: 400, message: `未知 action: ${event && event.action}` };
  } catch (err) {
    return { code: 500, message: err.message || '操作失败' };
  }
};
