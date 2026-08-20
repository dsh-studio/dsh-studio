/**
 * DSH Studio 插件的 client bundle 预设 — 上游 packages/client/tsdown.client.ts
 * 的裁剪版:同样的 lazy-CJS 产物形状(window.__ModuleLoader__.load 包裹、
 * require 解析外部依赖),但不含 CSS Modules / typert / sourcemap 重写。
 * 外部依赖白名单必须与上游 PLATFORM_MODULES + runtime 豁免保持一致,
 * 白名单外的 require 在运行时的冻结模块表里无解,必然抛错。
 */
import { defineConfig } from 'tsdown'

export const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

/**
 * @param {string} id 插件包名,进 __ModuleLoader__.load 的 id 与错误归属
 */
export function clientBundle(id) {
  return defineConfig({
    entry: { client: 'src/client.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    dts: false,
    sourcemap: false,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    noExternal: (dep) => (CLIENT_EXTERNALS.includes(dep) ? undefined : true),
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'import.meta.env.MODE': JSON.stringify('production'),
      'import.meta.env': JSON.stringify({ MODE: 'production' }),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  })
}
