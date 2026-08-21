// cloudfunctions/init-db/index.js
// 任务：task-008 — 创建 12 个集合并建索引
// 用途：
//   1. 首次部署后由开发者手动调用一次，完成数据库 Schema 初始化（云开发无迁移工具，用云函数幂等初始化最稳）
//   2. 集合 / 索引已存在时静默跳过，可重复安全运行（本地联调 / 环境重建都能重跑）
//   3. 索引定义集中维护在 INDEXES 常量，与 docs/database-schema.md 保持一致
//
// 调用：wx.cloud.callFunction({ name: 'init-db' }) 或云端日志手动触发
// 返回：{ code: 0, message: 'ok', data: { collections:[], indexes:[], skipped:{} } }
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

// 12 个集合（复数命名，见 docs/database-schema.md）
const COLLECTIONS = [
  'users',
  'realname_verify',
  'questionnaires',
  'events',
  'match_groups',
  'registrations',
  'payments',
  'restaurants',
  'reviews',
  'blacklist',
  'sos',
  'memberships',
];

// 索引定义：name 由云开发生成，这里用 key（字段名数组）+ unique 描述意图
// 字段顺序即复合索引顺序，与技术方案第3节「索引 / 关联」列一一对应
const INDEXES = {
  users: [
    { name: 'idx_openid', key: ['openid'], unique: true },
    { name: 'idx_status', key: ['status'], unique: false },
  ],
  realname_verify: [
    { name: 'idx_user_id', key: ['user_id'], unique: true },
  ],
  questionnaires: [
    { name: 'idx_user_id', key: ['user_id'], unique: true },
  ],
  events: [
    { name: 'idx_city_district_time', key: ['city', 'district', 'time'], unique: false },
    { name: 'idx_status', key: ['status'], unique: false },
  ],
  match_groups: [
    { name: 'idx_event_id', key: ['event_id'], unique: false },
  ],
  registrations: [
    { name: 'idx_user_id', key: ['user_id'], unique: false },
    { name: 'idx_event_id', key: ['event_id'], unique: false },
    { name: 'idx_status', key: ['status'], unique: false },
    { name: 'uniq_user_event', key: ['user_id', 'event_id'], unique: true },
  ],
  payments: [
    { name: 'idx_reg_id', key: ['reg_id'], unique: false },
    { name: 'idx_transaction_id', key: ['transaction_id'], unique: true },
  ],
  restaurants: [
    { name: 'idx_cuisine', key: ['cuisine'], unique: false },
    { name: 'idx_verified', key: ['verified'], unique: false },
  ],
  reviews: [
    { name: 'idx_to_uid', key: ['to_uid'], unique: false },
    { name: 'idx_event_id', key: ['event_id'], unique: false },
    { name: 'uniq_from_to_event', key: ['from_uid', 'to_uid', 'event_id'], unique: true },
  ],
  blacklist: [
    { name: 'idx_target', key: ['target'], unique: false },
    { name: 'idx_status', key: ['status'], unique: false },
  ],
  sos: [
    { name: 'idx_user_id', key: ['user_id'], unique: false },
    { name: 'idx_status', key: ['status'], unique: false },
  ],
  memberships: [
    { name: 'idx_user_id', key: ['user_id'], unique: false },
    { name: 'idx_status', key: ['status'], unique: false },
  ],
};

// 云开发 createCollection 在集合已存在时抛错码 -502005（已存在），统一吞掉
async function tryCreateCollection(name) {
  try {
    await db.createCollection(name);
    return { name, created: true };
  } catch (err) {
    // -502005: collection already exists —— 视为已初始化，幂等跳过
    if (err && (err.errCode === -502005 || /already exists/i.test(String(err.message || '')))) {
      return { name, created: false, skipped: true };
    }
    throw err;
  }
}

// createIndex 在索引已存在时抛错码 -502007（索引已存在），统一吞掉
async function tryCreateIndex(collectionName, indexDef) {
  const coll = db.collection(collectionName);
  try {
    await coll.createIndex({
      name: indexDef.name,
      key: indexDef.key,
      unique: !!indexDef.unique,
    });
    return { collection: collectionName, index: indexDef.name, created: true };
  } catch (err) {
    if (err && (err.errCode === -502007 || /already exists|duplicate/i.test(String(err.message || '')))) {
      return { collection: collectionName, index: indexDef.name, created: false, skipped: true };
    }
    throw err;
  }
}

async function ensureIndexesFor(collectionName) {
  const defs = INDEXES[collectionName] || [];
  const results = [];
  for (const def of defs) {
    results.push(await tryCreateIndex(collectionName, def));
  }
  return results;
}

exports.main = async () => {
  const collections = [];
  const indexes = [];
  const errors = [];

  for (const name of COLLECTIONS) {
    const c = await tryCreateCollection(name).catch((e) => {
      errors.push({ stage: 'createCollection', collection: name, message: String(e.message || e) });
      return { name, created: false, error: true };
    });
    collections.push(c);
    if (c.error) continue;

    const idx = await ensureIndexesFor(name).catch((e) => {
      errors.push({ stage: 'createIndex', collection: name, message: String(e.message || e) });
      return [];
    });
    indexes.push(...idx);
  }

  if (errors.length > 0) {
    return {
      code: 500,
      message: '部分集合/索引初始化失败',
      data: { collections, indexes, errors },
    };
  }

  return {
    code: 0,
    message: 'ok',
    data: {
      collections,
      indexes,
      summary: {
        collections: collections.length,
        indexes: indexes.length,
        created: [...collections, ...indexes].filter((x) => x.created).length,
        skipped: [...collections, ...indexes].filter((x) => x.skipped).length,
      },
    },
  };
};
