// cloudfunctions/seed-restaurants/index.js
// 任务：task-010 — 餐厅库种子数据导入（≥20 家北京探店餐厅）
// 用途：
//   1. 首次部署后由开发者手动调用一次，把 data.js 中的餐厅写入 restaurants 集合
//   2. 幂等：按 name + address 去重（同品牌不同门店地址不同，视为不同记录），已存在则跳过
//   3. 复用 cloudfunctions/common/db.js 的 query/insert，不重复拼查询链（见 coding-style 第12节）
//   4. 返回 { code, message, data: { inserted, skipped, total } }
//
// 调用：wx.cloud.callFunction({ name: 'seed-restaurants' }) 或云端日志手动触发
// 依赖：宿主云函数已 cloud.init；common/db 不调用 cloud.init，由本文件负责
const cloud = require('wx-server-sdk');
const path = require('path');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const { RESTAURANTS, validate } = require('./data');
const { query, insert } = require(path.join(__dirname, '..', 'common', 'db'));

const COLLECTION = 'restaurants';

/**
 * 按 name+address 判断记录是否已存在。
 */
async function exists(name, address) {
  const res = await query(COLLECTION, {
    where: { name, address },
    page: 1,
    pageSize: 1,
    fields: ['_id'],
  });
  if (res.code !== 0) {
    throw new Error(res.message);
  }
  return res.data.list.length > 0;
}

exports.main = async () => {
  // 开发期 fail-fast：字段/坐标/条数不合规直接抛错，不污染数据库
  const total = validate();

  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (const r of RESTAURANTS) {
    try {
      const already = await exists(r.name, r.address);
      if (already) {
        skipped += 1;
        continue;
      }
      const ins = await insert(COLLECTION, { ...r });
      if (ins.code !== 0) {
        errors.push({ name: r.name, message: ins.message });
        continue;
      }
      inserted += 1;
    } catch (err) {
      errors.push({ name: r.name, message: String(err.message || err) });
    }
  }

  if (errors.length > 0) {
    return {
      code: 500,
      message: `部分餐厅导入失败（${errors.length}/${total}）`,
      data: { inserted, skipped, total, errors },
    };
  }

  return {
    code: 0,
    message: 'ok',
    data: { inserted, skipped, total },
  };
};
