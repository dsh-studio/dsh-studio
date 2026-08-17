#!/usr/bin/env bash
# 下载独立 Node 并离线安装 dsh，产出 spike/runtime/{node,app} 两个可捆绑目录。
set -euo pipefail
cd "$(dirname "$0")"
NODE_VER=v24.14.0
ARCH=darwin-arm64
mkdir -p runtime && cd runtime
if [ ! -d node ]; then
  curl -fLO "https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-${ARCH}.tar.gz"
  tar xzf "node-${NODE_VER}-${ARCH}.tar.gz" && mv "node-${NODE_VER}-${ARCH}" node && rm "node-${NODE_VER}-${ARCH}.tar.gz"
fi
mkdir -p app && cd app
[ -f package.json ] || ../node/bin/npm init -y >/dev/null
PATH="$(pwd)/../node/bin:$PATH" ../node/bin/npm install @deepseek-ai/dsh@0.1.0-rc.6
echo "--- smoke ---"
DSH_HOME=$(mktemp -d) PATH="$(pwd)/../node/bin:$PATH" ./node_modules/.bin/dsh --version
