// cloudfunctions/refund/__mocks__/wx-server-sdk.js
// refund 云函数单测用的内存版 wx-server-sdk 模拟。
// 范式为 match/blacklist 等已建云函数的链式 mock 演进版：
//   - db.collection().where().field().orderBy().skip().limit().get() / .count() 链式
//   - add / doc().update() / doc().get() 基础写读
//   - cloudPay.refund 支持 devStub（未配置商户号）与真实（配置商户号，返回 refund_id）
//   - 支持 db.command._.in / _.eq / 数组包含匹配 / $ne / $in
//
// 集合初始数据由各 test 文件在 require 前通过 setStore 注入。

const stores = {
  registrations: [],
  payments: [],
  refunds: [],
};
let autoId = 1000;
function nextId(prefix) { autoId += 1; return `${prefix}_${autoId}`; }

function matchDoc(doc, where) {
  if (!where || Object.keys(where).length === 0) return true;
  return Object.keys(where).every((k) => {
    const cond = where[k];
    const val = doc[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if (cond.$ne !== undefined) return val !== cond.$ne;
      if (cond.$in !== undefined) return cond.$in.includes(val);
      if (cond.$eq !== undefined) return val === cond.$eq;
      return false;
    }
    if (Array.isArray(val)) return val.includes(cond); // 数组包含匹配
    return val === cond;
  });
}

function makeChain(collName) {
  const state = { where: {}, fields: null, orderBy: null, skip: 0, limit: 100 };
  const ctx = {
    where(w) { state.where = { ...state.where, ...w }; return ctx; },
    field(f) { state.fields = Array.isArray(f) ? f : [f]; return ctx; },
    orderBy(f, d) { state.orderBy = [f, d]; return ctx; },
    skip(n) { state.skip = n; return ctx; },
    limit(n) { state.limit = n; return ctx; },
    async get() {
      let list = stores[collName].filter((d) => matchDoc(d, state.where));
      if (state.orderBy) {
        const [f, d] = state.orderBy;
        list = list.slice().sort((a, b) => (a[f] > b[f] ? 1 : -1) * (d === 'desc' ? -1 : 1));
      }
      list = list.slice(state.skip, state.skip + state.limit);
      if (state.fields) list = list.map((d) => {
        const o = {}; state.fields.forEach((k) => { if (k in d) o[k] = d[k]; }); return o;
      });
      return { data: list };
    },
    async count() {
      const list = stores[collName].filter((d) => matchDoc(d, state.where));
      return { total: list.length };
    },
    async add({ data }) {
      const _id = nextId(collName);
      const doc = { _id, ...data };
      stores[collName].push(doc);
      return { _id };
    },
    doc(id) {
      return {
        async get() {
          const d = stores[collName].find((x) => x._id === id);
          return { data: d ? [d] : [] };
        },
        async update({ data }) {
          const d = stores[collName].find((x) => x._id === id);
          if (!d) return { stats: { updated: 0 } };
          Object.assign(d, data);
          return { stats: { updated: 1 } };
        },
      };
    },
  };
  return ctx;
}

const cloud = {
  init() {},
  DYNAMIC_CURRENT_ENV: 'dev',
  database() {
    return {
      collection: (name) => makeChain(name),
      command: {
        _: {
          in: (arr) => ({ $in: arr }),
          eq: (v) => ({ $eq: v }),
          ne: (v) => ({ $ne: v }),
        },
      },
    };
  },
  cloudPay: {
    // 退款：未配置商户号 → devStub（直接成功，不触真实计费）
    async refund(opts) {
      if (!process.env.WXPAY_SUB_MCH_ID) {
        return { refundId: `DEV-REFUND-${Date.now()}`, devStub: true };
      }
      if (opts && opts.forceFail) {
        throw new Error('mock refund failed');
      }
      return { refundId: `REFUND-${Date.now()}`, devStub: false };
    },
  },
};

module.exports = cloud;
module.exports.__setStore = (name, data) => { stores[name] = data || []; };
module.exports.__getStore = (name) => stores[name];
module.exports.__reset = () => {
  stores.registrations = [];
  stores.payments = [];
  stores.refunds = [];
  autoId = 1000;
};
