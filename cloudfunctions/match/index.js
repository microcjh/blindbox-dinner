// cloudfunctions/match/index.js
// 任务：task-019 — 匹配（凑桌）云函数，register 之后把已付费用户凑成一桌
//
// 动作：
//   run:       对某场次，把已支付(paid)且未 matched 的报名凑成一桌 → 落 match_groups(members 4–6)
//              并标记每个 member 的 registrations.matched=true（防重复凑桌）
//   myMatches: 列出当前用户参与的所有桌（含关联场次摘要）
//
// 信任与约束（见 coding-style 第14/18/19节）：
//   - 身份走 common/session.verifyToken(event.token)。
//   - 凑桌以「已支付」为门槛（paid 才算真正入桌，与产品付费信任一致）；未支付(pending)不参与。
//   - 开桌人数下限 4（schema: match_groups.members 4–6）；不足 4 人返回 409 提示未达开桌人数。
//   - 数据访问统一走 common/db（技术方案第4节 / coding-style 第12节），本文件不裸拼查询链。
//
// 错误码：401 未登录 / 400 参数 / 404 不存在（场次） / 409 冲突（人数不足/已凑满） / 500 异常
const cloud = require('wx-server-sdk');
const path = require('path');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const { query, getById, insert, update } = require(path.join(__dirname, '..', 'common', 'db'));
const { verifyToken } = require(path.join(__dirname, '..', 'common', 'session'));
const { sendMatchSuccess } = require(path.join(__dirname, '..', 'common', 'subscribe'));

const REG_COLL = 'registrations';
const MATCH_COLL = 'match_groups';
const Q_COLL = 'questionnaires';
const MIN_MEMBERS = 4; // 开桌下限（schema: members 4–6）
const MAX_MEMBERS = 6; // 开桌上限（schema: members 4–6）

// 列表只回传必要字段（降传输体积；match_groups 无敏感字段）
const MATCH_FIELDS = ['_id', 'event_id', 'members', 'match_score', 'matched_at'];

// ---- 问卷驱动匹配（task-024 下）----
// 同频打分：budget 接近度 + taboo 冲突惩罚 + topics/personality 重合度。
// 仅消费 questionnaires 的「公开维度」（diet_pref/taboo/budget/topics/personality），不触敏感字段。
// 返回 0–100 分；无问卷任一方时返回 null（调用方回退先到先得）。

function jaccard(a = [], b = []) {
  const sa = new Set(a.map((x) => String(x).trim()).filter(Boolean));
  const sb = new Set(b.map((x) => String(x).trim()).filter(Boolean));
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  sa.forEach((x) => { if (sb.has(x)) inter += 1; });
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function scorePair(qa, qb) {
  if (!qa || !qb) return null;

  // 1) budget 接近度（差 0 → 1.0，差 ≥200 → 0）
  const budgetGap = Math.abs((qa.budget || 0) - (qb.budget || 0));
  const budgetScore = Math.max(0, 1 - budgetGap / 200);

  // 2) taboo 冲突惩罚（任一方忌口命中另一方话题/口味 → 强降分）
  const tabooA = new Set((qa.taboo || []).map((x) => String(x).trim()));
  const tabooB = new Set((qb.taboo || []).map((x) => String(x).trim()));
  const conflict = [...tabooA].some((t) => tabooB.has(t)) || [...tabooB].some((t) => tabooA.has(t));
  const tabooPenalty = conflict ? 0.4 : 0; // 冲突直接扣 40%

  // 3) topics 重合度（0–1）
  const topicScore = jaccard(qa.topics, qb.topics);

  // 4) personality 是否同频（精确匹配 +1 档，否则按 diet_pref 同类兜底）
  const personalityScore = qa.personality === qb.personality ? 1 : 0.5;

  // 加权：budget 30% + topics 35% + personality 20% + (1 - tabooPenalty 折算) 15%
  let raw = budgetScore * 0.3 + topicScore * 0.35 + personalityScore * 0.2 + (1 - tabooPenalty) * 0.15;
  raw *= (1 - tabooPenalty); // 冲突再整体惩罚
  return Math.round(Math.max(0, Math.min(1, raw)) * 100);
}

// 取 bestN 个与 anchor 同频最高的候选（含 anchor 自身），不足回退先到先得
function pickCohort(candidates, questionnaires, bestN) {
  const anchor = candidates[0];
  const anchorQ = questionnaires[anchor.user_id];

  // 无任何问卷 → 纯先到先得
  const hasAnyQ = Object.keys(questionnaires).length > 0;
  if (!hasAnyQ || !anchorQ) {
    return candidates.slice(0, bestN);
  }

  const scored = candidates.map((c) => {
    if (c.user_id === anchor.user_id) return { c, s: 100 };
    const s = scorePair(anchorQ, questionnaires[c.user_id]);
    return { c, s: s === null ? -1 : s }; // 无问卷候选排到最后（仍可被凑入，保开桌）
  });

  // 同频优先：分高在前；无问卷(-1)沉底，但仍在候选池保开桌人数
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, bestN).map((x) => x.c);
}

