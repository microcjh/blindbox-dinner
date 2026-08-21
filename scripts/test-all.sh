#!/usr/bin/env bash
# 遍历所有含 package.json 的云函数，依次 npm ci + npm test。
# CI 与本地共用同一份，保证「本地能过，CI 必过」。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
found=0

for dir in "$ROOT"/cloudfunctions/*/; do
  if [ -f "$dir/package.json" ]; then
    found=1
    echo "==> testing: $dir"
    ( cd "$dir" && npm ci && npm test )
  fi
done

if [ "$found" -eq 0 ]; then
  echo "no cloudfunctions with package.json; nothing to test."
fi
