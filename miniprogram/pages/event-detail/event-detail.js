// pages/event-detail/event-detail.js — 场次详情 + 报名
// 链路:eventService.getEvent → 展示 → 报名(register)/取消(unregister)
// 报名前置分流:未登录→login;未实名→realname;已报名→提示;已满→禁用
const eventService = require('../../services/event');
const authService = require('../../services/auth');
const { formatEventTime, formatPrice } = require('../../utils/format');

Page({
  data: {
    id: '',
    event: null,
    restaurant: null,
    loading: true,
    notFound: false,
    registering: false,
    // 展示字段（预计算）
    timeText: '',
    priceText: '',
    seatsText: '',
    isFull: false,
    // 我的报名态（由 myRegistrations 推断）
    registered: false,
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
      if (authService.isLoggedIn()) this.syncMyReg();
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
      await eventService.register(this.data.id);
      wx.showToast({ title: '报名成功', icon: 'success' });
      // 刷新详情（registered+1）与我的报名态
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
});
