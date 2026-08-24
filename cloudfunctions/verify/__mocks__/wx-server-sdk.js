// mock: 模拟 wx-server-sdk（verify 云函数 + common/db 用到的能力）
// 在 auth mock 基础上扩展：支持 doc(id).update({ data }) 与 doc(id).remove()，供 verify 回填 users。
// 内存 store 按集合名隔离；通过 __reset / __store / __callLog 暴露状态供单测断言。
const store = {}; // { collection: [record,...] }
const seq = { n: 0 };
const callLog = { add: [], get: [], count: [], update: [] };

function genId() {
  seq.n += 1;
  return `mock_id_${seq.n}`;
}

// 等值 where 匹配（仅支持字面量等值，足够覆盖 verify/common/db 场景）
function matchRecords(list, where) {
  if (!where || Object.keys(where).length === 0) return list.slice();
  return list.filter((r) => Object.keys(where).every((k) => r[k] === where[k]));
}

function buildChain(name) {
  const ctx = { where: {}, skipN: 0, limitN: 1000, fields: null };
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
    orderBy() {
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
      let data = matchRecords(store[name] || [], ctx.where);
      data = data.slice(ctx.skipN, ctx.skipN + ctx.limitN);
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
      return { total: matchRecords(store[name] || [], ctx.where).length };
    },
    async update({ data }) {
      // where 条件更新：命中记录逐条合并
      const list = store[name] || [];
      let updated = 0;
      for (const r of matchRecords(list, ctx.where)) {
        Object.assign(r, data);
        updated += 1;
      }
      callLog.update.push(name);
      return { stats: { updated } };
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
          where(cond) { return buildChain(name).where(cond); },
          field(f) { return buildChain(name).field(f); },
          orderBy() { return buildChain(name); },
          skip(n) { return buildChain(name).skip(n); },
          limit(n) { return buildChain(name).limit(n); },
          get() { return buildChain(name).get(); },
          count() { return buildChain(name).count(); },
          update(d) { return buildChain(name).update(d); },
          doc(id) {
            return {
              field() { return this; },
              async get() {
                const rec = (list || []).find((r) => r._id === id);
                return { data: rec ? [rec] : [] };
              },
              async update({ data }) {
                const rec = (list || []).find((r) => r._id === id);
                if (rec) {
                  Object.assign(rec, data);
                  callLog.update.push(name);
                  return { stats: { updated: 1 } };
                }
                return { stats: { updated: 0 } };
              },
              async remove() {
                const idx = (list || []).findIndex((r) => r._id === id);
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
  seq.n = 0;
};

cloud.__callLog = callLog;
// getter 暴露 store，确保 __reset 清空后引用始终最新（避免测试拿到旧空对象）
Object.defineProperty(cloud, '__store', {
  get() { return store; },
});

module.exports = cloud;
