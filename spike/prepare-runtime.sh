#!/usr/bin/env bash
# 下载独立 Node 并离线安装 dsh，产出 spike/runtime/{node,app} 两个可捆绑目录。
# node 目录会被裁剪到只剩 bin/node（省 ~77MB）；依赖树按用户决策暂不裁。
set -euo pipefail
cd "$(dirname "$0")"
SCRIPT_DIR="$(pwd)"
# CI 的 mac runner 内存紧,npm 装 dsh 的大依赖树会撞 V8 默认 2GB 堆上限(OOM, SIGABRT)
export NODE_OPTIONS="--max-old-space-size=4096"
NODE_VER=v24.14.0
ARCH=darwin-arm64
NPM_REGISTRY="${DSH_STUDIO_NPM_REGISTRY:-https://registry.npmjs.org}"
mkdir -p runtime && cd runtime
RUNTIME_ROOT="$(pwd)"
if [ ! -d node ]; then
  curl -fLO "https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-${ARCH}.tar.gz"
  tar xzf "node-${NODE_VER}-${ARCH}.tar.gz" && mv "node-${NODE_VER}-${ARCH}" node && rm "node-${NODE_VER}-${ARCH}.tar.gz"
fi
mkdir -p app
# Web 必须留在 React 18，TUI 使用 React 19；两棵依赖树不能平铺。清单同时显式
# 固定 DSH 的必需 peer 闭包，避免 npm 为数百个内部包反复求解。
cp "$SCRIPT_DIR/runtime.packages.json" app/package.json
# 先禁用全部生命周期脚本，再只对白名单 native 依赖 node-pty rebuild。
# 优先用捆绑 npm（首次、未裁剪时存在），已裁剪的重跑回退系统 npm。
cd app
if [ -x ../node/bin/npm ]; then
  PATH="$(pwd)/../node/bin:$PATH" ../node/bin/npm install --ignore-scripts --legacy-peer-deps --prefer-offline --registry="$NPM_REGISTRY"
  PATH="$(pwd)/../node/bin:$PATH" ../node/bin/npm rebuild node-pty
else
  npm install --ignore-scripts --legacy-peer-deps --prefer-offline --registry="$NPM_REGISTRY"
  npm rebuild node-pty
fi
cd ..
# TUI 内嵌的 @dsh-std 包保留 workspace:* 元数据；npm 能首次安装，但不能
# 在生成的 lockfile/node_modules 上幂等重跑。每次先干净 staging，成功后替换。
TUI_STAGE=$(mktemp -d "${TMPDIR:-/tmp}/dsh-studio-tui.XXXXXX")
cp "$SCRIPT_DIR/runtime.tui.packages.json" "$TUI_STAGE/package.json"
cd "$TUI_STAGE"
npm install --ignore-scripts --legacy-peer-deps --prefer-offline --registry="$NPM_REGISTRY"
cd "$RUNTIME_ROOT"
rm -rf tui
mv "$TUI_STAGE" tui
# 裁剪 node 发行版：运行时只需要 bin/node。
rm -rf node/include node/share node/lib
rm -f node/bin/npm node/bin/npx node/bin/corepack
echo "--- smoke ---"
DSH_HOME=$(mktemp -d) PATH="$(pwd)/node/bin:$PATH" ./app/node_modules/.bin/dsh --version
PATH="$(pwd)/node/bin:$PATH" ./node/bin/node -e "require('./app/node_modules/node-pty'); const r=require('./app/node_modules/react/package.json').version; const d=require('./app/node_modules/react-dom/package.json').version; if(r !== '18.3.1' || d !== '18.3.1') throw new Error('web React major drift')"
./node/bin/node -e "const p=require('./tui/node_modules/@deepseek-harness-tui/dsh-tui/package.json'); if(p.version !== '0.9.3') throw new Error('TUI identity drift')"
echo "--- sizes ---"
du -sh node app tui
