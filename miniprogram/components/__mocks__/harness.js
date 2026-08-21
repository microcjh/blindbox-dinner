/**
 * components/__mocks__/harness.js
 * 在 Node 中模拟微信组件运行时：捕获 Component 定义并构造可断言的伪实例。
 * 思路与 miniprogram/utils 单测一致——不依赖微信 SDK，CI 与本地共用。
 *
 * 用法：
 *   const { loadComponent, createInstance } = require('./__mocks__/harness');
 *   const def = loadComponent('./ui-button/ui-button.js');
 *   const inst = createInstance(def, { type: 'danger' });
 *   inst.onTap();
 *   assert.strictEqual(inst._events.length, 1);
 */
let lastDefinition = null;

function installWxMock() {
  if (typeof global.wx === 'undefined') {
    // 极简 wx stub：组件逻辑不依赖它，仅防 require 时报 undefined
    global.wx = { getApp: () => ({}) };
  }
}

function installComponentMock() {
  global.Component = function (definition) {
    lastDefinition = definition;
    return definition;
  };
}

// 加载组件文件，返回其 Component 定义(捕获 global.Component 的上一次调用)
function loadComponent(relativePath) {
  installWxMock();
  installComponentMock();
  lastDefinition = null;
  const path = require('path').resolve(__dirname, '..', relativePath);
  delete require.cache[require.resolve(path)];
  require(path);
  const def = lastDefinition;
  if (!def) {
    throw new Error('未能捕获组件定义: ' + relativePath);
  }
  return def;
}

// 构造伪实例：合并 property 默认值 + 显式 props → data，绑定 methods，触发 observers 与 attached
function createInstance(definition, props = {}) {
  const instance = {
    properties: JSON.parse(JSON.stringify(definition.properties || {})),
    data: { ...(definition.data || {}) },
    _events: [],
    setData(patch) {
      // 1) 合并 patch(支持 'a.b' 路径)
      Object.keys(patch).forEach((k) => {
        const parts = k.split('.');
        let cur = instance.data;
        for (let i = 0; i < parts.length - 1; i++) {
          if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
          cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = patch[k];
      });
      // 2) 触发被改字段命中的 observers(模拟微信 setData 行为)
      const observers = definition.observers || {};
      const changed = new Set(Object.keys(patch));
      Object.keys(observers).forEach((key) => {
        const fields = key.split(',').map((s) => s.trim());
        if (fields.some((f) => changed.has(f))) {
          const vals = fields.map((f) => instance.data[f]);
          observers[key].apply(instance, vals);
        }
      });
    },
    triggerEvent(name, detail) {
      instance._events.push({ name, detail });
    },
    selectComponent() { return null; },
    selectAllComponents() { return []; },
  };

  // 1) 合并 property 默认值(微信初始化时 properties.value 会并入 data)
  const propDefs = definition.properties || {};
  Object.keys(propDefs).forEach((k) => {
    const p = propDefs[k];
    const val = p && typeof p === 'object' && 'value' in p ? p.value : p;
    if (instance.data[k] === undefined) instance.data[k] = val;
  });

  // 2) 显式 props 覆盖同名 data
  Object.keys(props).forEach((k) => {
    instance.data[k] = props[k];
  });

  // 3) 绑定 methods(this 指向 instance)
  const methods = definition.methods || {};
  Object.keys(methods).forEach((m) => {
    instance[m] = methods[m].bind(instance);
  });

  // 4) 触发 property observers(初始化时微信会按初始值触发一次)
  const observers = definition.observers || {};
  Object.keys(observers).forEach((key) => {
    const fields = key.split(',').map((s) => s.trim());
    const vals = fields.map((f) => instance.data[f]);
    observers[key].apply(instance, vals);
  });

  // 5) 触发 lifetimes.attached
  if (definition.lifetimes && typeof definition.lifetimes.attached === 'function') {
    definition.lifetimes.attached.call(instance);
  }

  return instance;
}

module.exports = { loadComponent, createInstance };
