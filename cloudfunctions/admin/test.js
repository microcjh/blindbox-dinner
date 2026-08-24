// admin 云函数单测
const path = require('path');
const assert = require('assert');
const Module = require('module');

// 重定向 wx-server-sdk → mock
const mockPath = path.join(__dirname, '__mocks__', 'wx-server-sdk.js');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'wx-server-sdk') return mockPath;
  return origResolve.call(this, request, ...args);
};

const { signToken } = require(path.join(__dirname, '..', 'common', 'session'));
const main = require('./index').main;

const mock = require('wx-server-sdk').__mock;
const tokenOf = (uid) => signToken({ openid: `o-${uid}`, uid });

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  try {
    assert.ok(cond, msg);
    pass += 1;
    console.log(`  ✓ ${msg}`);
  } catch (e) {
    fail += 1;
    console.error(`  ✗ ${msg}\n    ${e.message}`);
  }
}

(async () => {
  console.log('admin 云函数单测：');

  // 1) 未登录 → 401
  {
    const r = await main({ action: 'listReports', token: '' });
    ok(r.code === 401, 'listReports 缺 token → 401');
  }

  // 2) 非管理员 → 403
  {
    const r = await main({ action: 'listReports', token: tokenOf('u9') });
    ok(r.code === 403, '非管理员 → 403');
  }

  // 3) 管理员列出待审举报（仅 bl1 pending）
  {
    const r = await main({ action: 'listReports', token: tokenOf('admin-u1') });
    ok(r.code === 0, 'listReports 管理员 → 0');
    ok(r.data.list.length === 1 && r.data.list[0].id === 'bl1', 'listReports 仅返回 pending 举报 bl1');
    ok(r.data.total === 1, 'listReports total=1');
  }

  // 4) 处置举报：resolved
  {
    const r = await main({ action: 'handleReport', token: tokenOf('admin-u1'), id: 'bl1', decision: 'resolved' });
    ok(r.code === 0, 'handleReport resolved → 0');
    ok(r.data.report.status === 'resolved' && r.data.report.id === 'bl1', 'handleReport 状态翻转为 resolved');
  }

  // 5) 重复处置已处理举报 → 409
  {
    const r = await main({ action: 'handleReport', token: tokenOf('admin-u1'), id: 'bl1', decision: 'banned' });
    ok(r.code === 409, '重复处置 → 409');
  }

  // 6) 处置不存在举报 → 404
  {
    const r = await main({ action: 'handleReport', token: tokenOf('admin-u1'), id: 'nope', decision: 'resolved' });
    ok(r.code === 404, '处置不存在举报 → 404');
  }

  // 7) decision 非法 → 400
  {
    const r = await main({ action: 'handleReport', token: tokenOf('admin-u1'), id: 'bl1', decision: 'foo' });
    ok(r.code === 400, 'decision 非法 → 400');
  }

  // 8) 列出待处置求助（仅 s1 pending）
  {
    const r = await main({ action: 'listSos', token: tokenOf('admin-u1') });
    ok(r.code === 0, 'listSos 管理员 → 0');
    ok(r.data.list.length === 1 && r.data.list[0].id === 's1', 'listSos 仅返回 pending 求助 s1');
  }

  // 9) 处置求助：handled + note
  {
    const r = await main({ action: 'handleSos', token: tokenOf('admin-u1'), id: 's1', note: '已联系线下' });
    ok(r.code === 0, 'handleSos → 0');
    ok(r.data.sos.status === 'handled' && r.data.sos.note === '已联系线下', 'handleSos 状态翻转 + note 透传');
  }

  // 10) 重复处置求助 → 409
  {
    const r = await main({ action: 'handleSos', token: tokenOf('admin-u1'), id: 's1' });
    ok(r.code === 409, '重复处置求助 → 409');
  }

  // 11) 处置不存在求助 → 404
  {
    const r = await main({ action: 'handleSos', token: tokenOf('admin-u1'), id: 'nope' });
    ok(r.code === 404, '处置不存在求助 → 404');
  }

  // 12) 未知 action → 400
  {
    const r = await main({ action: 'unknown', token: tokenOf('admin-u1') });
    ok(r.code === 400, '未知 action → 400');
  }

  console.log(`\nadmin: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
