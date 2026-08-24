// events 云函数最小单元测试
// 不依赖真实云环境，用 __mocks__/wx-server-sdk.js 拦截 require('wx-server-sdk')，
// 并复用真实的 common/db / common/session。
//
// 验收点：
//   list:  默认只出 status=open；按 city 过滤；按 status 显式过滤；分页 total 正确
//   detail: 成功返回 + 关联餐厅基础信息；缺 id → 400；不存在 → 404
//   create: 成功落库(status=open, registered=0)；未登录 → 401；未实名 → 402；
//           非法时间 → 400；容量 > 6 → 400；票价 0 → 400
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
const { signToken } = require(path.join(__dirname, '..', 'common', 'session'));
const main = require('./index.js').main;

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

function seedEvents() {
  cloud.__store.events = [
    {
      _id: 'e_open_bj', city: '北京', district: '朝阳区', restaurant_id: 'r1',
      time: FUTURE, price: 49, capacity: 6, registered: 2, status: 'open',
    },
    {
      _id: 'e_open_sh', city: '上海', district: '浦东新区', restaurant_id: 'r2',
      time: FUTURE, price: 59, capacity: 4, registered: 1, status: 'open',
    },
    {
      _id: 'e_closed_bj', city: '北京', district: '海淀区', restaurant_id: 'r3',
      time: FUTURE, price: 39, capacity: 6, registered: 6, status: 'closed',
    },
  ];
}

function seedRestaurant() {
  cloud.__store.restaurants = [
    { _id: 'r1', name: '北平食府', cuisine: '京菜', address: '朝阳区xx路1号', avg_price: 120, rating: 4.6, verified: true },
  ];
}

function makeUser(uid, overrides = {}) {
  if (!cloud.__store.users) cloud.__store.users = [];
  cloud.__store.users.push({
    _id: uid, openid: 'mock-openid', verified: false, status: 'active',
    created_at: '2026-08-24T00:00:00.000Z', ...overrides,
  });
}

(async () => {
  cloud.__reset();

  // ===== list =====
  seedEvents();

  // 1) 默认只出 open
  let r = await main({ action: 'list' });
  assert.strictEqual(r.code, 0, 'list 应成功');
  assert.strictEqual(r.data.total, 2, '默认只出 open 两条');
  assert.ok(r.data.list.every((e) => e.status === 'open'), 'list 结果应全为 open');
  assert.ok(r.data.list.every((e) => e.id), 'list 应含 id（_id 重命名）');

  // 2) 按 city 过滤（命中 idx_city_district_time 左前缀）
  r = await main({ action: 'list', city: '北京' });
  assert.strictEqual(r.data.total, 1, '北京应只命中 1 条 open');
  assert.strictEqual(r.data.list[0].city, '北京', 'city 过滤应生效');

  // 3) 显式 status=closed
  r = await main({ action: 'list', status: 'closed' });
  assert.strictEqual(r.data.total, 1, 'closed 应命中 1 条');
  assert.strictEqual(r.data.list[0].status, 'closed', 'status 过滤应生效');

  // 4) 分页 page 参数透传（page 从 1 起，pageSize 默认 20）
  r = await main({ action: 'list', pageSize: 1 });
  assert.strictEqual(r.data.list.length, 1, 'pageSize=1 应只返回 1 条');
  assert.strictEqual(r.data.total, 2, 'total 不受 pageSize 影响');

  // ===== detail =====
  seedEvents();
  seedRestaurant();

  // 5) 成功 + 关联餐厅
  r = await main({ action: 'detail', id: 'e_open_bj' });
  assert.strictEqual(r.code, 0, 'detail 应成功');
  assert.strictEqual(r.data.id, 'e_open_bj', 'detail 应返回正确 id');
  assert.ok(r.data.restaurant, '应关联餐厅');
  assert.strictEqual(r.data.restaurant.id, 'r1', '关联餐厅 id 应正确');
  assert.strictEqual(r.data.restaurant.name, '北平食府', '关联餐厅名称应正确');
  assert.ok(!('avg_price' in r.data.restaurant) === false, '餐厅基础字段应下发');
  assert.ok(!('lat' in r.data.restaurant), '餐厅不应下发经纬度等内部字段（toRestaurantView 裁剪）');

  // 6) 缺 id → 400
  r = await main({ action: 'detail' });
  assert.strictEqual(r.code, 400, '缺 id 应返回 400');

  // 7) 不存在 → 404
  r = await main({ action: 'detail', id: 'no_such' });
  assert.strictEqual(r.code, 404, '不存在应返回 404');

  // ===== create =====
  const uid = 'u_events_1';
  const token = signToken({ openid: 'mock-openid', uid });
  // 注意：token 不放入 baseCreate，避免对象展开时覆盖「无效令牌」用例
  const baseCreate = {
    action: 'create',
    city: '北京',
    district: '朝阳区',
    restaurant_id: 'r1',
    time: FUTURE,
    price: 49,
    capacity: 6,
  };

  // 8) 未登录（无效令牌）→ 401
  r = await main({ ...baseCreate, token: 'bad.token' });
  assert.strictEqual(r.code, 401, '无效令牌应返回 401');

  // 9) 未实名 → 402
  makeUser(uid, { verified: false });
  r = await main({ ...baseCreate, token });
  assert.strictEqual(r.code, 402, '未实名应返回 402');

  // 10) 已实名 → 成功落库
  cloud.__store.users.find((u) => u._id === uid).verified = true;
  r = await main({ ...baseCreate, token });
  assert.strictEqual(r.code, 0, '已实名发起应成功');
  assert.strictEqual(r.data.status, 'open', '新场次状态应为 open');
  assert.strictEqual(r.data.registered, 0, '新场次 registered 应为 0');
  assert.strictEqual(r.data.capacity, 6, 'capacity 应回传');
  assert.ok(r.data.id, '应返回 id');
  // 落库校验
  assert.strictEqual(cloud.__callLog.add.filter((n) => n === 'events').length, 1, '应写入 1 条 events');

  // 11) 非法时间 → 400
  r = await main({ ...baseCreate, token, time: 'not-a-date' });
  assert.strictEqual(r.code, 400, '非法时间应返回 400');

  // 12) 过去时间 → 400
  r = await main({ ...baseCreate, token, time: new Date(Date.now() - 86400000).toISOString() });
  assert.strictEqual(r.code, 400, '过去时间应返回 400');

  // 13) 容量 > 6 → 400
  r = await main({ ...baseCreate, token, capacity: 7 });
  assert.strictEqual(r.code, 400, '容量超 6 应返回 400');

  // 14) 票价 0 → 400
  r = await main({ ...baseCreate, token, price: 0 });
  assert.strictEqual(r.code, 400, '票价 0 应返回 400');

  // 15) 未知 action → 400
  r = await main({ action: 'unknown', token });
  assert.strictEqual(r.code, 400, '未知 action 应返回 400');

  console.log(
    '✅ events 单测通过（list 默认open/城市过滤/status过滤/分页 + detail 关联餐厅/缺id400/不存在404 + create 成功/未登录401/未实名402/非法时间400/容量>6 400/票价0 400 均 OK）'
  );
})().catch((e) => {
  console.error('❌ events 单测失败:', e.message);
  process.exit(1);
});
