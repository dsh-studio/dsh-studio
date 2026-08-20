#!/usr/bin/env bash
# 下载独立 Node 并离线安装 dsh，产出 spike/runtime/{node,app} 两个可捆绑目录。
# node 目录会被裁剪到只剩 bin/node（省 ~77MB）；依赖树按用户决策暂不裁。
set -euo pipefail
cd "$(dirname "$0")"
# CI 的 mac runner 内存紧,npm 装 dsh 的大依赖树会撞 V8 默认 2GB 堆上限(OOM, SIGABRT)
export NODE_OPTIONS="--max-old-space-size=4096"
NODE_VER=v24.14.0
ARCH=darwin-arm64
mkdir -p runtime && cd runtime
if [ ! -d node ]; then
  curl -fLO "https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-${ARCH}.tar.gz"
  tar xzf "node-${NODE_VER}-${ARCH}.tar.gz" && mv "node-${NODE_VER}-${ARCH}" node && rm "node-${NODE_VER}-${ARCH}.tar.gz"
fi
mkdir -p app && cd app
[ -f package.json ] || npm init -y >/dev/null
# 装依赖：优先用捆绑 npm（首次、未裁剪时存在），已裁剪的重跑回退系统 npm。
if [ -x ../node/bin/npm ]; then
  PATH="$(pwd)/../node/bin:$PATH" ../node/bin/npm install @deepseek-ai/dsh@0.1.0-rc.6
else
  npm install @deepseek-ai/dsh@0.1.0-rc.6
fi
cd ..
# 裁剪 node 发行版：运行时只需要 bin/node。
rm -rf node/include node/share node/lib
rm -f node/bin/npm node/bin/npx node/bin/corepack
cd app
echo "--- smoke ---"
DSH_HOME=$(mktemp -d) PATH="$(pwd)/../node/bin:$PATH" ./node_modules/.bin/dsh --version
echo "--- sizes ---"
du -sh ../node ../app
