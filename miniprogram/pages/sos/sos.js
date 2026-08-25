// pages/sos/sos.js — 一键求助（饭局中安全兜底，task-030 接通）
// 设计：浏览类 mySos 走 loading:false；写操作 createSos 走默认 loading + 页面二次确认。
// 类型白名单与云函数一致（unsafe/lost/medical/other）；location 选填，获取失败降级为不带位置。
const sosService = require('../../services/sos');
const eventService = require('../../services/event');
const authService = require('../../services/auth');
const { formatEventTime } = require('../../utils/format');

const SOS_TYPES = [
  { value: 'unsafe', label: '人身安全', desc: '骚扰、跟踪等不安全情形' },
  { value: 'lost', label: '走失/迷路', desc: '与同伴走散或找不着路' },
  { value: 'medical', label: '身体不适', desc: '突发疾病或需要医疗帮助' },
  { value: 'other', label: '其他', desc: '其他需要平台协助的情况' },
];

// 本地 ISO → MM-DD HH:mm（format.js 无此粒度，admin 页同款本地实现）
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

Page({
  data: {
    eventId: '',
    event: null, // 关联场次摘要（非关键，拿不到不阻塞）
    loggedIn: true,
    // 表单
    typeList: SOS_TYPES.map((t) => ({ ...t, on: t.value === 'unsafe' })),
    desc: '',
    withLocation: false,
    location: null,
    submitting: false,
    // 我的求助
    myList: [],
    myLoading: true,
    myTotal: 0,
  },

  onLoad(options) {
    const eventId = (options && options.eventId) || '';
    const loggedIn = authService.isLoggedIn();
    this.setData({ eventId, loggedIn });
    if (!loggedIn) {
      this.setData({ myLoading: false });
      return;
    }
    this.loadEvent(eventId);
    this.loadMine();
  },

  async loadEvent(eventId) {
    if (!eventId) return;
    try {
      const ev = await eventService.getEvent(eventId);
      if (ev) {
        this.setData({
          event: {
            id: ev.id,
            city: ev.city || '',
            district: ev.district || '',
            timeText: ev.time ? formatEventTime(ev.time) : '',
            title: ev.title || '',
          },
        });
      }
    } catch (e) {
      // 非关键：场次上下文缺失不阻断求助
    }
  },

  async loadMine() {
    if (!authService.isLoggedIn()) return;
    this.setData({ myLoading: true });
    try {
      const { list, total } = await sosService.mySos();
      const myList = (list || []).map((s) => ({
        id: s.id,
        type: s.type,
        typeLabel: (SOS_TYPES.find((t) => t.value === s.type) || {}).label || s.type,
        status: s.status,
        statusLabel: s.status === 'handled' ? '已处置' : '待处置',
        statusType: s.status === 'handled' ? 'success' : 'warning',
        desc: s.desc || '',
        createdText: fmtTime(s.created_at),
      }));
      this.setData({ myList, myTotal: total || 0, myLoading: false });
    } catch (e) {
      this.setData({ myLoading: false });
    }
  },

  onTypeTap(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      typeList: this.data.typeList.map((t) => ({ ...t, on: t.value === value })),
    });
  },

  onDescInput(e) {
    this.setData({ desc: e.detail.value });
  },

  async onToggleLocation() {
    if (this.data.withLocation) {
      this.setData({ withLocation: false, location: null });
      return;
    }
    try {
      const res = await new Promise((resolve, reject) => {
        wx.getLocation({ type: 'gcj02', success: resolve, fail: reject });
      });
      this.setData({ withLocation: true, location: { lng: res.longitude, lat: res.latitude } });
      wx.showToast({ title: '已附带位置', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: '无法获取位置，将不带位置上报', icon: 'none' });
      this.setData({ withLocation: false, location: null });
    }
  },

  async onSubmit() {
    if (!authService.isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    if (!this.data.eventId) {
      wx.showToast({ title: '请通过场次详情发起求助', icon: 'none' });
      return;
    }
    const selected = this.data.typeList.find((t) => t.on);
    const type = selected ? selected.value : 'unsafe';
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认发起求助',
        content: `类型：${selected ? selected.label : '其他'}\n平台将联动线下处置，请保持手机畅通。`,
        confirmText: '确认求助',
        confirmColor: '#e54d42',
        success: (res) => resolve(res.confirm),
      });
    });
    if (!confirmed) return;

    this.setData({ submitting: true });
    try {
      await sosService.createSos({
        eventId: this.data.eventId,
        type,
        desc: this.data.desc,
        location: this.data.withLocation ? this.data.location : null,
      });
      wx.showToast({ title: '已发出求助', icon: 'success' });
      // 重置表单
      this.setData({
        typeList: this.data.typeList.map((t) => ({ ...t, on: t.value === 'unsafe' })),
        desc: '',
        withLocation: false,
        location: null,
      });
      this.loadMine();
    } catch (e) {
      // 400/401/404 由 request 层提示
    } finally {
      this.setData({ submitting: false });
    }
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  onPullDownRefresh() {
    this.loadMine().then(() => wx.stopPullDownRefresh());
  },
});
