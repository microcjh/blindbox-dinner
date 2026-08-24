// 单测：match 云函数（run / myMatches）
// 运行：node test.js（无外部依赖；Module._resolveFilename 将 wx-server-sdk 重定向到 mock）
const assert = require('assert');
const Module = require('module');

// 将 wx-server-sdk 重定向到本地 mock
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

// 测试辅助
let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function makeUser(uid, opts = {}) {
  cloud.__store.users = cloud.__store.users || [];
  const u = { _id: uid, openid: `openid_${uid}`, verified: true, ...opts };
  const exist = cloud.__store.users.find((x) => x._id === uid);
  if (exist) Object.assign(exist, u);
  else cloud.__store.users.push(u);
  return u;
}

function makeEvent(evId, opts = {}) {
  cloud.__store.events = cloud.__store.events || [];
  const ev = { _id: evId, city: '北京', district: '朝阳区', restaurant_id: 'r1', time: new Date(Date.now() + 86400000).toISOString(), price: 49, capacity: 6, registered: 0, status: 'open', ...opts };
  const exist = cloud.__store.events.find((x) => x._id === evId);
  if (exist) Object.assign(exist, ev);
  else cloud.__store.events.push(ev);
  return ev;
}

// 预置一条报名（默认 paid 且未 matched，供凑桌）
function makeReg(uid, evId, opts = {}) {
  cloud.__store.registrations = cloud.__store.registrations || [];
  const reg = {
    _id: `reg_${uid}_${evId}${opts.suffix || ''}`,
    user_id: uid,
    event_id: evId,
    status: opts.status || 'paid',
    matched: opts.matched || false,
    created_at: opts.created_at || new Date(Date.now() + 1000).toISOString(),
  };
  cloud.__store.registrations.push(reg);
  return reg;
}

const FUTURE = new Date(Date.now() + 86400000).toISOString();
const uid = 'u_match_1';
const token = signToken({ openid: 'mock-openid', uid });

