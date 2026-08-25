// cloudfunctions/payment/index.js
// 任务：task-017 — 支付云函数（微信支付·云调用）
//
// 动作：
//   create:  为一条 pending 报名创建微信支付订单 → 返回 prepay 参数（前端 wx.requestPayment 用）
//   notify:  接收微信支付结果通知（unifiedOrder 指定的 functionName='payment'） → 标记 payments/registrations 为 paid
//   query:   查询某场次当前用户的支付态（客户端轮询兜底，正常由 notify 异步翻转）
//
// 信任与约束（见 coding-style 第14/15/17/19节）：
//   - 身份走 common/session.verifyToken(event.token)。
//   - create 复用「先报名后支付」：仅对已存在的 pending 报名下单；金额来自 events.price（分）。
//   - payments 唯一索引 transaction_id（schema）防止重复入账；registrations.status: pending→paid。
//   - 数据访问统一走 common/db（技术方案第4节 / coding-style 第12节）。
//
// 错误码：401 未登录 / 400 参数 / 404 不存在（未报名/场次） / 409 冲突（已支付/已退款）
//         / 503 第三方不可用（下单失败）
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const { query, getById, insert, update } = require('common/db');
const { verifyToken } = require('common/session');
const { isPayConfigured, unifiedOrder, resultNotification } = require('common/pay');

const REG_COLL = 'registrations';
const PAY_COLL = 'payments';

// 生成商户订单号（幂等：同一次报名复用同一 out_trade_no）
function genOutTradeNo(regId) {
  const ts = Date.now();
  const suffix = regId ? regId.slice(-6) : '000000';
  return `BBD-${ts}-${suffix}`;
}

// 查「我对该场次的报名」
async function findMyReg(uid, eventId) {
  const res = await query(REG_COLL, { where: { user_id: uid, event_id: eventId }, pageSize: 1 });
  if (res.code !== 0) return { error: { code: 500, message: res.message } };
  const reg = res.data.list && res.data.list[0];
  return { reg: reg || null };
}

// 下单：为 pending 报名建支付单 + 调微信支付统一下单
async function handleCreate(event) {
  // 1) 身份
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  // 2) 参数
  const { event_id } = event || {};
  if (!event_id || typeof event_id !== 'string') return { code: 400, message: '缺少场次 id' };

  // 3) 报名必须存在（先报名后支付）
  const { reg, error } = await findMyReg(payload.uid, event_id);
  if (error) return error;
  if (!reg) return { code: 404, message: '请先报名该场次' };
  if (reg.status === 'paid') return { code: 409, message: '该场次已支付' };
  if (reg.status === 'refunded') return { code: 409, message: '该报名已退款，不可重复支付' };

  // 4) 场次金额（分）
  const ev = await getById('events', event_id);
  if (ev.code !== 0) return { code: 500, message: ev.message };
  if (!ev.data) return { code: 404, message: '场次不存在' };
  const amountFen = Math.round((ev.data.price || 0) * 100);
  if (amountFen <= 0) return { code: 400, message: '该场次无需支付' };

  // 5) 幂等：已有 pending 支付单则复用 out_trade_no，否则新建
  const existPay = await query(PAY_COLL, { where: { reg_id: reg._id, status: 'pending' }, pageSize: 1 });
  let payDoc;
  if (existPay.code === 0 && existPay.data.list && existPay.data.list[0]) {
    payDoc = existPay.data.list[0];
  } else {
    const outTradeNo = genOutTradeNo(reg._id);
    const ins = await insert(PAY_COLL, {
      reg_id: reg._id,
      user_id: payload.uid,
      event_id,
      amount: ev.data.price,
      status: 'pending',
      out_trade_no: outTradeNo,
      created_at: new Date().toISOString(),
    });
    if (ins.code !== 0) return { code: 500, message: ins.message };
    payDoc = { _id: ins.data._id, out_trade_no: outTradeNo, amount: ev.data.price };
  }

  // 6) 未配置商户号 → dev 占位（不触真实计费），前端流程仍可演示
  if (!isPayConfigured()) {
    return {
      code: 0,
      message: 'ok',
      data: { devStub: true, outTradeNo: payDoc.out_trade_no, amount: payDoc.amount },
    };
  }

  // 7) 真实下单
  let order;
  try {
    order = await unifiedOrder({
      body: `盲盒约饭-${ev.data.city || ''}`,
      outTradeNo: payDoc.out_trade_no,
      spbillCreateIp: '127.0.0.1',
      subMchId: process.env.WXPAY_SUB_MCH_ID,
      totalFee: amountFen,
      envId: cloud.DYNAMIC_CURRENT_ENV,
      functionName: 'payment',
    });
  } catch (e) {
    return { code: 503, message: `微信支付下单失败: ${e.message || e}` };
  }
  if (!order || (order.errcode && order.errcode !== 0)) {
    return { code: 503, message: '微信支付下单失败' };
  }
  return {
    code: 0,
    message: 'ok',
    data: {
      devStub: false,
      outTradeNo: payDoc.out_trade_no,
      prepay: {
        nonceStr: order.nonceStr,
        package: order.package,
        paySign: order.paySign,
        signType: order.signType,
        timeStamp: order.timeStamp,
      },
    },
  };
}

// 支付结果通知：标记 payments/registrations 为 paid（幂等）
async function handleNotify(event, context) {
  const res = await resultNotification(event, context);
  // 必须把解析结果原样返回给微信；非成功直接回传
  if (!res || res.returnCode !== 'SUCCESS' || res.resultCode !== 'SUCCESS') {
    return res;
  }
  const { outTradeNo, transactionId } = res;

  const pay = await query(PAY_COLL, { where: { out_trade_no: outTradeNo }, pageSize: 1 });
  if (pay.code === 0 && pay.data.list && pay.data.list[0]) {
    const p = pay.data.list[0];
    if (p.status !== 'paid') {
      const paidAt = new Date().toISOString();
      const updPay = await update(PAY_COLL, { _id: p._id, status: 'paid', transaction_id: transactionId, paid_at: paidAt });
      if (updPay.code !== 0) return { ...res, resultCode: 'FAIL', returnMsg: 'mark payment failed' };
      const updReg = await update(REG_COLL, { _id: p.reg_id, status: 'paid', paid_at: paidAt });
      if (updReg.code !== 0) return { ...res, resultCode: 'FAIL', returnMsg: 'mark registration failed' };
    }
  }
  return res;
}

// 查询支付态（客户端兜底：notify 异步翻转前可见）
async function handleQuery(event) {
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };
  const { event_id } = event || {};
  if (!event_id || typeof event_id !== 'string') return { code: 400, message: '缺少场次 id' };
  const { reg } = await findMyReg(payload.uid, event_id);
  return { code: 0, message: 'ok', data: { status: reg ? reg.status : null } };
}

exports.main = async (event, context) => {
  // 无 action（也无 token 注入）→ 视为微信支付结果通知
  try {
    if (event && event.action === 'create') return await handleCreate(event);
    if (event && event.action === 'query') return await handleQuery(event);
    return await handleNotify(event, context);
  } catch (err) {
    return { code: 500, message: err.message || '操作失败' };
  }
};
