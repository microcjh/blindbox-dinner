// subpackages/admin/pages/console/index.js
// 管理后台：举报审核 + SOS 处置（task-028）
// 数据全部来自 cloudfunctions/admin（门面 services/admin）。
// 权限由云端 requireAdmin 强制：非管理员调用任何 action 返回 403，前端据此展示无权限态。
const admin = require('../../../../services/admin');

const TAB = { REPORTS: 'reports', SOS: 'sos' };

function fmtTime(iso) {
  if (!iso) return '';
  const s = String(iso);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return s.slice(0, 16);
  return `${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
}

// 兼容旧基础库：showModal 包成 Promise
function showModal(opts) {
  return new Promise((resolve) => {
    wx.showModal({ title: '', ...opts, success: resolve, fail: () => resolve({ confirm: false }) });
  });
}

Page({
  data: {
    tab: TAB.REPORTS,
    reports: [],
    sos: [],
    reportsLoading: true,
    sosLoading: true,
    denied: false,
  },

  onLoad() {
    this.loadTab(this.data.tab);
  },

  onPullDownRefresh() {
    this.loadTab(this.data.tab).then(
      () => wx.stopPullDownRefresh(),
      () => wx.stopPullDownRefresh(),
    );
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    this.setData({ tab });
    const loaded = tab === TAB.REPORTS ? this.data.reports.length : this.data.sos.length;
    if (!loaded) this.loadTab(tab);
  },

  loadTab(tab) {
    return tab === TAB.REPORTS ? this.loadReports() : this.loadSos();
  },

  async loadReports() {
    this.setData({ reportsLoading: true });
    try {
      const r = await admin.listReports({ page: 1, pageSize: 20 });
      const reports = (r.list || []).map((it) => ({
        id: it.id,
        reporter: it.reporter,
        target: it.target,
        reason: it.reason,
        detail: it.detail,
        createdText: fmtTime(it.created_at),
      }));
      this.setData({ reports, reportsLoading: false, denied: false });
    } catch (err) {
      this.setData({ reportsLoading: false });
      if (err && err.code === 403) this.setData({ denied: true });
      // 其他错误 callFunction 已 toast
    }
  },

  async loadSos() {
    this.setData({ sosLoading: true });
    try {
      const r = await admin.listSos({ page: 1, pageSize: 20 });
      const sos = (r.list || []).map((it) => ({
        id: it.id,
        userId: it.user_id,
        eventId: it.event_id,
        type: it.type,
        desc: it.desc,
        location: it.location,
        createdText: fmtTime(it.created_at),
      }));
      this.setData({ sos, sosLoading: false, denied: false });
    } catch (err) {
      this.setData({ sosLoading: false });
      if (err && err.code === 403) this.setData({ denied: true });
    }
  },

  async onHandleReport(e) {
    const { id, decision } = e.currentTarget.dataset;
    const content =
      decision === 'banned'
        ? '确认封禁该用户？此操作会记录到黑名单。'
        : '确认将该举报标记为已处理？';
    const { confirm } = await showModal({ title: '操作确认', content });
    if (!confirm) return;
    try {
      await admin.handleReport(id, decision, '');
      wx.showToast({ title: '已处理', icon: 'success' });
      this.loadReports();
    } catch (err) {
      if (err && err.code === 403) this.setData({ denied: true });
    }
  },

  async onHandleSos(e) {
    const { id } = e.currentTarget.dataset;
    const { confirm } = await showModal({ title: '操作确认', content: '确认标记该求助已处置？' });
    if (!confirm) return;
    try {
      await admin.handleSos(id, '');
      wx.showToast({ title: '已处置', icon: 'success' });
      this.loadSos();
    } catch (err) {
      if (err && err.code === 403) this.setData({ denied: true });
    }
  },
});
