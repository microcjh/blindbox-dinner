// mock: 模拟 wx-server-sdk 的 db 链式 API（仅覆盖 db.js 用到的能力）
// 支持：collection(name).where(c).orderBy(f,d).skip(n).limit(n).field(o).get() / .count() / .doc(id)
//       .add() / .update() / .remove()
// get() 返回的数据由 exportedData 提供（按集合名），便于单测断言分页/裁剪结果。

const callLog = {
  where: [],
  orderBy: [],
  skip: [],
  limit: [],
  field: [],
  get: 0,
  count: 0,
  add: 0,
  update: 0,
  remove: 0,
};

// 默认测试数据集：events 集合（含 city/district/time/status）
const DATA = {
  events: [
    { _id: 'e1', city: 'beijing', district: 'chaoyang', time: '2026-09-01', status: 'open' },
    { _id: 'e2', city: 'beijing', district: 'haidian', time: '2026-09-02', status: 'open' },
    { _id: 'e3', city: 'beijing', district: 'chaoyang', time: '2026-09-03', status: 'full' },
    { _id: 'e4', city: 'beijing', district: 'dongcheng', time: '2026-09-04', status: 'open' },
  ],
};

function makeChain(collectionName) {
  const state = { where: null, orderBy: [], skip: 0, limit: 20, field: null };

  const chain = {
    where(c) {
      callLog.where.push(c);
      state.where = c;
      return chain;
    },
    orderBy(field, dir) {
      callLog.orderBy.push([field, dir]);
      state.orderBy.push([field, dir]);
      return chain;
    },
    skip(n) {
      callLog.skip.push(n);
      state.skip = n;
      return chain;
    },
    limit(n) {
      callLog.limit.push(n);
      state.limit = n;
      return chain;
    },
    field(o) {
      callLog.field.push(o);
      state.field = o;
      return chain;
    },
    async get() {
      callLog.get += 1;
      let rows = (DATA[collectionName] || []).slice();
      if (state.where) {
        rows = rows.filter((r) => {
          return Object.keys(state.where).every((k) => {
            const cond = state.where[k];
            if (cond && typeof cond === 'object' && cond.$in) {
              return cond.$in.includes(r[k]);
            }
            return r[k] === cond;
          });
        });
      }
      if (state.orderBy.length) {
        const [field, dir] = state.orderBy[0];
        rows.sort((a, b) => (dir === 'desc' ? (a[field] < b[field] ? 1 : -1) : (a[field] > b[field] ? 1 : -1)));
      }
      let paged = rows.slice(state.skip, state.skip + state.limit);
      if (state.field) {
        paged = paged.map((r) => {
          const out = {};
          Object.keys(state.field).forEach((k) => { if (state.field[k] && k in r) out[k] = r[k]; });
          out._id = r._id;
          return out;
        });
      }
      return { data: paged };
    },
    async count() {
      callLog.count += 1;
      let rows = (DATA[collectionName] || []).slice();
      if (state.where) {
        rows = rows.filter((r) =>
          Object.keys(state.where).every((k) => {
            const cond = state.where[k];
            if (cond && typeof cond === 'object' && cond.$in) return cond.$in.includes(r[k]);
            return r[k] === cond;
          })
        );
      }
      return { total: rows.length };
    },
    doc(id) {
      return {
        async get() {
          callLog.get += 1;
          const all = DATA[collectionName] || [];
          const found = all.filter((r) => r._id === id);
          return { data: found };
        },
        async update() {
          callLog.update += 1;
          return { stats: { updated: 1 } };
        },
        async remove() {
          callLog.remove += 1;
          return { stats: { removed: 1 } };
        },
      };
    },
    async add() {
      callLog.add += 1;
      return { _id: 'new-id' };
    },
    async update() {
      callLog.update += 1;
      return { stats: { updated: 1 } };
    },
    async remove() {
      callLog.remove += 1;
      return { stats: { removed: 1 } };
    },
  };
  return chain;
}

const cloud = {
  init() {},
  DYNAMIC_CURRENT_ENV: 'mock-env',
  getWXContext() {
    return { OPENID: 'mock-openid', APPID: 'mock-appid', UNIONID: null };
  },
  database() {
    return {
      command: {
        in: (arr) => ({ $in: arr }),
        eq: (v) => ({ $eq: v }),
        gt: (v) => ({ $gt: v }),
      },
      collection(name) {
        return makeChain(name);
      },
    };
  },
};

cloud.__callLog = callLog;
cloud.__DATA = DATA;

module.exports = cloud;
