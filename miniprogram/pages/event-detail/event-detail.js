// pages/event-detail/event-detail.js — 场次详情 + 报名 + 支付
// 链路:eventService.getEvent → 展示 → 报名(register) → (付费场次)支付(payment)
// 报名前置分流:未登录→login;未实名→realname;已报名→提示;已满→禁用
const eventService = require('../../services/event');
const authService = require('../../services/auth');
const paymentService = require('../../services/payment');
const matchService = require('../../services/match');
const reviewService = require('../../services/review');
const blacklistService = require('../../services/blacklist');
const sosService = require('../../services/sos');
const { formatEventTime, formatPrice } = require('../../utils/format');

Page({
  data: {
    id: '',
    event: null,
    restaurant: null,
    loading: true,
    notFound: false,
    registering: false,
    sosSending: false, // 防 SOS 重复点击
    // 展示字段（预计算）
    timeText: '',
    priceText: '',
    seatsText: '',
    isFull: false,
    // 我的报名态（由 myRegistrations 推断）
    registered: false,
    // 饭后沉淀：是否为本场已凑桌成员 + 同桌其他成员
    isTableMember: false,
    tableMembers: [],
    // 评价/举报弹层状态
    reviewPanel: { open: false, toUid: '', toName: '', score: 5, submitting: false },
    reportPanel: { open: false, target: '', reason: '', submitting: false },
    reportTargetName: '',
  },

  onLoad(options) {
    const { id } = options || {};
    if (!id) {
      wx.showToast({ title: '缺少场次 id', icon: 'none' });
      this.setData({ loading: false, notFound: true });
      return;
    }
    this.setData({ id });
    this.loadDetail();
  },

  onShow() {
    // 从 login/realname 返回后校准「我的报名态」，按钮态即时刷新
    if (this.data.id && !this.data.loading && !this.data.notFound && authService.isLoggedIn()) {
      this.syncMyReg();
    }
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const data = await eventService.getEvent(this.data.id);
      if (!data) {
        this.setData({ loading: false, notFound: true });
        return;
      }
      const registered = data.registered || 0;
      const capacity = data.capacity || 0;
      const isFull = registered >= capacity || data.status === 'full';
      this.setData({
        event: data,
        restaurant: data.restaurant || null,
        timeText: formatEventTime(data.time),
        priceText: formatPrice(data.price),
        seatsText: `${registered}/${capacity}`,
        isFull,
        loading: false,
        notFound: false,
      });
      if (authService.isLoggedIn()) {
        this.syncMyReg();
        this.syncMyTable();
      }
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  // 推断「我是否已报名该场次」：走 myRegistrations，按 event.id 匹配
  async syncMyReg() {
    try {
      const res = await eventService.myRegistrations();
      const list = (res && res.list) || [];
      const mine = list.find((r) => r.event && r.event.id === this.data.id);
      const registered = !!mine && mine.status !== 'cancelled';
      this.setData({ registered });
    } catch (e) {
      // 推断失败不阻断浏览，保持 registered=false
    }
  },

  // 饭后沉淀：推断「我是否为本场已凑桌成员」+ 列出同桌其他成员
  // 依赖 myMatches（match 云函数），命中 event_id === 当前场次即视为本桌成员
  async syncMyTable() {
    try {
      const res = await matchService.myMatches();
      const list = (res && res.list) || [];
      const table = list.find((t) => t.event && t.event.id === this.data.id);
      if (!table || !Array.isArray(table.members)) {
        this.setData({ isTableMember: false, tableMembers: [] });
        return;
      }
      const myUid = authService.getUid();
      const others = table.members
        .filter((uid) => uid !== myUid)
        .map((uid) => ({ uid, name: `饭友 ${uid.slice(-4)}` }));
      this.setData({ isTableMember: true, tableMembers: others });
    } catch (e) {
      // 推断失败不阻断浏览，保持 isTableMember=false
      this.setData({ isTableMember: false, tableMembers: [] });
    }
  },

  async onRegister() {
    if (this.data.registering) return;

    // 前置分流：登录 / 实名
    if (!authService.isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    if (!authService.isVerified()) {
      wx.navigateTo({ url: '/pages/realname/realname' });
      return;
    }
    if (this.data.registered) {
      wx.showToast({ title: '你已报名该场次', icon: 'none' });
      return;
    }
    if (this.data.isFull) {
      wx.showToast({ title: '名额已满', icon: 'none' });
      return;
    }

    this.setData({ registering: true });
    try {
      // 1) 先报名（落 registrations: pending）
      await eventService.register(this.data.id);

      // 2) 免费场次：报完即成功；付费场次：调统一下单 + 拉起微信支付
      const price = (this.data.event && this.data.event.price) || 0;
      if (price > 0) {
        const prepay = await paymentService.createPrepay(this.data.id);
        const payRes = await paymentService.pay(prepay);
        if (!payRes.success) {
          if (payRes.reason === 'cancelled') {
            wx.showToast({ title: '已报名，待支付', icon: 'none' });
          } else {
            wx.showToast({ title: '支付未完成，可在「我的报名」继续支付', icon: 'none' });
          }
          // 报名保留 pending，刷新座位与报名态（不翻 paid）
          await this.loadDetail();
          return;
        }
        wx.showToast({ title: '报名并支付成功', icon: 'success' });
      } else {
        wx.showToast({ title: '报名成功', icon: 'success' });
      }

      // 3) 申请「凑桌成功」订阅消息授权（task-026：报名/支付成功是最佳 opt-in 时机）
      //    用户同意后，服务端凑桌成功时才能下发通知；失败静默不影响主流程。
      matchService.requestMatchSubscribe().catch(() => {});

      // 4) 刷新详情（registered+1 / paid 态由支付通知异步翻转，此处先 local 呈现）
      await this.loadDetail();
    } catch (e) {
      // 409/其他已由 request 层提示
    } finally {
      this.setData({ registering: false });
    }
  },

  async onUnregister() {
    if (this.data.registering || !this.data.registered) return;
    this.setData({ registering: true });
    try {
      await eventService.unregister(this.data.id);
      wx.showToast({ title: '已取消报名', icon: 'success' });
      await this.loadDetail();
    } catch (e) {
      // 409 已支付等已由 request 层提示
    } finally {
      this.setData({ registering: false });
    }
  },

  // ===== 饭后沉淀：评价 / 举报 =====

  // 打开评价弹层
  onOpenReview(e) {
    const { uid, name } = e.currentTarget.dataset;
    this.setData({
      reviewPanel: { open: true, toUid: uid, toName: name, score: 5, submitting: false },
    });
  },

  // 评分选择（1–5）
  onPickScore(e) {
    const score = e.currentTarget.dataset.score;
    this.setData({ 'reviewPanel.score': score });
  },

  // 关闭评价弹层
  onCloseReview() {
    this.setData({ 'reviewPanel.open': false });
  },

  // 提交评价
  async onSubmitReview() {
    const { toUid, score, submitting } = this.data.reviewPanel;
    if (submitting) return;
    this.setData({ 'reviewPanel.submitting': true });
    try {
      await reviewService.submitReview({ eventId: this.data.id, toUid, score });
      this.setData({ 'reviewPanel.open': false });
      wx.showToast({ title: '评价成功', icon: 'success' });
    } catch (e) {
      // 403/409/400 已由 request 层提示
    } finally {
      this.setData({ 'reviewPanel.submitting': false });
    }
  },

  // 打开举报弹层
  onOpenReport(e) {
    const { uid, name } = e.currentTarget.dataset;
    this.setData({
      reportPanel: { open: true, target: uid, reason: '', submitting: false },
      reportTargetName: name,
    });
  },

  // 举报原因输入
  onReportReasonInput(e) {
    this.setData({ 'reportPanel.reason': e.detail.value });
  },

  // 关闭举报弹层
  onCloseReport() {
    this.setData({ 'reportPanel.open': false });
  },

  // 阻止弹层内容区点击冒泡到 mask（避免误关闭）
  noop() {},

  // 提交举报
  async onSubmitReport() {
    const { target, reason, submitting } = this.data.reportPanel;
    if (submitting) return;
    if (!reason || reason.trim().length === 0) {
      wx.showToast({ title: '请填写举报原因', icon: 'none' });
      return;
    }
    this.setData({ 'reportPanel.submitting': true });
    try {
      await blacklistService.reportBlacklist({ target, reason });
      this.setData({ 'reportPanel.open': false });
      wx.showToast({ title: '举报已提交', icon: 'success' });
    } catch (e) {
      // 400/401 已由 request 层提示
    } finally {
      this.setData({ 'reportPanel.submitting': false });
    }
  },

  // ===== 一键 SOS（饭局中安全兜底） =====
  async onSos() {
    if (this.data.sosSending) return;

    // 前置分流：未登录跳转登录
    if (!authService.isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    // 二次确认，避免误触
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '一键求助',
        content: '确认向平台发起 SOS 求助？我们将联动线下处置。',
        confirmText: '确认求助',
        confirmColor: '#e54d42',
        success: (res) => resolve(res.confirm),
      });
    });
    if (!confirmed) return;

    this.setData({ sosSending: true });
    try {
      await sosService.createSos({ eventId: this.data.id, type: 'unsafe' });
      wx.showToast({ title: '已发出求助', icon: 'success' });
    } catch (e) {
      // 400/401/404 已由 request 层提示
    } finally {
      this.setData({ sosSending: false });
    }
  },
});
