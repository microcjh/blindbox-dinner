// common/db.js 单元测试（mock wx-server-sdk，不触达真实云环境）
// 验收点：
//   - 分页：page/size 正确换算 skip/limit；total 来自 count
//   - where 普通对象与 db.command（_.in）都透传
//   - orderBy 单组/多组都生效
//   - fields 字段裁剪只返回指定字段（保留 _id）
//   - 基础 CRUD：getById / insert / update / remove 返回结构符合约定
const assert = require('assert');

const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
  if (req === 'wx-server-sdk') {
    return require.resolve('./__mocks__/wx-server-sdk.js');
  }
  return origResolve.call(this, req, parent, ...rest);
};

const cloud = require('wx-server-sdk');
const db = require('./db.js');
const _ = db._;

(async () => {
  // 1) 默认查询：返回全部 4 条，total=4
  let r = await db.query('events');
  assert.strictEqual(r.code, 0, 'query 应返回 code=0');
  assert.strictEqual(r.data.total, 4, 'total 应来自 count = 4');
  assert.strictEqual(r.data.list.length, 4, '默认返回全部 4 条');
  assert.strictEqual(cloud.__callLog.get, 1, 'get 应调用 1 次');
  assert.strictEqual(cloud.__callLog.count, 1, 'count 应调用 1 次');

  // 2) 分页：page=2,size=2 → skip=2,limit=2
  cloud.__callLog.skip.length = 0;
  cloud.__callLog.limit.length = 0;
  r = await db.query('events', { page: 2, pageSize: 2 });
  assert.deepStrictEqual(cloud.__callLog.skip, [2], 'page=2,size=2 → skip=2');
  assert.deepStrictEqual(cloud.__callLog.limit, [2], 'page=2,size=2 → limit=2');
  assert.strictEqual(r.data.list.length, 2, '第二页返回 2 条');

  // 3) pageSize 上限保护（>100 截断到 100）
  cloud.__callLog.limit.length = 0;
  await db.query('events', { pageSize: 500 });
  assert.strictEqual(cloud.__callLog.limit[0], 100, 'pageSize 上限应为 100');

  // 4) where 普通对象透传
  cloud.__callLog.where.length = 0;
  r = await db.query('events', { where: { status: 'open' } });
  assert.deepStrictEqual(cloud.__callLog.where[0], { status: 'open' }, 'where 普通对象应透传');
  assert.strictEqual(r.data.total, 3, 'status=open 应 3 条');

  // 5) where + db.command(_.in) 透传
  cloud.__callLog.where.length = 0;
  r = await db.query('events', { where: { district: _.in(['chaoyang', 'haidian']) } });
  assert.deepStrictEqual(
    cloud.__callLog.where[0],
    { district: { $in: ['chaoyang', 'haidian'] } },
    'db.command _.in 应透传为 $in'
  );
  assert.strictEqual(r.data.total, 3, 'district in (chaoyang,haidian) 应 3 条');

  // 6) orderBy 单组 + 降序
  cloud.__callLog.orderBy.length = 0;
  r = await db.query('events', { orderBy: ['time', 'desc'] });
  assert.deepStrictEqual(cloud.__callLog.orderBy[0], ['time', 'desc'], 'orderBy 单组应透传');
  assert.strictEqual(r.data.list[0]._id, 'e4', 'time desc 第一条应为 e4(最新)');

  // 7) orderBy 多组
  cloud.__callLog.orderBy.length = 0;
  await db.query('events', { orderBy: [['status', 'asc'], ['time', 'desc']] });
  assert.strictEqual(cloud.__callLog.orderBy.length, 2, '多组排序应生成 2 段 orderBy');
  assert.deepStrictEqual(cloud.__callLog.orderBy[0], ['status', 'asc'], '多组第一段');
  assert.deepStrictEqual(cloud.__callLog.orderBy[1], ['time', 'desc'], '多组第二段');

  // 8) fields 字段裁剪（只返回 city/district + _id）
  r = await db.query('events', { fields: ['city', 'district'] });
  const first = r.data.list[0];
  assert.strictEqual('time' in first, false, 'time 不应出现在裁剪结果');
  assert.strictEqual('city' in first, true, 'city 应保留');
  assert.strictEqual(first._id != null, true, '_id 应保留');

  // 9) getById
  let g = await db.getById('events', 'e1');
  assert.strictEqual(g.code, 0, 'getById 应 code=0');
  assert.strictEqual(g.data._id, 'e1', 'getById 应返回 e1');

  // 10) insert / update / remove 返回结构
  let ins = await db.insert('events', { city: 'beijing' });
  assert.strictEqual(ins.code, 0, 'insert 应 code=0');
  assert.strictEqual(ins.data._id, 'new-id', 'insert 应返回 _id');

  let upd = await db.update('events', { _id: 'e1', status: 'full' });
  assert.strictEqual(upd.code, 0, 'update 应 code=0');
  assert.strictEqual(upd.data.updated, 1, 'update 应返回 updated=1');

  let rm = await db.remove('events', 'e1');
  assert.strictEqual(rm.code, 0, 'remove 应 code=0');
  assert.strictEqual(rm.data.removed, 1, 'remove 应返回 removed=1');

  // 11) update 缺 where/_id 应 400
  let bad = await db.update('events', { status: 'x' });
  assert.strictEqual(bad.code, 400, 'update 无 where/_id 应 400');

  console.log('common/db 单测通过 ✅  分页/where透传/排序/字段裁剪/CRUD 全验证');
})().catch((e) => {
  console.error('common/db 单测失败 ❌');
  console.error(e);
  process.exit(1);
});
