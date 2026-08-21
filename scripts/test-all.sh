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
    found=1
    name="$(basename "$dir")"
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

if [ "$found" -eq 0 ]; then
  echo "no cloudfunctions with package.json; nothing to test."
fi
