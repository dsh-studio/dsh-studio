#!/usr/bin/env bash
# 组装 Windows 版捆绑 runtime:win-x64 Node + 安装 dsh。
# 预期在 Windows 环境跑(CI windows runner 的 Git Bash / 本机 Git Bash),
# npm 原生解析 win32/x64 的平台依赖。产物目录布局与 mac 版一致:
#   runtime/node/node.exe        (Windows 发行版没有 bin/ 层)
#   runtime/app/node_modules/... (dsh 本体)
# 用法:bash prepare-runtime-win.sh [目标目录,默认脚本同级]
set -euo pipefail
cd "$(dirname "$0")"
# 与 mac 版一致:抬高 Node 堆上限,防大依赖树安装 OOM
export NODE_OPTIONS="--max-old-space-size=4096"
TARGET="${1:-runtime}"
NODE_VER=v24.14.0
DSH_VER=0.1.0-rc.6   # 与 mac 版捆绑一致;升级需两平台同步 + 全量回归
DIST="node-${NODE_VER}-win-x64"

mkdir -p "$TARGET" && cd "$TARGET"

if [ ! -f node/node.exe ]; then
  curl -fLO "https://nodejs.org/dist/${NODE_VER}/${DIST}.zip"
  unzip -q "${DIST}.zip"
  rm -rf node && mv "$DIST" node && rm "${DIST}.zip"
fi

mkdir -p app && cd app
[ -f package.json ] || npm init -y >/dev/null
npm install "@deepseek-ai/dsh@${DSH_VER}"
cd ..

# 裁剪:运行时只需要 node.exe(去掉 npm/npx/corepack 及其模块树)
rm -rf node/node_modules node/npm node/npx node/npm.cmd node/npx.cmd \
  node/corepack node/corepack.cmd node/CHANGELOG.md node/README.md 2>/dev/null || true

echo "--- smoke ---"
DSH_HOME="$(mktemp -d)" ./node/node.exe ./app/node_modules/@deepseek-ai/dsh/lib/bin.js --version
echo "--- sizes ---"
du -sh node app
