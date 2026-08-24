// miniprogram/services/questionnaire.js
// 任务：task-024 — questionnaire 云函数的 1:1 业务门面（见 coding-style 第16/26节）
//
// 页面只依赖本门面，不得裸调 callFunction。
// - submitQuestionnaire: 提交/更新问卷（写操作，走默认 loading）
// - getQuestionnaire:    查自己完整问卷（浏览类，loading:false）
// - getPublicDimension:  查他人公开维度（浏览类，loading:false）
const { callFunction } = require('../utils/request');

// 提交问卷
async function submitQuestionnaire({ dietPref, personality, budget, taboo, topics, expect }) {
  return callFunction({
    name: 'questionnaire',
    action: 'submit',
    data: {
      diet_pref: dietPref,
      personality,
      budget,
      taboo: taboo || [],
      topics: topics || [],
      expect: expect || [],
    },
  });
}

// 查自己问卷（full 维度）
async function getQuestionnaire() {
  return callFunction({
    name: 'questionnaire',
    action: 'get',
    data: {},
    loading: false,
  });
}

// 查他人公开维度（匹配用，隐藏 expect）
async function getPublicDimension(uid) {
  return callFunction({
    name: 'questionnaire',
    action: 'get',
    data: { uid },
    loading: false,
  });
}

module.exports = {
  submitQuestionnaire,
  getQuestionnaire,
  getPublicDimension,
};
