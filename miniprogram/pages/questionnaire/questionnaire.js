// pages/questionnaire/questionnaire.js — 问卷页（task-024）
// 链路:未登录→login / 未实名→realname / 已实名→填问卷→submitQuestionnaire→回首页
const authService = require('../../services/auth');
const questionnaireService = require('../../services/questionnaire');

// 预设标签池（chips 多选）
const TABOO_PRESET = ['香菜', '花生', '海鲜', '辛辣', '牛肉', '羊肉', '葱蒜', '辣'];
const TOPICS_PRESET = ['旅行', '创业', '读书', '电影', '美食', '健身', '音乐', '科技', '投资', '宠物'];
const EXPECT_PRESET = ['认识有趣的人', '拓展人脉', '安静聊天', '热络氛围', '找搭子', '纯吃饭'];

Page({
  data: {
    dietPref: '',
    personality: '',
    budget: '',
    taboo: [],
    topics: [],
    expect: [],
    submitting: false,
    loaded: false,
    tabooPreset: TABOO_PRESET,
    topicsPreset: TOPICS_PRESET,
    expectPreset: EXPECT_PRESET,
  },

  onLoad() {
    // 已登录且已实名 → 拉取已有问卷回显
    if (authService.isLoggedIn() && authService.isVerified()) {
      this.loadMine();
    }
  },

  async loadMine() {
    try {
      const r = await questionnaireService.getQuestionnaire();
      if (r && r.code === 0 && r.data) {
        const q = r.data;
        this.setData({
          dietPref: q.diet_pref || '',
          personality: q.personality || '',
          budget: q.budget != null ? String(q.budget) : '',
          taboo: q.taboo || [],
          topics: q.topics || [],
          expect: q.expect || [],
          loaded: true,
        });
      } else {
        this.setData({ loaded: true });
      }
    } catch (e) {
      this.setData({ loaded: true });
    }
  },

  onDietInput(e) {
    this.setData({ dietPref: e.detail.value });
  },

  onPersonalityInput(e) {
    this.setData({ personality: e.detail.value });
  },

  onBudgetInput(e) {
    this.setData({ budget: e.detail.value });
  },

  // chips 多选切换
  toggleTag(e) {
    const { field, value } = e.currentTarget.dataset;
    const arr = this.data[field] || [];
    const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
    this.setData({ [field]: next });
  },

  async onSubmit() {
    const { dietPref, personality, budget, taboo, topics, expect, submitting } = this.data;
    if (submitting) return;

    // 前置分流：未登录→login / 未实名→realname
    if (!authService.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    if (!authService.isVerified()) {
      wx.showToast({ title: '请先完成实名认证', icon: 'none' });
      setTimeout(() => wx.navigateTo({ url: '/pages/realname/realname' }), 800);
      return;
    }

    if (!dietPref || !personality) {
      wx.showToast({ title: '请填写口味偏好和性格标签', icon: 'none' });
      return;
    }
    const budgetNum = Number(budget);
    if (!budget || Number.isNaN(budgetNum) || budgetNum <= 0) {
      wx.showToast({ title: '请填写有效预算', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const r = await questionnaireService.submitQuestionnaire({
        dietPref, personality, budget: budgetNum, taboo, topics, expect,
      });
      if (r && r.code === 0) {
        wx.showToast({ title: '问卷已保存', icon: 'success' });
        setTimeout(() => {
          const pages = getCurrentPages();
          if (pages.length > 1) wx.navigateBack();
          else wx.reLaunch({ url: '/pages/index/index' });
        }, 800);
      } else {
        throw { message: (r && r.message) || '提交失败' };
      }
    } catch (e) {
      const msg = (e && e.message) || '提交失败，请重试';
      wx.showToast({ title: msg, icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
