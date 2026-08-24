// mock: 模拟 wx-server-sdk（blacklist 云函数 + common/db 用到的能力）
// 与 review/match/register/events/payment mock 同范式：collection(name) 返回**共享 ctx 的链对象**，方法全部 return this。
// 支持字面量等值 / $ne / $in / 数组包含 / 分页 / 排序 / 字段裁剪。
// 内存 store 按集合名隔离；通过 __reset / __store / __callLog 暴露状态供单测断言。
const store = {};
const seq = { n: 0 };
const callLog = { add: [], get: [], count: [], update: [], remove: [] };

function genId() {
  seq.n += 1;
  return `mock_id_${seq.n}`;
}

function matchOne(r, k, v) {
  if (v && typeof v === 'object' && '$ne' in v) {
    return r[k] !== v.$ne;
  }
  if (v && typeof v === 'object' && '$in' in v) {
    if (Array.isArray(r[k])) return r[k].some((x) => v.$in.includes(x));
    return v.$in.includes(r[k]);
  }
  if (Array.isArray(r[k])) return r[k].includes(v);
  return r[k] === v;
}

function matchRecords(list, where) {
  if (!where || Object.keys(where).length === 0) return list.slice();
  return list.filter((r) => Object.keys(where).every((k) => matchOne(r, k, where[k])));
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
};

cloud.__reset = () => {
  Object.keys(store).forEach((k) => { store[k].length = 0; });
  callLog.add.length = 0;
  callLog.get.length = 0;
  callLog.count.length = 0;
  callLog.update.length = 0;
  callLog.remove.length = 0;
  seq.n = 0;
};

cloud.__callLog = callLog;
Object.defineProperty(cloud, '__store', {
  get() { return store; },
});

module.exports = cloud;
