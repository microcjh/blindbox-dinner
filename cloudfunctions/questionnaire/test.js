// 单测：questionnaire 云函数（submit / get）
// 运行：node test.js（无外部依赖；Module._resolveFilename 将 wx-server-sdk 重定向到 mock）
const assert = require('assert');
const Module = require('module');

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  if (request === 'wx-server-sdk') {
    return require.resolve('./__mocks__/wx-server-sdk.js');
  }
  return origResolve.call(this, request, parent, ...args);
};

const cloud = require('wx-server-sdk');
const { signToken } = require('../common/session');
const main = require('./index.js').main;

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function reset() {
  cloud.__reset();
}

function makeUser(uid, opts = {}) {
  cloud.__store.users = cloud.__store.users || [];
  const u = { _id: uid, openid: `openid_${uid}`, verified: true, ...opts };
  const exist = cloud.__store.users.find((x) => x._id === uid);
  if (exist) Object.assign(exist, u);
  else cloud.__store.users.push(u);
  return u;
}

const validPayload = {
  diet_pref: '川菜微辣',
  personality: 'e人话痨',
  budget: 80,
  taboo: ['香菜', '花生'],
  topics: ['旅行', '创业'],
  expect: ['认识有趣的人'],
};

async function run(action, data, token) {
  return main({ action, token, ...data }, {});
}

// ---- submit ----
(async () => {
  reset();
  console.log('questionnaire.submit');

  // 1) 未登录 401
  {
    const r = await run('submit', validPayload, '');
    ok(r.code === 401, '未登录返回 401');
  }

  // 2) 未实名 402
  {
    makeUser('u_unverified', { verified: false });
    const t = signToken({ uid: 'u_unverified' });
    const r = await run('submit', validPayload, t);
    ok(r.code === 402, '未实名返回 402');
  }

  // 3) 缺必填 diet_pref 400
  {
    makeUser('u1');
    const t = signToken({ uid: 'u1' });
    const r = await run('submit', { ...validPayload, diet_pref: '' }, t);
    ok(r.code === 400, '缺 diet_pref 返回 400');
  }

  // 4) 缺必填 personality 400
  {
    makeUser('u2');
    const t = signToken({ uid: 'u2' });
    const r = await run('submit', { ...validPayload, personality: '' }, t);
    ok(r.code === 400, '缺 personality 返回 400');
  }

  // 5) budget 越界 400
  {
    makeUser('u3');
    const t = signToken({ uid: 'u3' });
    const r = await run('submit', { ...validPayload, budget: 99999 }, t);
    ok(r.code === 400, 'budget 越界返回 400');
  }

  // 6) taboo 非数组 400
  {
    makeUser('u4');
    const t = signToken({ uid: 'u4' });
    const r = await run('submit', { ...validPayload, taboo: '香菜' }, t);
    ok(r.code === 400, 'taboo 非数组返回 400');
  }

  // 7) 成功落库（updated:false 首次）
  {
    makeUser('u5');
    const t = signToken({ uid: 'u5' });
    const r = await run('submit', validPayload, t);
    ok(r.code === 0, '合法提交返回 0');
    ok(r.data && r.data.updated === false, '首次提交 updated=false');
    const stored = cloud.__store.questionnaires.find((x) => x.user_id === 'u5');
    ok(!!stored, '问卷已落库');
    ok(stored.diet_pref === '川菜微辣' && stored.budget === 80, '字段正确写入');
    ok(Array.isArray(stored.taboo) && stored.taboo.length === 2, 'taboo 数组正确');
  }

  // 8) 幂等 upsert（重复提交覆盖，不落重复文档）
  {
    makeUser('u6');
    const t = signToken({ uid: 'u6' });
    await run('submit', validPayload, t);
    const r2 = await run('submit', { ...validPayload, diet_pref: '粤菜', budget: 120 }, t);
    ok(r2.code === 0 && r2.data.updated === true, '二次提交 updated=true');
    const all = cloud.__store.questionnaires.filter((x) => x.user_id === 'u6');
    ok(all.length === 1, '同一用户只有一条问卷（幂等）');
    ok(all[0].diet_pref === '粤菜' && all[0].budget === 120, '覆盖生效');
  }

  // 9) 空字符串 taboo/topics 被过滤
  {
    makeUser('u7');
    const t = signToken({ uid: 'u7' });
    await run('submit', { ...validPayload, taboo: ['', '   ', '香菜'], topics: ['ok', ''] }, t);
    const stored = cloud.__store.questionnaires.find((x) => x.user_id === 'u7');
    ok(stored.taboo.length === 1 && stored.taboo[0] === '香菜', '空 taboo 被过滤');
    ok(stored.topics.length === 1 && stored.topics[0] === 'ok', '空 topics 被过滤');
  }

  // ---- get ----
  console.log('questionnaire.get');

  // 10) 查自己完整维度
  {
    makeUser('u8');
    const t = signToken({ uid: 'u8' });
    await run('submit', validPayload, t);
    const r = await run('get', { uid: 'u8' }, t);
    ok(r.code === 0, '查自己返回 0');
    ok(r.data && r.data.diet_pref === '川菜微辣', '本人可见 diet_pref');
    ok(Array.isArray(r.data.expect) && r.data.expect.length === 1, '本人可见 expect 维度');
    ok(r.data.user_id === 'u8', '回传 user_id');
  }

  // 11) 查他人仅公开维度（隐藏 expect）
  {
    makeUser('u9');
    makeUser('u10');
    const t9 = signToken({ uid: 'u9' });
    const t10 = signToken({ uid: 'u10' });
    await run('submit', validPayload, t9);
    const r = await run('get', { uid: 'u9' }, t10); // u10 查 u9
    ok(r.code === 0, '查他人返回 0');
    ok(r.data && r.data.diet_pref === '川菜微辣', '他人可见公开维度 diet_pref');
    ok(!('expect' in r.data), '他人不可见 expect 维度');
    ok(!('user_id' in r.data) === false, '他人仍回传 user_id 标识');
  }

  // 12) 查不存在的问卷 404
  {
    makeUser('u11');
    const t = signToken({ uid: 'u11' });
    const r = await run('get', { uid: 'u_not_exist' }, t);
    ok(r.code === 404, '问卷不存在返回 404');
  }

  // 13) get 未登录 401
  {
    const r = await run('get', { uid: 'u11' }, '');
    ok(r.code === 401, 'get 未登录返回 401');
  }

  // 14) 未知 action 400
  {
    makeUser('u12');
    const t = signToken({ uid: 'u12' });
    const r = await run('foobar', {}, t);
    ok(r.code === 400, '未知 action 返回 400');
  }

  console.log(`\n✅ questionnaire 云函数单测通过：${passed} 项`);
})().catch((err) => {
  console.error('\n❌ 单测失败：', err.message);
  process.exit(1);
});
