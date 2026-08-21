/**
 * ui-card.test.js — ui-card 离线单测(Node 环境，无微信 SDK)
 * 覆盖：multipleSlots 声明、标题/副标题/插槽开关属性默认值。
 */
const assert = require('assert');
const { loadComponent, createInstance } = require('./__mocks__/harness');

function run() {
  let pass = 0;
  const ok = (name) => { pass += 1; console.log('  ✓', name); };

  const def = loadComponent('./ui-card/ui-card.js');

  // 1. 声明 multipleSlots=true(使用 header/footer 具名插槽)
  assert.strictEqual(def.options.multipleSlots, true);
  ok('声明 multipleSlots=true');

  // 2. 默认属性值
  const d = createInstance(def);
  assert.strictEqual(d.data.title, '');
  assert.strictEqual(d.data.subtitle, '');
  assert.strictEqual(d.data.padding, '24rpx');
  assert.strictEqual(d.data.hasHeaderSlot, false);
  assert.strictEqual(d.data.hasFooterSlot, false);
  ok('默认属性值正确');

  // 3. 传入标题与插槽开关
  const c = createInstance(def, { title: '我的饭局', subtitle: '本周', hasFooterSlot: true });
  assert.strictEqual(c.data.title, '我的饭局');
  assert.strictEqual(c.data.subtitle, '本周');
  assert.strictEqual(c.data.hasFooterSlot, true);
  ok('可传入标题/副标题/footer 插槽开关');

  console.log(`\nui-card: ${pass} passed`);
}

run();
