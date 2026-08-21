// app.js — 小程序入口
// 职责：初始化云开发环境、维护全局登录态（task-004 会将登录态缓存逻辑迁入 utils/auth.js）
//
// 云开发环境（task-002 已注册）：
//   - envId: cloud1-d5g7ys8ci9724c437
//   - 套餐：微信体验版（MVP 阶段免费够用；上量后升级标准版）
//   - 地域：上海（对北京用户体验影响约 30~50ms，可接受）
//   - 控制台：https://tcb.cloud.tencent.com/dev?envId=cloud1-d5g7ys8ci9724c437
//   - 更新日期：2026-08-21
App({
  globalData: {
    // 云开发环境 ID
    cloudEnv: 'cloud1-d5g7ys8ci9724c437',
    userInfo: null,
    isVerified: false
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库版本过低，请使用 2.2.3 及以上基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      env: this.globalData.cloudEnv,
      traceUser: true
    });
  }
});
