// app.js — 小程序入口
// 职责：初始化云开发环境、维护全局登录态（task-004 会将登录态缓存逻辑迁入 utils/auth.js）
App({
  globalData: {
    // 云开发环境 ID：在微信开发者工具「云开发」控制台创建环境后回填。
    // task-002 会正式注册环境并回填此值；为空时默认连接首个云环境。
    cloudEnv: '',
    userInfo: null,
    isVerified: false
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库版本过低，请使用 2.2.3 及以上基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      env: this.globalData.cloudEnv || undefined,
      traceUser: true
    });
  }
});
