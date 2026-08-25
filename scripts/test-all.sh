#!/usr/bin/env bash
# 遍历所有含 package.json 的云函数，依次 install + test。
# - 有 package-lock.json 时用 npm ci（精确锁版本）
# - 无 lock 时降级为 npm install（兼容新增云函数未生成 lock 的场景）
# CI 与本地共用同一份，保证「本地能过，CI 必过」。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 本地公共模块解析：将 cloudfunctions/common 软链到 cloudfunctions/node_modules/common，
# 使 require('common/X') 在本地与云端「公共模块」解析方式一致（详见 docs/coding-style.md §12）。
# 云端由 CloudBase 公共模块注入 node_modules/common；本地用软链等价模拟，保证 fresh clone 后单测可读 common。
mkdir -p "$ROOT/cloudfunctions/node_modules"
if [ ! -e "$ROOT/cloudfunctions/node_modules/common" ]; then
  ln -s ../common "$ROOT/cloudfunctions/node_modules/common"
fi

found=0

for dir in "$ROOT"/cloudfunctions/*/; do
  if [ -f "$dir/package.json" ]; then
    name="$(basename "$dir")"
    # common 是共享模块：只跑单测（mock 内联，不依赖真实 wx-server-sdk），不 install、不作为部署单元
    if [ "$name" = "common" ]; then
      echo "==> testing: common (shared module, mock-only)"
      ( cd "$dir" && npm test )
      found=1
      continue
    fi
    found=1
    echo "==> testing: $name"
    (
      cd "$dir"
      if [ -f "package-lock.json" ]; then
        echo "    [lock present] npm ci"
        npm ci --no-audit --no-fund
      else
        echo "    [no lock] npm install (graceful)"
        npm install --no-audit --no-fund
      fi
      npm test
    )
  fi
done

# 额外:前端公共工具层(含 package.json 时)
if [ -f "$ROOT/miniprogram/utils/package.json" ]; then
  found=1
  echo "==> testing: miniprogram/utils"
  (
    cd "$ROOT/miniprogram/utils"
    if [ -f "package-lock.json" ]; then
      echo "    [lock present] npm ci"
      npm ci --no-audit --no-fund
    else
      echo "    [no lock] npm install (graceful)"
      npm install --no-audit --no-fund
    fi
    npm test
  )
fi

# 额外:前端公共组件库(含 package.json 时)
if [ -f "$ROOT/miniprogram/components/package.json" ]; then
  found=1
  echo "==> testing: miniprogram/components"
  (
    cd "$ROOT/miniprogram/components"
    npm test
  )
fi

# 额外:前端业务服务层(含 package.json 时,纯 JS 无外部依赖,只跑单测)
if [ -f "$ROOT/miniprogram/services/package.json" ]; then
  found=1
  echo "==> testing: miniprogram/services"
  (
    cd "$ROOT/miniprogram/services"
    npm test
  )
fi

if [ "$found" -eq 0 ]; then
  echo "no cloudfunctions with package.json; nothing to test."
fi
