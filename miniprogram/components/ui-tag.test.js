/**
 * ui-tag.test.js — ui-tag 离线单测(Node 环境，无微信 SDK)
 * 覆盖：class observer、closable 触发 close 事件。
 */
const assert = require('assert');
const { loadComponent, createInstance } = require('./__mocks__/harness');

function run() {
  let pass = 0;
  const ok = (name) => { pass += 1; console.log('  ✓', name); };

  const def = loadComponent('./ui-tag/ui-tag.js');

  // 1. 默认 primary
  const d = createInstance(def);
  assert.ok(d.data.tagClass.includes('ui-tag--primary'));
  ok('默认 type=primary 计算正确 class');

  // 2. plain + small + 自定义 type
  const c = createInstance(def, { type: 'trust', plain: true, small: true });
  assert.ok(c.data.tagClass.includes('ui-tag--trust'));
  assert.ok(c.data.tagClass.includes('ui-tag--plain'));
  assert.ok(c.data.tagClass.includes('ui-tag--sm'));
  ok('trust+plain+small 组合 class 正确');

  // 3. 点击关闭 → 触发 close 事件
  const cl = createInstance(def, { closable: true });
  cl.onClose();
  assert.strictEqual(cl._events.length, 1);
  assert.strictEqual(cl._events[0].name, 'close');
  ok('closable 触发 close 事件');

  // 4. 非 closable 时 onClose 仍触发事件(方法存在，UI 不渲染 × 而已)
  const nc = createInstance(def, { closable: false });
  nc.onClose();
  assert.strictEqual(nc._events.length, 1);
  ok('onClose 方法始终触发 close 事件');

  console.log(`\nui-tag: ${pass} passed`);
}

run();
