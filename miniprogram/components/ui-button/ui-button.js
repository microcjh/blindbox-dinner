// ui-button.js — 统一行动按钮
// 属性变化通过 observers 计算最终 class；loading/disabled 状态下拦截点击。
Component({
  options: {
    addGlobalClass: true,
    multipleSlots: false,
    styleIsolation: 'apply-shared',
  },

  properties: {
    // 类型：primary 珊瑚橙 / secondary 神秘紫 / danger 错误红 / ghost 描边
    type: { type: String, value: 'primary' },
    // 尺寸：default / large / small
    size: { type: String, value: 'default' },
    // 加载态：显示 spinner 且拦截点击
    loading: { type: Boolean, value: false },
    // 禁用态：拦截点击
    disabled: { type: Boolean, value: false },
    // 通栏：占满父容器宽度
    block: { type: Boolean, value: false },
    // 圆角(默认 true)；false 为小圆角方按钮
    round: { type: Boolean, value: true },
    // 透传给原生 button（getPhoneNumber / contact / getUserInfo 等微信能力）
    openType: { type: String, value: '' },
    // 透传表单行为：submit / reset
    formType: { type: String, value: '' },
  },

  data: {
    btnClass: 'ui-btn--primary',
  },

  observers: {
    'type, size, block, round, loading, disabled': function (type, size, block, round, loading, disabled) {
      const cls = [`ui-btn--${type || 'primary'}`];
      if (size === 'large') cls.push('ui-btn--lg');
      if (size === 'small') cls.push('ui-btn--sm');
      if (block) cls.push('ui-btn--block');
      if (!round) cls.push('ui-btn--square');
      if (loading) cls.push('ui-btn--loading');
      if (disabled) cls.push('ui-btn--disabled');
      this.setData({ btnClass: cls.join(' ') });
    },
  },

  methods: {
    onTap() {
      // 加载或禁用时拦截，不向上抛 tap 事件，避免重复提交
      if (this.data.loading || this.data.disabled) return;
      this.triggerEvent('tap', {});
    },
  },
});
