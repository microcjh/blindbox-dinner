#!/usr/bin/env bash
# 遍历所有含 package.json 的云函数，依次 install + test。
# - 有 package-lock.json 时用 npm ci（精确锁版本）
# - 无 lock 时降级为 npm install（兼容新增云函数未生成 lock 的场景）
# CI 与本地共用同一份，保证「本地能过，CI 必过」。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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

if [ "$found" -eq 0 ]; then
  echo "no cloudfunctions with package.json; nothing to test."
fi
