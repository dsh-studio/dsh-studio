#!/usr/bin/env bash
# 组装 Windows 版捆绑 runtime:win-x64 Node + 安装 dsh。
# 预期在 Windows 环境跑(CI windows runner 的 Git Bash / 本机 Git Bash),
# npm 原生解析 win32/x64 的平台依赖。产物目录布局与 mac 版一致:
#   runtime/node/node.exe        (Windows 发行版没有 bin/ 层)
#   runtime/app/node_modules/... (dsh 本体)
# 用法:bash prepare-runtime-win.sh [目标目录,默认脚本同级]
set -euo pipefail
cd "$(dirname "$0")"
SCRIPT_DIR="$(pwd)"
# 与 mac 版一致:抬高 Node 堆上限,防大依赖树安装 OOM
export NODE_OPTIONS="--max-old-space-size=4096"
TARGET="${1:-runtime}"
NODE_VER=v24.14.0
DIST="node-${NODE_VER}-win-x64"
NPM_REGISTRY="${DSH_STUDIO_NPM_REGISTRY:-https://registry.npmjs.org}"
mkdir -p "$TARGET" && cd "$TARGET"
RUNTIME_ROOT="$(pwd)"

if [ ! -f node/node.exe ]; then
  curl -fLO "https://nodejs.org/dist/${NODE_VER}/${DIST}.zip"
  unzip -q "${DIST}.zip"
  rm -rf node && mv "$DIST" node && rm "${DIST}.zip"
fi

mkdir -p app
cp "$SCRIPT_DIR/runtime.packages.json" app/package.json
# Web/React 18 与 TUI/React 19 分开安装；宿主 peer 闭包已在精确清单中。
cd app
npm install --ignore-scripts --legacy-peer-deps --prefer-offline --registry="$NPM_REGISTRY"
npm rebuild node-pty
cd ..
TUI_STAGE=$(mktemp -d "${TMPDIR:-/tmp}/dsh-studio-tui.XXXXXX")
cp "$SCRIPT_DIR/runtime.tui.packages.json" "$TUI_STAGE/package.json"
cd "$TUI_STAGE"
npm install --ignore-scripts --legacy-peer-deps --prefer-offline --registry="$NPM_REGISTRY"
cd "$RUNTIME_ROOT"
rm -rf tui
mv "$TUI_STAGE" tui

# 裁剪:运行时只需要 node.exe(去掉 npm/npx/corepack 及其模块树)
rm -rf node/node_modules node/npm node/npx node/npm.cmd node/npx.cmd \
  node/corepack node/corepack.cmd node/CHANGELOG.md node/README.md 2>/dev/null || true

echo "--- smoke ---"
DSH_HOME="$(mktemp -d)" ./node/node.exe ./app/node_modules/@deepseek-ai/dsh/lib/bin.js --version
./node/node.exe -e "require('./app/node_modules/node-pty')"
./node/node.exe -e "const r=require('./app/node_modules/react/package.json').version; const d=require('./app/node_modules/react-dom/package.json').version; const t=require('./tui/node_modules/@deepseek-harness-tui/dsh-tui/package.json').version; if(r !== '18.3.1' || d !== '18.3.1' || t !== '0.9.3') throw new Error('runtime identity drift')"
echo "--- sizes ---"
du -sh node app tui
