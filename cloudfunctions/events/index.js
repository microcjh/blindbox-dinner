// cloudfunctions/events/index.js
// 任务：task-014 — 场次（约饭局）云函数，auth/verify 之后第一个落库的业务实体
//
// 动作：
//   list:   公开浏览场次（按 city/district/status 筛选 + 分页，命中 idx_city_district_time 左前缀）
//   detail: 取单场详情，并关联餐厅基础信息（不联表：按 restaurant_id 取，绝不下发敏感字段）
//   create: 发起一场约饭（需登录 + 强实名，参数校验后落库，registered=0 / status=open）
//
// 身份与信任（见 coding-style 第14/15节）：
//   - 身份走 common/session.verifyToken(event.token)（无状态令牌；或改用 wxContext.OPENID）。
//   - create 复用「强实名护城河」：仅已实名（verified=true）用户可发起场次，与产品三重信任一致。
//
// 数据访问统一走 common/db（技术方案第4节 / coding-style 第12节），本文件不裸拼查询链。
//
// 错误码：401 未登录 / 400 参数 / 402 未实名 / 404 不存在 / 500 异常
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const { query, getById, insert } = require('common/db');
const { verifyToken } = require('common/session');

const COLLECTION = 'events';
const MAX_CAPACITY = 6; // 每桌 6 人上限（见 database-schema）

// 列表只回传必要字段（降传输体积；events 无敏感字段，但遵循字段裁剪纪律）
const LIST_FIELDS = ['_id', 'city', 'district', 'restaurant_id', 'time', 'price', 'capacity', 'registered', 'status'];

// _id → id，便于前端引用（与 toPublicProfile 一致）
function toEventView(ev) {
  if (!ev) return null;
  const { _id, ...rest } = ev;
  return { id: _id, ...rest };
}

// 餐厅只回基础展示字段，绝不把经纬度/内部标记等下发（隐私与体积双控）
function toRestaurantView(r) {
  if (!r) return null;
  return {
    id: r._id,
    name: r.name,
    cuisine: r.cuisine,
    address: r.address,
    avg_price: r.avg_price,
    rating: r.rating,
    verified: r.verified,
  };
}

function parseCapacity(capacity) {
  const cap = parseInt(capacity, 10);
  if (Number.isNaN(cap)) return null;
  return cap;
}

// 列表：按城市→区→状态筛选 + 分页；默认只展示可报名（status=open）的场次
async function handleList(event) {
  const { city, district, status, page, pageSize } = event || {};

  const where = {};
  // idx_city_district_time 左前缀命中：城市必选，区可选（从左前缀）
  if (city) where.city = city;
  if (district) where.district = district;
  // 显式传 status 则按传入；否则默认 open，保证浏览页只见可报名场次
  where.status = status || 'open';

  const res = await query(COLLECTION, {
    where,
    page: page || 1,
    pageSize: pageSize || 20,
    orderBy: ['time', 'asc'], // 近场次优先
    fields: LIST_FIELDS,
  });
  if (res.code !== 0) return { code: 500, message: res.message };

  return {
    code: 0,
    message: 'ok',
    data: {
      list: (res.data.list || []).map(toEventView),
      total: res.data.total,
    },
  };
}

// 详情：取场次 + 关联餐厅基础信息
async function handleDetail(event) {
  const { id } = event || {};
  if (!id) return { code: 400, message: '缺少场次 id' };

  const res = await getById(COLLECTION, id);
  if (res.code !== 0) return { code: 500, message: res.message };
  if (!res.data) return { code: 404, message: '场次不存在' };

  const ev = res.data;
  // 关联餐厅：不联表，按 restaurant_id 取（无则 restaurant=null，不影响主流程）
  let restaurant = null;
  if (ev.restaurant_id) {
    const rres = await getById('restaurants', ev.restaurant_id);
    if (rres.code === 0 && rres.data) {
      restaurant = toRestaurantView(rres.data);
    }
  }

  return {
    code: 0,
    message: 'ok',
    data: { ...toEventView(ev), restaurant },
  };
}

// 发起场次：需登录 + 强实名（402），参数校验后落库
async function handleCreate(event) {
  // 1) 身份：无状态令牌优先
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  // 2) 强实名护城河：仅已实名用户可发起场次
  const u = await getById('users', payload.uid);
  if (u.code !== 0) return { code: 500, message: u.message };
  if (!u.data) return { code: 404, message: '用户不存在' };
  if (!u.data.verified) return { code: 402, message: '请先完成实名认证后再发起场次' };

  // 3) 参数校验
  const { city, district, restaurant_id, time, price, capacity } = event || {};
  if (!city || typeof city !== 'string') return { code: 400, message: '请填写城市' };
  if (!district || typeof district !== 'string') return { code: 400, message: '请填写区域' };
  if (!restaurant_id || typeof restaurant_id !== 'string') return { code: 400, message: '请选择餐厅' };
  if (!time || Number.isNaN(Date.parse(time))) return { code: 400, message: '请填写有效时间' };
  if (Date.parse(time) <= Date.now()) return { code: 400, message: '场次时间须晚于当前时间' };
  const priceNum = Number(price);
  if (!(priceNum > 0)) return { code: 400, message: '票价须大于 0' };
  const cap = parseCapacity(capacity);
  if (cap === null || cap < 1 || cap > MAX_CAPACITY) {
    return { code: 400, message: `每桌人数须为 1–${MAX_CAPACITY} 人` };
  }

  // 4) 落库：registered=0，status 由容量推导（cap≥1 → open）
  const doc = {
    city: String(city).trim(),
    district: String(district).trim(),
    restaurant_id,
    time: new Date(time).toISOString(),
    price: priceNum,
    capacity: cap,
    registered: 0,
    status: cap > 0 ? 'open' : 'full',
    created_at: new Date().toISOString(),
  };
  const ins = await insert(COLLECTION, doc);
  if (ins.code !== 0) return { code: 500, message: ins.message };

  return {
    code: 0,
    message: 'ok',
    data: toEventView({ _id: ins.data._id, ...doc }),
  };
}

exports.main = async (event, context) => {
  const action = (event && event.action) || 'list';
  try {
    if (action === 'list') return await handleList(event);
    if (action === 'detail') return await handleDetail(event);
    if (action === 'create') return await handleCreate(event);
    return { code: 400, message: `未知 action: ${action}` };
  } catch (err) {
    return { code: 500, message: err.message || '操作失败' };
  }
};
