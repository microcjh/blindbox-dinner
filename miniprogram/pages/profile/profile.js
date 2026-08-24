// pages/profile/profile.js — 我的报名（"我的" tab）
// 链路: eventService.myRegistrations → 派生展示列表 → 点击进详情 / 付费 pending 继续支付
// 登录态前置:未登录 → 引导去 login
const eventService = require('../../services/event');
const authService = require('../../services/auth');
const paymentService = require('../../services/payment');
const refundService = require('../../services/refund');
const { formatEventTime, formatPrice } = require('../../utils/format');

Page({
  data: {
    loading: true,
    loggedIn: false,
    isVerified: false,
    rows: [],
    notFound: false, // 未登录占位
    payingId: '', // 正在支付的 eventId（控制按钮 loading）
    refundingId: '', // 正在退款的 eventId（控制按钮 loading）
  },

  onLoad() {
    this.refreshLogin();
  },

  onShow() {
    // 从 login/realname 返回后刷新登录态与列表
    this.refreshLogin();
  },

  refreshLogin() {
    const loggedIn = authService.isLoggedIn();
    const isVerified = authService.isVerified();
    this.setData({ loggedIn, isVerified });
    if (loggedIn) {
      this.loadMine();
    } else {
      this.setData({ loading: false, rows: [], notFound: true });
    }
  },

  async loadMine() {
    this.setData({ loading: true, notFound: false });
    try {
      const res = await eventService.myRegistrations();
      const list = (res && res.list) || [];
      // 过滤掉已取消（cancelled 表示已取消报名，不在「我的饭局」展示）
      const rows = list
        .filter((r) => r.status !== 'cancelled')
        .map(eventService.deriveMyRow);
      this.setData({ rows, loading: false });
    } catch (e) {
      this.setData({ loading: false, rows: [] });
    }
  },

  onPullDownRefresh() {
    if (this.data.loggedIn) {
      this.loadMine().then(() => wx.stopPullDownRefresh());
    } else {
      wx.stopPullDownRefresh();
    }
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({ url: `/pages/event-detail/event-detail?id=${id}` });
  },

  async onContinuePay(e) {
    const { id } = e.currentTarget.dataset;
    if (!id || this.data.payingId) return;
    this.setData({ payingId: id });
    try {
      const prepay = await paymentService.createPrepay(id);
      const payRes = await paymentService.pay(prepay);
      if (!payRes.success) {
        if (payRes.reason === 'cancelled') {
          wx.showToast({ title: '支付已取消', icon: 'none' });
        } else {
          wx.showToast({ title: '支付未完成', icon: 'none' });
        }
        return;
      }
      wx.showToast({ title: '支付成功', icon: 'success' });
      // 支付结果以服务端 notify 为准,此处刷新列表(可能短暂仍 unpaid,notify 后正确)
      await this.loadMine();
    } catch (err) {
      // request 层已提示
    } finally {
      this.setData({ payingId: '' });
    }
  },

  async onRefund(e) {
    const { id } = e.currentTarget.dataset;
    if (!id || this.data.refundingId) return;
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '申请退款',
        content: '确认对该场次的报名费申请全额退款？退款将原路返回。',
        confirmText: '确认退款',
        success: (r) => resolve(!!r.confirm),
      });
    });
    if (!confirmed) return;
    this.setData({ refundingId: id });
    try {
      const res = await refundService.applyRefund(id);
      if (res && res.duplicated) {
        wx.showToast({ title: '已申请过退款', icon: 'none' });
      } else {
        wx.showToast({ title: '退款申请成功', icon: 'success' });
      }
      await this.loadMine();
    } catch (err) {
      // request 层已提示
    } finally {
      this.setData({ refundingId: '' });
    }
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  // 跳「场次」tab（tabBar 页需用 switchTab,不能用 navigateTo）
  goList() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
