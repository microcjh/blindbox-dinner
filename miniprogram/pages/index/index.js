// pages/index/index.js — 场次列表（「场次」tab）
// 链路:eventService.listEvents → 渲染卡片 → 点击进 event-detail
// 列表为公开浏览,不强制登录；报名动作在详情页按需分流到 login/realname。
const eventService = require('../../services/event');
const { formatEventTime, formatPrice } = require('../../utils/format');

const CITY = '北京';
const DISTRICTS = ['全部', '朝阳', '海淀', '东城', '西城', '丰台', '通州'];

// 把云函数返回的 eventView 转成列表卡片所需展示字段（预计算,减少 WXML 运算）
function toView(ev) {
  const registered = ev.registered || 0;
  const capacity = ev.capacity || 0;
  const full = registered >= capacity || ev.status === 'full';
  return {
    ...ev,
    timeText: formatEventTime(ev.time),
    priceText: formatPrice(ev.price),
    seats: `${registered}/${capacity}`,
    full,
  };
}

Page({
  data: {
    city: CITY,
    districts: DISTRICTS,
    activeDistrict: '全部',
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false,      // 首次加载（含骨架）
    loadingMore: false,  // 触底加载更多
    finished: false,     // 已无更多
  },

  onLoad() {
    this.loadFirst();
  },

  onPullDownRefresh() {
    this.loadFirst(true);
  },

  onReachBottom() {
    this.loadMore();
  },

  async loadFirst(isPull) {
    if (this.data.loading) return;
    this.setData({ loading: true, page: 1, list: [], finished: false });
    try {
      const res = await eventService.listEvents({
        city: this.data.city,
        district: this.data.activeDistrict === '全部' ? '' : this.data.activeDistrict,
        page: 1,
        pageSize: this.data.pageSize,
      });
      const list = (res.list || []).map(toView);
      const total = res.total || 0;
      this.setData({ list, total, finished: list.length >= total });
    } catch (e) {
      // 错误提示已由 request 层统一处理
    } finally {
      this.setData({ loading: false });
      if (isPull) wx.stopPullDownRefresh();
    }
  },

  async loadMore() {
    if (this.data.loadingMore || this.data.finished || this.data.loading) return;
    const next = this.data.page + 1;
    this.setData({ loadingMore: true });
    try {
      const res = await eventService.listEvents({
        city: this.data.city,
        district: this.data.activeDistrict === '全部' ? '' : this.data.activeDistrict,
        page: next,
        pageSize: this.data.pageSize,
      });
      const more = (res.list || []).map(toView);
      const list = this.data.list.concat(more);
      const total = res.total || 0;
      this.setData({ list, page: next, finished: list.length >= total });
    } catch (e) {
      // 忽略单页失败,保留已有列表
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  onSelectDistrict(e) {
    const d = e.currentTarget.dataset.district;
    if (d === this.data.activeDistrict) return;
    this.setData({ activeDistrict: d });
    this.loadFirst();
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/event-detail/event-detail?id=${id}` });
  },
});
