// mock: 模拟 wx-server-sdk（覆盖 seed-restaurants + common/db 用到的能力）
// - database().collection(name): 返回支持完整链式的方法 where/field/orderBy/skip/limit/get/count
// - add(): 写入内存 store 并返回 _id
// - 内存 store 按集合名隔离，模拟「已存在」去重逻辑（seed 按 name+address 去重）
// 通过 exportedState 暴露调用记录，供单测断言。

const store = {}; // { collection: [record,...] }
const seq = { n: 0 };

const callLog = {
  add: [],
  get: [],
  count: [],
};

function genId() {
  seq.n += 1;
  return `mock_id_${seq.n}`;
}

// 极简匹配：仅支持等值 where（{name, address} 等）
function matchRecords(list, where) {
  if (!where || Object.keys(where).length === 0) return list.slice();
  return list.filter((r) => Object.keys(where).every((k) => r[k] === where[k]));
}

// 构建一条完整链式（链式方法互相返回自身，最终用 get/count 落地）
function buildChain(name, baseRecords) {
  const ctx = { where: {}, fields: null, skipN: 0, limitN: 1000, order: [] };
  const api = {
    where(cond) {
      ctx.where = Object.assign(ctx.where, cond);
      return api;
    },
    field(fields) {
      const f = Array.isArray(fields) ? fields : [fields];
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
      let data = matchRecords(baseRecords, ctx.where);
      // 字段裁剪（mock 仅做存在性过滤，不影响断言）
      if (ctx.fields) {
        data = data.map((r) => {
          const out = {};
          ctx.fields.forEach((k) => { out[k] = r[k]; });
          return out;
        });
      }
      return { data };
    },
    async count() {
      callLog.count.push(name);
      const data = matchRecords(baseRecords, ctx.where);
      return { total: data.length };
    },
  };
  return api;
}

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
        return {
          // 查询链（每次返回独立 ctx）
          where(cond) { return buildChain(name, list).where(cond); },
          field(fields) { return buildChain(name, list).field(fields); },
          orderBy(field, dir) { return buildChain(name, list).orderBy(field, dir); },
          skip(n) { return buildChain(name, list).skip(n); },
          limit(n) { return buildChain(name, list).limit(n); },
          get() { return buildChain(name, list).get(); },
          count() { return buildChain(name, list).count(); },
          // 写入
          async add({ data }) {
            callLog.add.push(name);
            const rec = { _id: genId(), ...data };
            list.push(rec);
            return { _id: rec._id };
          },
        };
      },
    };
  },
};

cloud.__reset = () => {
  // 保留集合键、只清空数组，避免测试手动 push 时集合未初始化
  Object.keys(store).forEach((k) => { store[k].length = 0; });
  callLog.add.length = 0;
  callLog.get.length = 0;
  callLog.count.length = 0;
  seq.n = 0;
};

cloud.__callLog = callLog;
// 用 getter 暴露 store，确保 __reset 清空后引用始终最新（避免测试中拿到旧空对象）
Object.defineProperty(cloud, '__store', {
  get() { return store; },
});

module.exports = cloud;
