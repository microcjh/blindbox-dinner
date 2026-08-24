// pages/realname/realname.js — 实名认证页
// 链路:输入姓名+身份证 → startFaceVerify(人脸核身) → verify.submit(后端校验+回填)
const authService = require('../../services/auth');
const verifyService = require('../../services/verify');

Page({
  data: {
    realName: '',
    idCard: '',
    submitting: false,
    verified: false,
  },

  onLoad() {
    // 已实名直接进入「已通过」态,避免重复提交
    this.setData({ verified: authService.isVerified() });
  },

  onNameInput(e) {
    this.setData({ realName: e.detail.value });
  },

  onIdInput(e) {
    this.setData({ idCard: e.detail.value });
  },

  // 仅做前端粗校验(严格校验在服务端 task-012 的 isValidIdCard)
  isValidIdCard(id) {
    return /^\d{17}[\dXx]$/.test(id || '');
  },

  async onSubmit() {
    const { realName, idCard, submitting, verified } = this.data;
    if (verified || submitting) return;

    if (!realName || !idCard) {
      wx.showToast({ title: '请填写姓名和身份证号', icon: 'none' });
      return;
    }
    if (!this.isValidIdCard(idCard)) {
      wx.showToast({ title: '身份证号格式不正确', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      // 1) 调起人脸核身(真机走 wx.startFacialRecognitionVerify;DevTools 走 dev 占位)
      const verifyResult = await verifyService.startFaceVerify({ name: realName, idCard });
      if (!verifyResult || (verifyResult.errMsg && verifyResult.errMsg.indexOf('ok') === -1)) {
        throw { code: 403, message: '人脸核身未通过' };
      }
      // 2) 提交实名:后端校验 → 核身通过回填 users(verified/...),并刷新本地缓存
      await verifyService.submit({ realName, idCard, verifyResult });
      wx.showToast({ title: '实名成功', icon: 'success' });
      this.setData({ verified: true });
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/profile/profile' });
      }, 800);
    } catch (e) {
      const msg = (e && e.message) || '实名失败，请重试';
      wx.showToast({ title: msg, icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  goProfile() {
    wx.reLaunch({ url: '/pages/profile/profile' });
  },
});
