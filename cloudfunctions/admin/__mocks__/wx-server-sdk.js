// 测试用 wx-server-sdk mock（admin 云函数专用）
// 支持链式 query/update，集合 blacklist/sos，含 update 状态翻转支持。
const Module = require('module');
const path = require('path');

const store = {
  blacklist: [
    { _id: 'bl1', reporter: 'u1', target: 'u2', reason: '骚扰', status: 'pending', created_at: '2026-08-20T10:00:00.000Z' },
    { _id: 'bl2', reporter: 'u3', target: 'u4', reason: '欺诈', status: 'resolved', created_at: '2026-08-19T10:00:00.000Z' },
  ],
  sos: [
    { _id: 's1', user_id: 'u1', event_id: 'e1', type: 'medical', status: 'pending', created_at: '2026-08-20T11:00:00.000Z', handled_at: null },
    { _id: 's2', user_id: 'u5', event_id: 'e2', type: 'unsafe', status: 'handled', created_at: '2026-08-19T11:00:00.000Z', handled_at: '2026-08-19T12:00:00.000Z' },
  ],
};
const seq = { n: 100 };
const callLog = { add: [], get: [], count: [], update: [], remove: [] };

function matchWhere(rec, where) {
  if (!where) return true;
  return Object.keys(where).every((k) => {
    if (k === '_id') return rec._id === where._id;
    return rec[k] === where[k];
  });
}

function buildCtx(coll) {
  const ctx = {
    _coll: coll,
    _where: null,
    _orderBy: null,
    _skip: 0,
    _limit: 20,
    _fields: null,
    _id: null,
    where(w) { this._where = w; return this; },
    orderBy(f, dir) { this._orderBy = [f, dir || 'asc']; return this; },
    skip(n) { this._skip = n; return this; },
    limit(n) { this._limit = n; return this; },
    field(f) { this._fields = f; return this; },
    doc(id) { this._id = id; return this; },
    async get() {
      callLog.get.push({ coll, where: this._where, id: this._id });
      let list = store[coll] || [];
      if (this._id) {
        const rec = list.find((r) => r._id === this._id);
        return { data: rec ? [rec] : [] };
      }
      if (this._where) list = list.filter((r) => matchWhere(r, this._where));
      const total = list.length;
      if (this._orderBy) {
        const [f, dir] = this._orderBy;
        list = list.slice().sort((a, b) => {
          if (a[f] < b[f]) return dir === 'desc' ? 1 : -1;
          if (a[f] > b[f]) return dir === 'desc' ? -1 : 1;
          return 0;
        });
      }
      const paged = list.slice(this._skip, this._skip + this._limit);
      return { data: paged, total };
    },
    async count() {
      callLog.count.push({ coll, where: this._where });
      let list = store[coll] || [];
      if (this._where) list = list.filter((r) => matchWhere(r, this._where));
      return { total: list.length };
    },
    async add({ data }) {
      callLog.add.push({ coll, data });
      const _id = `${coll}_${seq.n++}`;
      const rec = { _id, ...data };
      (store[coll] = store[coll] || []).push(rec);
      return { _id };
    },
    async update({ data }) {
      callLog.update.push({ coll, id: this._id, where: this._where, data });
      let affected = 0;
      if (this._id) {
        const rec = (store[coll] || []).find((r) => r._id === this._id);
        if (rec) { Object.assign(rec, data); affected = 1; }
      } else if (this._where) {
        (store[coll] || []).forEach((r) => {
          if (matchWhere(r, this._where)) { Object.assign(r, data); affected += 1; }
        });
      }
      return { stats: { updated: affected } };
    },
    async remove() {
      callLog.remove.push({ coll, id: this._id, where: this._where });
      return { stats: { removed: 0 } };
    },
  };
  return ctx;
}

const db = {
  collection(name) { return buildCtx(name); },
  command: { in: (arr) => ({ $in: arr }), eq: (v) => ({ $eq: v }), ne: (v) => ({ $ne: v }) },
};

const cloud = {
  init() {},
  DYNAMIC_CURRENT_ENV: 'fake-env',
  getWXContext() { return { OPENID: 'fake-openid', APPID: 'fake-appid' }; },
  database() { return db; },
  __mock: { store, callLog, __reset() { /* 保留预置数据 */ } },
};

module.exports = cloud;
module.exports.__mock = cloud.__mock;
