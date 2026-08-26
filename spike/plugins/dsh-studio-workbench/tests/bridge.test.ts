import { describe, expect, it, vi } from 'vitest'

import { createWorkbenchBridge } from '../src/bridge'

const catalog = {
  generation: 'a'.repeat(64),
  mode: 'normal' as const,
  rolledBack: false,
  warning: null,
  components: [],
}

describe('workbench bridge', () => {
  it('uses only the seven narrow workbench desktop commands', async () => {
    const invoke = vi.fn().mockResolvedValue(catalog)
    ;(window as Window & { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } }
    const bridge = createWorkbenchBridge()

    await bridge.catalog()
    await bridge.setEnabled('skills-panel', false)
    await bridge.repair()
    await bridge.startSafeMode()
    await bridge.openTui()
    await bridge.prepareBrowser()
    await bridge.marketCatalog('browser', 25)

    expect(invoke.mock.calls).toEqual([
      ['workbench_catalog'],
      ['workbench_set_enabled', { componentId: 'skills-panel', enabled: false }],
      ['workbench_repair'],
      ['workbench_start_safe_mode'],
      ['workbench_open_tui'],
      ['workbench_prepare_browser'],
      ['workbench_market_catalog', { query: 'browser', limit: 25 }],
    ])
  })

  it('rejects browser-only use before invoking anything', async () => {
    const bridge = createWorkbenchBridge()
    await expect(bridge.catalog()).rejects.toThrow(
      'desktop_only: 工作台组件仅在 DSH Studio 桌面应用中可用',
    )
  })
})