async function run() {
  // ===== run: 凑桌 =====
  cloud.__reset();
  // task-026: 配置订阅消息模板，验证落桌后触发通知
  process.env.SUBSCRIBE_TMPL_MATCH = 'tmpl_match_success_test';
  makeEvent('e_match_1', { capacity: 6, registered: 6, status: 'full' });
  makeUser(uid, { verified: true });
  // 4 个已支付且未 matched 的报名 → 刚好开桌
  ['m1', 'm2', 'm3', 'm4'].forEach((s) => {
    makeUser(`u_${s}`, { verified: true }); // 为每位 member 建 user（含 openid，供订阅消息反查）
    makeReg(`u_${s}`, 'e_match_1', { suffix: s });
  });

  // 1) 凑桌成功 → 落 match_groups，4 人成桌，报名标记 matched
  let r = await main({ action: 'run', token, event_id: 'e_match_1' });
  ok(r.code === 0, '满 4 人成功凑桌');
  ok(r.data && r.data.member_count === 4, '成桌成员数为 4');
  ok(cloud.__store.match_groups.length === 1, 'match_groups 落一条记录');
  ok(cloud.__store.match_groups[0].members.length === 4, 'match_groups.members 含 4 个 uid');
  const matchedRegs = cloud.__store.registrations.filter((x) => x.event_id === 'e_match_1' && x.matched);
  ok(matchedRegs.length === 4, '4 条报名被标记 matched=true');
  const mgId = cloud.__store.match_groups[0]._id;
  // task-026: 落桌成功触发「凑桌成功」订阅消息给每位 member（含反查 openid）
  ok(cloud.__callLog.subscribeSend.length === 4, '落桌成功向 4 位 member 各发一条订阅消息');
  ok(cloud.__callLog.subscribeSend.every((s) => s.touser && s.templateId === 'tmpl_match_success_test'), '订阅消息含接收 openid + 模板 ID');

  // 2) 重复凑桌 → 已 matched 的报名被排除，余 0 人 → 409 人数不足
  r = await main({ action: 'run', token, event_id: 'e_match_1' });
  ok(r.code === 409, '已凑桌的报名被排除后人数不足 → 409');
  ok(cloud.__store.match_groups.length === 1, '未新增 match_groups（防重复凑桌）');

  // 3) 人数不足 → 409（仅 3 个付费）
  cloud.__reset();
  makeEvent('e_match_2', { capacity: 6, registered: 3, status: 'open' });
  ['a', 'b', 'c'].forEach((s) => makeReg(`u_${s}`, 'e_match_2', { suffix: s }));
  r = await main({ action: 'run', token, event_id: 'e_match_2' });
  ok(r.code === 409, '付费人数不足 4 → 409');
  ok(r.message.indexOf('4') >= 0, '409 文案提示需满 4 人');
  ok(cloud.__store.match_groups.length === 0, '人数不足不落 match_groups');

  // 4) 仅 pending 不凑桌（付费门槛）
  cloud.__reset();
  makeEvent('e_match_3', { capacity: 6, registered: 4, status: 'open' });
  ['p1', 'p2', 'p3', 'p4'].forEach((s) => makeReg(`u_${s}`, 'e_match_3', { suffix: s, status: 'pending' }));
  r = await main({ action: 'run', token, event_id: 'e_match_3' });
  ok(r.code === 409, '仅 pending 报名不凑桌 → 409');
  ok(cloud.__store.match_groups.length === 0, 'pending 报名不落 match_groups');

  // 5) 未登录 → 401
  r = await main({ action: 'run', event_id: 'e_match_1' });
  ok(r.code === 401, '缺令牌凑桌返回 401');

  // 6) 缺 event_id → 400
  r = await main({ action: 'run', token });
  ok(r.code === 400, '缺 event_id 凑桌返回 400');

  // 7) 场次不存在 → 404
  r = await main({ action: 'run', token, event_id: 'e_not_exist' });
  ok(r.code === 404, '凑桌不存在场次返回 404');

  // ===== 问卷驱动匹配（task-024 下）=====
  // 场景：6 个候选人，分两簇同频群体。A 簇(话题重合、budget 接近) / B 簇(话题不同)。
  // 期望：凑桌优先把 A 簇凑一桌，而非纯先到先得。
  cloud.__reset();
  makeEvent('e_q_1', { capacity: 6, registered: 6, status: 'full' });
  makeUser(uid, { verified: true });
  // 候选人：a1~a3 同频（话题[旅行,创业] budget 80），b1~b3 异频（话题[游戏,动漫] budget 200）
  const cohortA = ['a1', 'a2', 'a3'];
  const cohortB = ['b1', 'b2', 'b3'];
  const allC = [...cohortA, ...cohortB];
  allC.forEach((s, i) => {
    makeReg(`u_${s}`, 'e_q_1', { suffix: s, created_at: new Date(Date.now() + (i + 1) * 1000).toISOString() });
  });
  // 预置问卷
  cloud.__store.questionnaires = cloud.__store.questionnaires || [];
  cohortA.forEach((s) => cloud.__store.questionnaires.push({
    _id: `q_${s}`, user_id: `u_${s}`, diet_pref: '川菜', taboo: [], budget: 80,
    topics: ['旅行', '创业'], personality: 'e人',
  }));
  cohortB.forEach((s) => cloud.__store.questionnaires.push({
    _id: `q_${s}`, user_id: `u_${s}`, diet_pref: '日料', taboo: [], budget: 200,
    topics: ['游戏', '动漫'], personality: 'i人',
  }));

  // 8) 同频优先：凑出的桌应含 a1（锚，先报）且尽量含 A 簇，不应混入 B 簇
  r = await main({ action: 'run', token, event_id: 'e_q_1' });
  ok(r.code === 0, '问卷驱动凑桌成功');
  const deskMembers = r.data.match.members;
  ok(deskMembers.includes('u_a1'), '锚点 a1 必在桌内');
  const aCount = deskMembers.filter((m) => cohortA.map((s) => `u_${s}`).includes(m)).length;
  const bCount = deskMembers.filter((m) => cohortB.map((s) => `u_${s}`).includes(m)).length;
  ok(aCount >= 3 && bCount <= 1, `同频 A 簇优先（A=${aCount}, B=${bCount}）`);
  ok(typeof r.data.match_score === 'number' && r.data.match_score > 0, 'match_score 为正（有问卷）');

  // 9) 无问卷时回退先到先得（取前 4 个候选）
  cloud.__reset();
  makeEvent('e_q_2', { capacity: 6, registered: 6, status: 'full' });
  makeUser(uid, { verified: true });
  ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].forEach((s, i) => {
    makeReg(`u_${s}`, 'e_q_2', { suffix: s, created_at: new Date(Date.now() + (i + 1) * 1000).toISOString() });
  });
  // 不设 questionnaire → 回退
  r = await main({ action: 'run', token, event_id: 'e_q_2' });
  ok(r.code === 0, '无问卷凑桌成功（回退）');
  ok(r.data.match.members[0] === 'u_c1', '回退时锚点为最先报名 c1');
  ok(r.data.match_score === null, '无问卷时 match_score 为 null');

  // 10) taboo 冲突降分：含冲突忌口的候选不应优先入桌
  cloud.__reset();
  makeEvent('e_q_3', { capacity: 6, registered: 6, status: 'full' });
  makeUser(uid, { verified: true });
  // d1(锚) 忌口[香菜]；d2 话题与 d1 同但忌口[香菜]冲突；d3/d5 同频无冲突；d4 异频
  ['d1', 'd2', 'd3', 'd4', 'd5'].forEach((s, i) => {
    makeReg(`u_${s}`, 'e_q_3', { suffix: s, created_at: new Date(Date.now() + (i + 1) * 1000).toISOString() });
  });
  cloud.__store.questionnaires = cloud.__store.questionnaires || [];
  cloud.__store.questionnaires.push({ _id: 'q_d1', user_id: 'u_d1', diet_pref: '川菜', taboo: ['香菜'], budget: 80, topics: ['旅行'], personality: 'e人' });
  cloud.__store.questionnaires.push({ _id: 'q_d2', user_id: 'u_d2', diet_pref: '川菜', taboo: ['香菜'], budget: 80, topics: ['旅行'], personality: 'e人' });
  cloud.__store.questionnaires.push({ _id: 'q_d3', user_id: 'u_d3', diet_pref: '粤菜', taboo: [], budget: 90, topics: ['旅行'], personality: 'e人' });
  cloud.__store.questionnaires.push({ _id: 'q_d4', user_id: 'u_d4', diet_pref: '日料', taboo: [], budget: 200, topics: ['游戏'], personality: 'i人' });
  cloud.__store.questionnaires.push({ _id: 'q_d5', user_id: 'u_d5', diet_pref: '粤菜', taboo: [], budget: 85, topics: ['旅行', '创业'], personality: 'e人' });
  r = await main({ action: 'run', token, event_id: 'e_q_3' });
  ok(r.code === 0, 'taboo 冲突场景凑桌成功');
  const conflictDesk = r.data.match.members;
  // d1 必在；d3/d5（无冲突同频）应优先于 d2（冲突）/ d4（异频）
  ok(conflictDesk.includes('u_d1'), '锚点 d1 必在桌内');
  ok(conflictDesk.includes('u_d3') && conflictDesk.includes('u_d5'), '无冲突同频 d3/d5 优先入桌');
  ok(!conflictDesk.includes('u_d4'), '异频(d4)候选被挤出（最沉底）');

  // ===== myMatches =====
  cloud.__reset();
  makeUser(uid, { verified: true });
  makeEvent('e_mm_1', { city: '北京', district: '朝阳区', time: FUTURE });
  makeEvent('e_mm_2', { city: '上海', district: '浦东新区', time: FUTURE });
  // 预置两桌，其中一桌含当前用户
  cloud.__store.match_groups = cloud.__store.match_groups || [];
  cloud.__store.match_groups.push({ _id: 'mg_1', event_id: 'e_mm_1', members: [uid, 'x2', 'x3', 'x4'], match_score: 88, matched_at: FUTURE });
  cloud.__store.match_groups.push({ _id: 'mg_2', event_id: 'e_mm_2', members: ['y1', 'y2', 'y3', 'y4'], matched_at: FUTURE });

  // 8) myMatches 仅返回含当前用户的桌 + 关联场次摘要
  r = await main({ action: 'myMatches', token });
  ok(r.code === 0, 'myMatches 查询成功');
  ok(r.data.total === 1, 'myMatches 仅返回 1 桌（含当前用户）');
  ok(Array.isArray(r.data.list) && r.data.list.length === 1, 'myMatches 列表结构正确');
  ok(r.data.list[0].event && r.data.list[0].event.id === 'e_mm_1', '桌关联了场次摘要');
  ok(Array.isArray(r.data.list[0].members) && r.data.list[0].members.includes(uid), '桌 members 含当前用户');
  ok(r.data.list[0].match_score === 88, 'myMatches 透出 match_score（task-024 修复：MATCH_FIELDS 补齐）');

  // 9) 未登录 myMatches → 401
  r = await main({ action: 'myMatches' });
  ok(r.code === 401, 'myMatches 缺令牌返回 401');

  console.log(`\n✅ match 单测全部通过：${passed} 项断言`);
}

run().catch((err) => {
  console.error('\n❌ 单测失败:', err.message);
  process.exit(1);
});
