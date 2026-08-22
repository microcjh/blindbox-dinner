// seed-restaurants 云函数最小单元测试
// 不依赖真实云环境，用 __mocks__/wx-server-sdk.js 拦截 require('wx-server-sdk')，
// 并复用真实的 cloudfunctions/common/db.js（其内部 require('wx-server-sdk') 同样被拦截到 mock）。
//
// 验收点：
//   - 数据自校验：条数 ≥20、字段完整、坐标/评分合法（validate 不抛错）
//   - 首次调用：全量插入，inserted === 总条数，skipped === 0
//   - 幂等：第二次调用同一环境全部 skipped，inserted === 0（去重键 name+address 生效）
//   - 返回结构符合 { code, message, data: { inserted, skipped, total } }
const assert = require('assert');
const path = require('path');

// ---- 拦截 wx-server-sdk 指向 mock ----
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
  if (req === 'wx-server-sdk') {
    return require.resolve('./__mocks__/wx-server-sdk.js');
  }
  return origResolve.call(this, req, parent, ...rest);
};

const cloud = require('wx-server-sdk');
const { RESTAURANTS, validate } = require('./data');
const main = require('./index.js').main;

(async () => {
  // 0) 数据自校验
  const total = validate();
  assert.ok(total >= 20, `餐厅种子数据应 ≥20 家，实际 ${total}`);
  assert.strictEqual(RESTAURANTS.length, total, 'RESTAURANTS.length 应与 validate 返回值一致');

  // 1) 首次调用：全新环境，全量插入
  cloud.__reset();
  let r = await main({});
  assert.strictEqual(r.code, 0, '首次调用应返回 code=0');
  assert.strictEqual(r.data.inserted, total, `首次应插入 ${total} 家`);
  assert.strictEqual(r.data.skipped, 0, '首次 skipped 应为 0');
  assert.strictEqual(r.data.total, total, 'total 应等于数据总条数');
  assert.strictEqual(cloud.__store.restaurants.length, total, 'store 中应落地 total 条');

  // 2) 幂等：第二次调用同一环境，全部跳过（去重键 name+address 生效）
  r = await main({});
  assert.strictEqual(r.code, 0, '二次调用也应返回 code=0');
  assert.strictEqual(r.data.inserted, 0, '二次调用 inserted 应为 0');
  assert.strictEqual(r.data.skipped, total, `二次调用 skipped 应为 ${total}`);
  assert.strictEqual(cloud.__store.restaurants.length, total, 'store 不应重复插入');

  // 3) 字段完整性抽检（首条）
  const sample = cloud.__store.restaurants[0];
  ['name', 'address', 'cuisine', 'avg_price', 'rating', 'lng', 'lat', 'verified'].forEach((k) => {
    assert.ok(k in sample, `落地记录缺字段 ${k}`);
  });
  assert.strictEqual(sample.verified, false, '种子数据 verified 默认应为 false');

  // 4) 去重键有效性：手动加一条同名同址记录，应被跳过而非重复
  cloud.__reset();
  const dupName = RESTAURANTS[0].name;
  const dupAddr = RESTAURANTS[0].address;
  cloud.__store.restaurants.push({ _id: 'preset', name: dupName, address: dupAddr });
  r = await main({});
  assert.strictEqual(r.data.skipped, 1, '预置同名同址记录应被计入 skipped');
  assert.strictEqual(r.data.inserted, total - 1, '其余记录应正常插入');

  console.log(`✅ seed-restaurants 单测通过（数据 ${total} 家，幂等/去重/字段校验均 OK）`);
})().catch((e) => {
  console.error('❌ seed-restaurants 单测失败:', e.message);
  process.exit(1);
});
