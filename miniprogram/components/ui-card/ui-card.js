// ui-card.js — 表面卡片
// 通过 hasHeaderSlot / hasFooterSlot 显式声明是否使用具名插槽，
// 避免渲染空的 slot 容器产生多余节点(利于渲染性能)。
Component({
  options: {
    addGlobalClass: true,
    multipleSlots: true,
    styleIsolation: 'apply-shared',
  },

  properties: {
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    // 正文内边距，支持传入自定义值(如 '16rpx 24rpx')
    padding: { type: String, value: '24rpx' },
    // 是否提供 header 具名插槽
    hasHeaderSlot: { type: Boolean, value: false },
    // 是否提供 footer 具名插槽
    hasFooterSlot: { type: Boolean, value: false },
  },
});
