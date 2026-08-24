// miniprogram/services/review.js
// 任务：task-020 — review 云函数的 1:1 业务门面（见 coding-style 第16/23节）
//
// 页面只依赖本门面，不得裸调 callFunction。
// - submitReview: 提交对同桌饭友的评价（写操作，走默认 loading）
// - listReviews:  查某场次全部评价（浏览类，loading:false）
const { callFunction } = require('../utils/request');

// 提交评价
async function submitReview({ eventId, toUid, score, tags, comment }) {
  return callFunction({
    name: 'review',
    action: 'submit',
    data: {
      event_id: eventId,
      to_uid: toUid,
      score,
      tags: tags || [],
      comment: comment || '',
    },
  });
}

// 评价列表（按场次）
async function listReviews(eventId) {
  return callFunction({
    name: 'review',
    action: 'list',
    data: { event_id: eventId },
    loading: false,
  });
}

module.exports = {
  submitReview,
  listReviews,
};
