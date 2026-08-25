// pages/invitation/invitation.js — 邀请好友（微信原生分享驱动，纯前端、不依赖自建后端）
// 链路: wx.showShareMenu → onShareAppMessage(好友) / onShareTimeline(朋友圈) + 复制邀请语 + 本地分享记录
const authService = require('../../services/auth');

const INVITE_STORAGE_KEY = 'invite_records';
const TYPE_TEXT = { friend: '微信好友', timeline: '朋友圈' };

// 本地时间格式化 MM-DD HH:mm（format.js 未导出，分享记录所需故本地实现）
function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

Page({
  data: {
    loggedIn: false,
    user: null, // { nickName, avatarUrl }
    inviteText: '',
    inviteRecords: [], // [{ type, typeText, timeText, at }]
  },

  onLoad() {
    // 开启分享菜单（含朋友圈），让用户可从右上角「···」分享
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    this.loadUser();
    this.loadRecords();
    this.genInviteText();
  },

  onShow() {
    this.loadUser();
    this.loadRecords();
  },

  loadUser() {
    const loggedIn = authService.isLoggedIn();
    const u = authService.getUserInfo();
    this.setData({
      loggedIn,
      user: loggedIn && u
        ? { nickName: u.nickName || '饭友', avatarUrl: u.avatarUrl || '' }
        : null,
    });
  },

  genInviteText() {
    const name = (this.data.user && this.data.user.nickName) || '我';
    const text = `【盲盒约饭】${name} 邀请你一起拆盲盒饭局～不知道会遇见谁，但一定有趣。点开小程序，约一场说走就走的饭。`;
    this.setData({ inviteText: text });
  },

  loadRecords() {
    let raw = [];
    try {
      raw = wx.getStorageSync(INVITE_STORAGE_KEY) || [];
    } catch (e) {
      raw = [];
    }
    this.setData({ inviteRecords: this.toView(raw) });
  },

  // 把本地存储的原始记录映射为视图字段（WXML 不支持函数/Date 调用）
  toView(raw) {
    return raw.slice(0, 10).map((r) => ({
      type: r.type,
      typeText: TYPE_TEXT[r.type] || r.type,
      timeText: fmtTime(r.at),
      at: r.at,
    }));
  },

  // 记一次分享（写本地 storage，不涉及他人数据，合规安全）
  recordShare(type) {
    let raw = [];
    try {
      raw = wx.getStorageSync(INVITE_STORAGE_KEY) || [];
    } catch (e) {
      raw = [];
    }
    raw.unshift({ type, at: Date.now() });
    raw = raw.slice(0, 50); // 仅保留最近 50 条
    try {
      wx.setStorageSync(INVITE_STORAGE_KEY, raw);
    } catch (e) {
      /* ignore */
    }
    this.setData({ inviteRecords: this.toView(raw) });
  },

  // 复制邀请语
  copyInvite() {
    this.genInviteText();
    wx.setClipboardData({
      data: this.data.inviteText,
      success: () => wx.showToast({ title: '邀请语已复制', icon: 'success' }),
    });
  },

  // 分享给微信好友（由 <ui-button open-type="share"> 触发）
  onShareAppMessage() {
    const uid = authService.getUid();
    const query = uid ? `inviter=${uid}&from=invite` : 'from=invite';
    return {
      title: '盲盒约饭 · 约上饭友一起拆盲盒',
      path: `/pages/index/index?${query}`,
      success: () => this.recordShare('friend'),
    };
  },

  // 分享到朋友圈（用户点右上角「···」触发，button 无法代为触发）
  onShareTimeline() {
    const uid = authService.getUid();
    const query = uid ? `inviter=${uid}&from=invite` : 'from=invite';
    return {
      title: '盲盒约饭 · 约上饭友一起拆盲盒',
      query,
      success: () => this.recordShare('timeline'),
    };
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },
});
