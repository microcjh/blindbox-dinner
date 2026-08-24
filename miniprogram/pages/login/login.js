// pages/login/login.js — 微信登录页
// 链路:微信登录 → auth.login(后端 find-or-create + 签发 token) → 按实名状态分流
const authService = require('../../services/auth');

Page({
  data: {
    logging: false,
  },

  onLoad() {
    // 已登录且已实名:直接进入首页,跳过登录/实名
    if (authService.isLoggedIn() && authService.isVerified()) {
      wx.reLaunch({ url: '/pages/index/index' });
    }
  },

  async onLogin() {
    if (this.data.logging) return;
    this.setData({ logging: true });
    try {
      await authService.login();
      // 已实名 → 首页;未实名 → 实名页
      if (authService.isVerified()) {
        wx.reLaunch({ url: '/pages/index/index' });
      } else {
        wx.reLaunch({ url: '/pages/realname/realname' });
      }
    } catch (e) {
      const msg = (e && e.message) || '登录失败，请重试';
      wx.showToast({ title: msg, icon: 'none' });
    } finally {
      this.setData({ logging: false });
    }
  },
});
