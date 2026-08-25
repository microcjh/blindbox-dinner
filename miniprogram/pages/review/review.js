// pages/review/review.js — 饭局评价 / 饭后沉淀
// 入口: 从 event-detail「饭后沉淀」卡片跳转, 携带 event_id + members(逗号分隔 uid)
// 能力:
//   - 浏览本场全部评价(listReviews, 浏览类 loading:false)
//   - 对同桌饭友提交评价(submitReview, 写操作默认 loading) — 评分 1–5 + 预设标签 + 可选评论
// 约束: 仅本场已凑桌成员可在入口获得 members; 云端再校验「同桌」(403) 与「不可重复」(409)
const reviewService = require('../../services/review');
const authService = require('../../services/auth');
const { pad } = require('../../utils/format');

// 预设评价标签(与后端 tags 字段呼应, 最多 10 个)
const PRESET_TAGS = ['有趣', '健谈', '守时', '慷慨', '靠谱', '温柔', '幽默', '有品位'];

function shortName(uid) {
  if (!uid) return '饭友';
  return `饭友 ${String(uid).slice(-4)}`;
}

function formatReviewTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    eventId: '',
    members: [],            // [{uid, name, reviewed}]
    myUid: '',
    loading: true,          // 首屏列表加载
    reviews: [],            // listReviews 结果(已匿名化展示)
    reviewedUids: [],       // 我已评价过的 to_uid(本地回显, 权威以云端 409 为准)
    presetTags: PRESET_TAGS.map((t) => ({ label: t, on: false })),
    panel: { open: false, toUid: '', toName: '', score: 5, comment: '', submitting: false },
  },

  onLoad(options) {
    const { eventId, members } = options || {};
    if (!eventId) {
      this.setData({ loading: false });
      return;
    }
    const memberList = (members || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((uid) => ({ uid, name: shortName(uid), reviewed: false }));
    this.setData({
      eventId,
      members: memberList,
      myUid: authService.getUid() || '',
    });
    this.loadReviews();
  },

  onPullDownRefresh() {
    this.loadReviews(true).then(() => wx.stopPullDownRefresh());
  },

  // 加载本场全部评价(浏览类, loading:false)
  async loadReviews(fromPull) {
    if (!fromPull) this.setData({ loading: true });
    try {
      const res = await reviewService.listReviews(this.data.eventId);
      const list = (res && res.list) || [];
      const myUid = this.data.myUid;
      const reviewedUids = list.filter((r) => r.from_uid === myUid).map((r) => r.to_uid);
      const reviews = list.map((r) => ({
        id: r.id,
        fromName: shortName(r.from_uid),
        toName: shortName(r.to_uid),
        score: r.score,
        tags: r.tags || [],
        comment: r.comment || '',
        timeText: formatReviewTime(r.created_at),
      }));
      this.setData({ reviews, reviewedUids, loading: false });
      this.syncMembersReviewed();
    } catch (e) {
      // 列表失败不阻断, 保持空态
      this.setData({ loading: false });
    }
  },

  // 把 reviewedUids 映射到 members.reviewed(供 WXML 直接判定, 避免 WXML 调 indexOf)
  syncMembersReviewed() {
    const reviewed = new Set(this.data.reviewedUids);
    const members = this.data.members.map((m) => ({ ...m, reviewed: reviewed.has(m.uid) }));
    this.setData({ members });
  },

  // 打开对某饭友的评价弹层
  onOpenReview(e) {
    const { uid, name } = e.currentTarget.dataset;
    this.setData({
      presetTags: this.data.presetTags.map((t) => ({ ...t, on: false })),
      panel: { open: true, toUid: uid, toName: name, score: 5, comment: '', submitting: false },
    });
  },

  onPickScore(e) {
    const score = Number(e.currentTarget.dataset.score);
    this.setData({ 'panel.score': score });
  },

  onToggleTag(e) {
    const label = e.currentTarget.dataset.tag;
    const presetTags = this.data.presetTags.map((t) =>
      t.label === label ? { ...t, on: !t.on } : t
    );
    this.setData({ presetTags });
  },

  onCommentInput(e) {
    this.setData({ 'panel.comment': e.detail.value });
  },

  onClosePanel() {
    this.setData({ 'panel.open': false });
  },

  noop() {},

  async onSubmitReview() {
    const { toUid, score, comment, submitting } = this.data.panel;
    if (submitting) return;
    const tags = this.data.presetTags.filter((t) => t.on).map((t) => t.label);
    this.setData({ 'panel.submitting': true });
    try {
      await reviewService.submitReview({
        eventId: this.data.eventId,
        toUid,
        score,
        tags,
        comment: comment || '',
      });
      // 关闭弹层 + 本地标记已评 + 刷新列表(云端 409 为权威)
      const reviewedUids = this.data.reviewedUids.slice();
      if (!reviewedUids.includes(toUid)) reviewedUids.push(toUid);
      this.setData({ 'panel.open': false, reviewedUids });
      this.syncMembersReviewed();
      wx.showToast({ title: '评价成功', icon: 'success' });
      this.loadReviews();
    } catch (err) {
      // 400/403/409 由 request 层提示
    } finally {
      this.setData({ 'panel.submitting': false });
    }
  },
});
