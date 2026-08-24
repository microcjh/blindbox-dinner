// mock: 模拟 wx-server-sdk（payment 云函数 + common/db 用到的能力）
// 与 events/register mock 同范式：collection(name) 返回**共享 ctx 的链对象**，其方法全部 return this，
// 支持 db.collection(n).where().orderBy().field().skip().limit().get() 连续链式调用。
// 额外模拟 cloud.cloudPay（统一下单 / 支付结果通知），支持 dev 占位与真实下单两条路径。
const store = {}; // { collection: [record,...] }
const seq = { n: 0 };
const callLog = { add: [], get: [], count: [], update: [], remove: [], unifiedOrder: [], resultNotification: [] };

function genId() {
  seq.n += 1;
  return `mock_id_${seq.n}`;
}

// 等值 where 匹配（仅支持字面量等值，足够覆盖 payment/common/db 场景）
function matchRecords(list, where) {
  if (!where || Object.keys(where).length === 0) return list.slice();
  return list.filter((r) => Object.keys(where).every((k) => r[k] === where[k]));
}

function sortBy(list, order) {
  if (!order || !order.length) return list;
  const arr = list.slice();
  arr.sort((a, b) => {
    for (const [field, dir] of order) {
      const av = a[field];
      const bv = b[field];
      if (av < bv) return dir === 'desc' ? 1 : -1;
      if (av > bv) return dir === 'desc' ? -1 : 1;
    }
    return 0;
  });
  return arr;
}

function project(list, fields) {
  if (!fields) return list;
  return list.map((r) => {
    const out = {};
    fields.forEach((k) => { out[k] = r[k]; });
    return out;
  });
}

// cloudPay 模拟开关：默认 dev（不触真实下单），测试可切真实以覆盖下单分支
const payConfig = { configured: false };

const cloud = {
  init() {},
  DYNAMIC_CURRENT_ENV: 'mock-env',
  getWXContext() {
    return { OPENID: 'mock-openid', APPID: 'mock-appid', UNIONID: null };
  },
  database() {
    return {
      collection(name) {
        if (!store[name]) store[name] = [];
        const list = store[name];

        const ctx = { where: {}, skipN: 0, limitN: 1000, fields: null, order: [] };
        const api = {
          where(cond) {
            ctx.where = Object.assign(ctx.where, cond);
            return api;
          },
          field(fields) {
            let f;
            if (Array.isArray(fields)) f = fields;
            else if (fields && typeof fields === 'object') f = Object.keys(fields);
            else f = [fields];
            ctx.fields = f;
            return api;
          },
          orderBy(field, dir) {
            ctx.order.push([field, dir]);
            return api;
          },
          skip(n) {
            ctx.skipN = n;
            return api;
          },
          limit(n) {
            ctx.limitN = n;
            return api;
          },
          async get() {
            callLog.get.push(name);
            let data = matchRecords(list, ctx.where);
            data = sortBy(data, ctx.order);
            data = data.slice(ctx.skipN, ctx.skipN + ctx.limitN);
            return { data: project(data, ctx.fields) };
          },
          async count() {
            callLog.count.push(name);
            return { total: matchRecords(list, ctx.where).length };
          },
          async update({ data }) {
            let updated = 0;
            for (const r of matchRecords(list, ctx.where)) {
              Object.assign(r, data);
              updated += 1;
            }
            callLog.update.push(name);
            return { stats: { updated } };
          },
          doc(id) {
            return {
              field() { return this; },
              async get() {
                const rec = list.find((r) => r._id === id);
                return { data: rec ? [rec] : [] };
              },
              async update({ data }) {
                const rec = list.find((r) => r._id === id);
                if (rec) {
                  Object.assign(rec, data);
                  callLog.update.push(name);
                  return { stats: { updated: 1 } };
                }
                return { stats: { updated: 0 } };
              },
              async remove() {
                const idx = list.findIndex((r) => r._id === id);
                if (idx >= 0) {
                  list.splice(idx, 1);
                  return { stats: { removed: 1 } };
                }
                return { stats: { removed: 0 } };
              },
            };
          },
          async remove() {
            callLog.remove.push(name);
            const matched = matchRecords(list, ctx.where);
            const ids = new Set(matched.map((r) => r._id));
            const before = list.length;
            for (let i = list.length - 1; i >= 0; i -= 1) {
              if (ids.has(list[i]._id)) list.splice(i, 1);
            }
            return { stats: { removed: before - list.length } };
          },
          async add({ data }) {
            callLog.add.push(name);
            const rec = { _id: genId(), ...data };
            list.push(rec);
            return { _id: rec._id };
          },
        };
        return api;
      },
    };
  },
  cloudPay: {
    // dev 占位：configured=false 时下单分支走 devStub，本方法不会被调用
    unifiedOrder(opts) {
      callLog.unifiedOrder.push(opts);
      // 模拟微信支付成功返回 prepay 参数
      return Promise.resolve({
        errcode: 0,
        nonceStr: 'nonce_' + (opts.outTradeNo || 'x'),
        package: 'prepay_id=prepay_' + (opts.outTradeNo || 'x'),
        paySign: 'sign_' + (opts.outTradeNo || 'x'),
        signType: 'MD5',
        timeStamp: String(Math.floor(Date.now() / 1000)),
      });
    },
    resultNotification(event, context) {
      callLog.resultNotification.push({ event, context });
      // 真实微信支付：回调报文自带 returnCode/resultCode，云函数解析后原样回传。
      // mock 尊重入参（测试可模拟失败通知）；无报文时默认成功。
      if (event && (event.returnCode || event.resultCode)) {
        return Promise.resolve({
          returnCode: event.returnCode,
          resultCode: event.resultCode,
          outTradeNo: event.outTradeNo,
          transactionId: event.transactionId || ('WXTXN_' + (event.outTradeNo || 'mock')),
        });
      }
      const outTradeNo = (event && event.outTradeNo) || 'BBD-mock';
      const transactionId = 'WXTXN_' + outTradeNo;
      return Promise.resolve({
        returnCode: 'SUCCESS',
        resultCode: 'SUCCESS',
        outTradeNo,
        transactionId,
      });
    },
  },
};

cloud.__reset = () => {
  Object.keys(store).forEach((k) => { store[k].length = 0; });
  callLog.add.length = 0;
  callLog.get.length = 0;
  callLog.count.length = 0;
  callLog.update.length = 0;
  callLog.remove.length = 0;
  callLog.unifiedOrder.length = 0;
  callLog.resultNotification.length = 0;
  seq.n = 0;
  payConfig.configured = false;
};

cloud.__setPayConfigured = (v) => { payConfig.configured = !!v; };
cloud.__payConfig = payConfig;
cloud.__callLog = callLog;
Object.defineProperty(cloud, '__store', {
  get() { return store; },
});

module.exports = cloud;