// 批量读候选人问卷（按 user_id 取公开维度；不存在跳过）
async function loadQuestionnaires(userIds) {
  if (!userIds.length) return {};
  const res = await query(Q_COLL, {
    where: { user_id: { $in: userIds } },
    pageSize: 100,
    fields: ['user_id', 'diet_pref', 'taboo', 'budget', 'topics', 'personality'],
  });
  const map = {};
  if (res.code === 0) {
    (res.data.list || []).forEach((q) => { map[q.user_id] = q; });
  }
  return map;
}

function toMatchView(m) {
  if (!m) return null;
  const { _id, ...rest } = m;
  return { id: _id, ...rest };
}

// 关联场次摘要（不联表，逐条 getById）
async function withEventSummary(m) {
  const view = toMatchView(m);
  if (!m || !m.event_id) return view;
  const ev = await getById('events', m.event_id);
  if (ev.code === 0 && ev.data) {
    const { _id, city, district, time, price, restaurant_id } = ev.data;
    view.event = { id: _id, city, district, time, price, restaurant_id };
  }
  return view;
}

// 凑桌：把某场次已支付且未 matched 的报名凑成一桌
async function handleRun(event) {
  // 1) 身份
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  // 2) 参数
  const { event_id } = event || {};
  if (!event_id || typeof event_id !== 'string') return { code: 400, message: '缺少场次 id' };

  // 3) 场次存在性
  const ev = await getById('events', event_id);
  if (ev.code !== 0) return { code: 500, message: ev.message };
  if (!ev.data) return { code: 404, message: '场次不存在' };

  // 4) 取该场次「已支付且未 matched」的报名（按 created_at 升序，先报先入桌为候选池）
  const regs = await query(REG_COLL, {
    where: { event_id, status: 'paid', matched: { $ne: true } },
    orderBy: ['created_at', 'asc'],
    pageSize: 50,
  });
  if (regs.code !== 0) return { code: 500, message: regs.message };
  const candidates = regs.data.list || [];
  if (candidates.length < MIN_MEMBERS) {
    return { code: 409, message: `已支付人数不足，需满 ${MIN_MEMBERS} 人开桌（当前 ${candidates.length} 人）` };
  }

  // 5) 问卷驱动同频优先选人（task-024 下）：读候选人问卷 → 以首候选为锚挑同频最高者凑桌；
  //    无问卷时回退纯先到先得（仍保开桌下限）。优先凑满 MIN_MEMBERS(4) 人同频桌，
  //    若高分候选不足 4 则从池里补足（无问卷沉底优先），上限 MAX_MEMBERS。
  const questionnaires = await loadQuestionnaires(candidates.map((r) => r.user_id));
  const cohort = pickCohort(candidates, questionnaires, MIN_MEMBERS);
  // 文档库 $ne 兼容：再防御一次已 matched
  const members = cohort.filter((r) => !r.matched);
  if (members.length < MIN_MEMBERS) {
    return { code: 409, message: `可凑桌人数不足，需满 ${MIN_MEMBERS} 人开桌（当前 ${members.length} 人）` };
  }
  const memberIds = members.map((r) => r.user_id);

  // 6) 算本桌整体同频分（两两均值，仅对有问卷的对算；无问卷不计入分母）
  let scoreSum = 0;
  let scoreCnt = 0;
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const s = scorePair(questionnaires[members[i].user_id], questionnaires[members[j].user_id]);
      if (s !== null) { scoreSum += s; scoreCnt += 1; }
    }
  }
  const matchScore = scoreCnt > 0 ? Math.round(scoreSum / scoreCnt) : null;

  // 7) 落 match_groups（含 match_score，供前端「同频度」展示 / 后续调优）
  const matchedAt = new Date().toISOString();
  const ins = await insert(MATCH_COLL, {
    event_id,
    members: memberIds,
    match_score: matchScore,
    matched_at: matchedAt,
    created_at: matchedAt,
  });
  if (ins.code !== 0) return { code: 500, message: ins.message };

  // 7) 标记每个 member 的报名 matched=true（防重复凑桌；幂等：已 matched 的查询已排除）
  const updRes = await update(REG_COLL, { matched: true }, { _id: { $in: members.map((r) => r._id) } });
  if (updRes.code !== 0) return { code: 500, message: updRes.message };

  // 8) 触发「凑桌成功」订阅消息（task-026）：反查每位 member 的 openid 并通知。
  //    通知是增强能力，失败不影响凑桌主流程；未配置模板走 dev 占位（不触真实发送）。
  const eventSummary = await getEventSummary(event_id);
  await notifyTable(memberIds, eventSummary);

  return {
    code: 0,
    message: 'ok',
    data: {
      match: toMatchView({ _id: ins.data._id, event_id, members: memberIds, match_score: matchScore, matched_at: matchedAt }),
      member_count: memberIds.length,
      match_score: matchScore,
    },
  };
}

