// bottom-bar.js — 吸底操作条
// 安全区Insets 直接用 CSS env() 处理(见 wxss)，无需在 JS 读取系统信息，
// 因此本组件几乎没有运行时逻辑，渲染稳定、零副作用。
Component({
  options: {
    addGlobalClass: true,
    multipleSlots: false,
    styleIsolation: 'apply-shared',
  },

  properties: {
    // 是否 fixed 吸底(默认 true)；false 则作为普通流内条
    fixed: { type: Boolean, value: true },
    // 是否显示顶部描边
    bordered: { type: Boolean, value: false },
  },
});
