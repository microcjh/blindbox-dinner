// mock: 模拟 wx-server-sdk（events 云函数 + common/db 用到的能力）
// 与 verify mock 的关键区别：collection(name) 返回**共享 ctx 的链对象**，
// 其 where/orderBy/field/skip/limit 全部 return this，从而支持
//   db.collection(n).where().orderBy().field().skip().limit().get()
// 这类连续链式调用（common/db.query 正是如此）。
// 内存 store 按集合名隔离；通过 __reset / __store / __callLog 暴露状态供单测断言。
const store = {}; // { collection: [record,...] }
const seq = { n: 0 };
const callLog = { add: [], get: [], count: [], update: [], remove: [] };

function genId() {
  seq.n += 1;
  return `mock_id_${seq.n}`;
}

// 等值 where 匹配（仅支持字面量等值，足够覆盖 events/common/db 场景）
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

        // 共享 ctx：所有方法 return api，连续调用累积到同一 ctx
        const ctx = { where: {}, skipN: 0, limitN: 1000, fields: null, order: [] };
        const api = {
          where(cond) {
            ctx.where = Object.assign(ctx.where, cond);
            return api;
          },
          field(fields) {
            // 兼容真实 SDK：既接受数组 ['a','b']，也接受对象 {a:true,b:true}
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
          // doc 走独立链（按 _id 单条操作）
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
};

cloud.__reset = () => {
  // 保留集合键、只清空数组，避免测试手动 push 时集合未初始化
  Object.keys(store).forEach((k) => { store[k].length = 0; });
  callLog.add.length = 0;
  callLog.get.length = 0;
  callLog.count.length = 0;
  callLog.update.length = 0;
  callLog.remove.length = 0;
  seq.n = 0;
};

cloud.__callLog = callLog;
// getter 暴露 store，确保 __reset 清空后引用始终最新（避免测试拿到旧空对象）
Object.defineProperty(cloud, '__store', {
  get() { return store; },
});

module.exports = cloud;