// 关联场次摘要（不联表，逐条 getById；与 withEventSummary 同源）
async function getEventSummary(eventId) {
  const ev = await getById('events', eventId);
  if (ev.code === 0 && ev.data) {
    return {
      id: ev.data._id,
      city: ev.data.city,
      district: ev.data.district,
      time: ev.data.time,
      price: ev.data.price,
    };
  }
  return { id: eventId };
}

// 通知同桌成员（task-026）：批量反查 openid 后逐个发订阅消息，失败静默不阻断
async function notifyTable(memberIds, eventSummary) {
  try {
    const usersRes = await query('users', { where: { _id: { $in: memberIds } }, fields: ['_id', 'openid'] });
    const users = (usersRes && usersRes.code === 0 && usersRes.data.list) || [];
    await Promise.all(users.map((u) => sendMatchSuccess({
      openid: u.openid,
      event: eventSummary,
      members: memberIds,
    })));
  } catch (e) {
    // 通知失败仅记录，不影响凑桌结果
  }
}

// 我的桌：列出当前用户参与的所有 match_groups + 关联场次摘要
async function handleMyMatches(event) {
  // 1) 身份
  const payload = verifyToken(event && event.token);
  if (!payload) return { code: 401, message: '登录态已失效，请重新登录' };

  // 2) 查包含当前用户的桌（members 数组含 uid）
  const res = await query(MATCH_COLL, {
    where: { members: payload.uid },
    orderBy: ['matched_at', 'desc'],
    pageSize: 50,
    fields: MATCH_FIELDS,
  });
  if (res.code !== 0) return { code: 500, message: res.message };

  const list = await Promise.all((res.data.list || []).map(withEventSummary));
  return {
    code: 0,
    message: 'ok',
    data: { list, total: res.data.total },
  };
}

exports.main = async (event, context) => {
  const action = (event && event.action) || 'run';
  try {
    if (action === 'run') return await handleRun(event);
    if (action === 'myMatches') return await handleMyMatches(event);
    return { code: 400, message: `未知 action: ${action}` };
  } catch (err) {
    return { code: 500, message: err.message || '操作失败' };
  }
};
