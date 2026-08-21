// skeleton.js — 加载骨架屏
// loading=true 显示占位骨架；loading=false 通过默认插槽渲染真实内容。
// rows 通过 observer 预先展开成 rowArray，避免 WXML 里做数组构造。
Component({
  options: {
    addGlobalClass: true,
    multipleSlots: false,
    styleIsolation: 'apply-shared',
  },

  properties: {
    loading: { type: Boolean, value: true },
    // 是否显示圆形头像占位
    avatar: { type: Boolean, value: false },
    // 是否显示标题占位条
    title: { type: Boolean, value: true },
    // 文本行数
    rows: { type: Number, value: 3 },
    // 最后一行宽度(默认 60%，更贴近真实排版)
    lastRowWidth: { type: String, value: '60%' },
  },

  data: {
    rowArray: [0, 1, 2],
  },

  observers: {
    rows: function (rows) {
      const n = Math.max(0, Math.floor(rows) || 0);
      this.setData({ rowArray: Array.from({ length: n }, (_, i) => i) });
    },
  },
});
