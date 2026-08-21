// cloudfunctions/common/db.js
// 任务：task-009 — 云函数侧数据库公共模块
// 用途：
//   1. 统一封装云开发文档库的常用查询（where / page / 排序 / 字段裁剪）+ 基础 CRUD
//   2. 所有业务云函数（task-011~022 的 auth/events/register/...）统一 require 本模块，
//      禁止在各云函数里重复拼 .where().orderBy().skip().limit().field()，避免散落与不一致
//   3. 透传 db.command（_.in / _.eq / _.gt 等），支持复合查询条件
//   4. 查询类统一返回 { code, message, data: { list, total } }，与 coding-style 第7节响应约定一致
//
// 依赖：wx-server-sdk（调用方云函数已 cloud.init）
// 注意：本模块不调用 cloud.init，由宿主云函数负责初始化环境。
const cloud = require('wx-server-sdk');

const db = cloud.database();
const _ = db.command;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * 统一查询。
 * @param {string} collectionName 集合名
 * @param {Object} [opts]
 * @param {Object} [opts.where] 查询条件；值可为字面量或 db.command 表达式（_.in([...]) 等）
 * @param {number} [opts.page=1] 页码（从 1 开始）
 * @param {number} [opts.pageSize=20] 每页条数（上限 100）
 * @param {Array|Array[]} [opts.orderBy] 排序：['time','desc'] 或 [['status','asc'],['time','desc']]
 * @param {string|string[]} [opts.fields] 字段裁剪：只返回指定字段（降传输体积，敏感字段不下发）
 * @returns {Promise<{code:number,message:string,data:{list:Array,total:number}}>}
 */
async function query(collectionName, opts = {}) {
  const {
    where = {},
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    orderBy,
    fields,
  } = opts;

  const size = Math.min(Math.max(parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const current = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (current - 1) * size;

  let chain = db.collection(collectionName);
  if (where && Object.keys(where).length > 0) {
    chain = chain.where(where);
  }
  if (orderBy) {
    const orders = Array.isArray(orderBy[0]) ? orderBy : [orderBy];
    for (const [field, dir] of orders) {
      chain = chain.orderBy(field, (dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc');
    }
  }
  if (fields) {
    const f = Array.isArray(fields) ? fields : [fields];
    const fieldObj = {};
    f.forEach((k) => { fieldObj[k] = true; });
    chain = chain.field(fieldObj);
  }

  // 并行取列表与总数（count 需独立 chain，不能复用带 skip/limit 的 chain）
  let countChain = db.collection(collectionName);
  if (where && Object.keys(where).length > 0) {
    countChain = countChain.where(where);
  }

  try {
    const [listRes, countRes] = await Promise.all([
      chain.skip(skip).limit(size).get(),
      countChain.count(),
    ]);
    return {
      code: 0,
      message: 'ok',
      data: {
        list: listRes.data || [],
        total: countRes.total || 0,
      },
    };
  } catch (err) {
    return {
      code: 500,
      message: `query ${collectionName} failed: ${err.message || err}`,
      data: { list: [], total: 0 },
    };
  }
}

/**
 * 按 _id 取单条。
 */
async function getById(collectionName, id, fields) {
  let chain = db.collection(collectionName).doc(id);
  if (fields) {
    const f = Array.isArray(fields) ? fields : [fields];
    const fieldObj = {};
    f.forEach((k) => { fieldObj[k] = true; });
    chain = chain.field(fieldObj);
  }
  try {
    const res = await chain.get();
    const record = res.data && res.data.length ? res.data[0] : null;
    return { code: 0, message: 'ok', data: record };
  } catch (err) {
    return { code: 500, message: `getById ${collectionName} failed: ${err.message || err}`, data: null };
  }
}

/**
 * 插入一条。
 * @returns {Promise<{code:number,message:string,data:{_id:string}}>}
 */
async function insert(collectionName, doc) {
  try {
    const res = await db.collection(collectionName).add({ data: doc });
    return { code: 0, message: 'ok', data: { _id: res._id } };
  } catch (err) {
    return { code: 500, message: `insert ${collectionName} failed: ${err.message || err}`, data: null };
  }
}

/**
 * 更新（按条件或 _id）。
 * @param {Object} [where] 条件更新；若省略则按 _id 单条更新
 */
async function update(collectionName, payload, where) {
  try {
    let chain;
    if (where && Object.keys(where).length > 0) {
      chain = db.collection(collectionName).where(where);
    } else if (payload && payload._id) {
      chain = db.collection(collectionName).doc(payload._id);
    } else {
      return { code: 400, message: 'update requires where or _id', data: null };
    }
    const { _id, ...setFields } = payload;
    const res = await chain.update({ data: setFields });
    return { code: 0, message: 'ok', data: { updated: res.stats ? res.stats.updated : res.updated } };
  } catch (err) {
    return { code: 500, message: `update ${collectionName} failed: ${err.message || err}`, data: null };
  }
}

/**
 * 删除（按条件或 _id）。
 */
async function remove(collectionName, whereOrId) {
  try {
    let chain;
    if (typeof whereOrId === 'string') {
      chain = db.collection(collectionName).doc(whereOrId);
    } else if (whereOrId && Object.keys(whereOrId).length > 0) {
      chain = db.collection(collectionName).where(whereOrId);
    } else {
      return { code: 400, message: 'remove requires where or _id', data: null };
    }
    const res = await chain.remove();
    return { code: 0, message: 'ok', data: { removed: res.stats ? res.stats.removed : res.removed } };
  } catch (err) {
    return { code: 500, message: `remove ${collectionName} failed: ${err.message || err}`, data: null };
  }
}

module.exports = {
  db,
  _,
  query,
  getById,
  insert,
  update,
  remove,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
};
