import { describe, expect, it, vi } from 'vitest'

import { createThemeBridge } from '../src/bridge'

function installTauriMock(invoke: ReturnType<typeof vi.fn>): void {
  ;(window as Window & { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } }
}

describe('theme bridge', () => {
  it('uses only allowed command names and camelCase arguments', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    installTauriMock(invoke)
    const bridge = createThemeBridge()

    await bridge.catalog()
    await bridge.load('preset-milky-way')
    await bridge.importImage()
    await bridge.save({ themeId: null, stageId: 'stage-123', values: {} as never })
    await bridge.activate('preset-milky-way')
    await bridge.delete('user-123')
    await bridge.discardStage('stage-123')

    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      'theme_catalog',
      'theme_load',
      'theme_import_image',
      'theme_save',
      'theme_activate',
      'theme_delete',
      'theme_discard_stage',
    ])
    expect(invoke).toHaveBeenNthCalledWith(2, 'theme_load', { themeId: 'preset-milky-way' })
    expect(invoke).toHaveBeenNthCalledWith(4, 'theme_save', {
      request: { themeId: null, stageId: 'stage-123', values: {} },
    })
    expect(invoke).toHaveBeenNthCalledWith(5, 'theme_activate', { themeId: 'preset-milky-way' })
    expect(invoke).toHaveBeenNthCalledWith(7, 'theme_discard_stage', { stageId: 'stage-123' })
  })

  it('fails with a stable desktop-only message before invoking anything', async () => {
    const bridge = createThemeBridge()
    await expect(bridge.catalog()).rejects.toThrow('desktop_only')
  })
})
