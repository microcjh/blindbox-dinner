// ui-tag.js — 标签/徽标
// 类型决定配色；plain 为描边；closable 时点击 × 触发 close 事件(用 catchtap 阻止冒泡)。
Component({
  options: {
    addGlobalClass: true,
    multipleSlots: false,
    styleIsolation: 'apply-shared',
  },

  properties: {
    // 类型：primary / secondary / trust / success / warning / error
    type: { type: String, value: 'primary' },
    // 描边样式
    plain: { type: Boolean, value: false },
    // 小尺寸
    small: { type: Boolean, value: false },
    // 方角
    square: { type: Boolean, value: false },
    // 可关闭：显示 × 并触发 close 事件
    closable: { type: Boolean, value: false },
  },

  data: {
    tagClass: 'ui-tag--primary',
  },

  observers: {
    'type, plain, small, square': function (type, plain, small, square) {
      const cls = [`ui-tag--${type || 'primary'}`];
      if (plain) cls.push('ui-tag--plain');
      if (small) cls.push('ui-tag--sm');
      if (square) cls.push('ui-tag--square');
      this.setData({ tagClass: cls.join(' ') });
    },
  },

  methods: {
    onClose() {
      this.triggerEvent('close', {});
    },
  },
});
