/**
 * services/event.test.js — event 业务层离线单测(Node 环境 mock wx)
 * 运行: node event.test.js  (由 package.json test / scripts/test-all.sh 调用)
 *
 * 覆盖:listEvents / getEvent / register / unregister / myRegistrations 的
 *   - 云函数名 + action 分发正确
 *   - 参数透传(含默认 city、event_id、token 自动注入)
 *   - 成功结果解析(回传 data)
 *   - 边界(id 缺失 → getEvent 返回 null)
 */
const assert = require('assert');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log('  ✓', msg); }
  else { failed += 1; console.error('  ✗', msg); }
}

let queue = [];
let lastCall = null;
const store = {};

function installWx() {
  queue = [];
  lastCall = null;
  global.wx = {
    cloud: {
      callFunction({ name, data, success }) {
        lastCall = { name, data };
        const r = queue.shift() || { code: 0, data: {} };
        success({ result: r });
      },
    },
    getStorageSync: (k) => (k in store ? store[k] : ''),
    setStorageSync: (k, v) => { store[k] = v; },
    removeStorageSync: (k) => { delete store[k]; },
    showLoading: () => {},
    hideLoading: () => {},
    showToast: () => {},
  };
}

const event = require('./event');

async function run() {
  // 1. listEvents:默认 city=北京,参数透传
  installWx();
  store.token = 'tok-x';
  queue = [{ code: 0, data: { list: [{ id: 'e1', city: '北京', district: '朝阳' }], total: 1 } }];
  const listRes = await event.listEvents({ district: '朝阳', page: 1, pageSize: 20 });
  ok(lastCall.name === 'events' && lastCall.data.action === 'list', 'listEvents 调 events 云函数 action=list');
  ok(lastCall.data.city === '北京' && lastCall.data.district === '朝阳', 'listEvents 透传 city(默认北京)/district');
  ok(lastCall.data.page === 1 && lastCall.data.pageSize === 20, 'listEvents 透传 page/pageSize');
  ok(lastCall.data.token === 'tok-x', 'listEvents 自动注入登录态 token');
  ok(listRes.total === 1 && listRes.list.length === 1, 'listEvents 解析 {list,total}');

  // 2. listEvents:透传空 district（页面层把「全部」换算为空串,走云函数默认 open）
  installWx();
  queue = [{ code: 0, data: { list: [], total: 0 } }];
  await event.listEvents({ district: '' });
  ok(lastCall.data.district === '', 'listEvents district=空串 透传(云函数默认 open)');

  // 3. getEvent:透传 id,解析 data
  installWx();
  store.token = 'tok-y';
  queue = [{ code: 0, data: { id: 'e9', city: '北京', restaurant: { name: '小馆' } } }];
  const detail = await event.getEvent('e9');
  ok(lastCall.name === 'events' && lastCall.data.action === 'detail', 'getEvent 调 events 云函数 action=detail');
  ok(lastCall.data.id === 'e9' && lastCall.data.token === 'tok-y', 'getEvent 透传 id + token');
  ok(detail && detail.id === 'e9' && detail.restaurant.name === '小馆', 'getEvent 解析 data(含 restaurant)');

  // 4. getEvent:id 缺失 → 返回 null,不发起调用
  installWx();
  lastCall = null;
  const nullDetail = await event.getEvent('');
  ok(nullDetail === null && lastCall === null, 'getEvent id 缺失 → 返回 null 且不调云函数');

  // 5. register:透传 event_id,解析 regView
  installWx();
  store.token = 'tok-z';
  queue = [{ code: 0, data: { id: 'r1', event_id: 'e9', status: 'pending' } }];
  const reg = await event.register('e9');
  ok(lastCall.name === 'register' && lastCall.data.action === 'register', 'register 调 register 云函数 action=register');
  ok(lastCall.data.event_id === 'e9' && lastCall.data.token === 'tok-z', 'register 透传 event_id + token');
  ok(reg && reg.event_id === 'e9' && reg.status === 'pending', 'register 解析 regView');

  // 6. unregister:无 data → 解析为 null,调用仍发生
  installWx();
  queue = [{ code: 0, message: '已取消报名' }];
  const unreg = await event.unregister('e9');
  ok(lastCall.name === 'register' && lastCall.data.action === 'unregister', 'unregister 调 register 云函数 action=unregister');
  ok(lastCall.data.event_id === 'e9', 'unregister 透传 event_id');
  ok(unreg === null, 'unregister 无 data → 返回 null(成功由不抛错判定)');

  // 7. myRegistrations:解析 {list,total}
  installWx();
  queue = [{ code: 0, data: { list: [{ id: 'r1', event: { id: 'e9' } }], total: 1 } }];
  const mine = await event.myRegistrations();
  ok(lastCall.name === 'register' && lastCall.data.action === 'my', 'myRegistrations 调 register 云函数 action=my');
  ok(mine.total === 1 && mine.list[0].event.id === 'e9', 'myRegistrations 解析 {list,total}');

  console.log(`\nevent.test.js: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => { console.error('FATAL', e); process.exit(1); });
