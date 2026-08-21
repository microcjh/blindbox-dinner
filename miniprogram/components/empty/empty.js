// empty.js — 空状态占位
// 用 emoji 作图标、默认插槽放引导操作，避免引入图片资源。
Component({
  options: {
    addGlobalClass: true,
    multipleSlots: true,
    styleIsolation: 'apply-shared',
  },

  properties: {
    // 图标(emoji 或单字符)
    icon: { type: String, value: '🍽️' },
    // 主文案
    text: { type: String, value: '这里空空如也' },
    // 次要说明
    desc: { type: String, value: '' },
    // 是否渲染 action 具名插槽(引导按钮等)
    showAction: { type: Boolean, value: false },
  },
});
