import { describe, expect, it, vi } from 'vitest'

import { WorkbenchController } from '../src/controller'
import type { WorkbenchBridge, WorkbenchCatalog } from '../src/types'

function catalog(enabled = true): WorkbenchCatalog {
  return {
    generation: 'a'.repeat(64),
    mode: 'normal',
    rolledBack: false,
    warning: null,
    components: [
      {
        id: 'skills-panel',
        displayName: '中文技能面板',
        description: '技能入口',
        package: 'dsh-studio-skills-panel',
        version: '0.1.0',
        source: 'workspace:skills',
        profileRole: 'web',
        license: 'MIT',
        permissions: ['workspace-read'],
        required: false,
        enabled,
        effectiveEnabled: enabled,
        health: enabled ? 'active' : 'disabled',
      },
    ],
  }
}

function bridge(overrides: Partial<WorkbenchBridge> = {}): WorkbenchBridge {
  return {
    catalog: vi.fn().mockResolvedValue(catalog()),
    setEnabled: vi.fn().mockResolvedValue(catalog(false)),
    repair: vi.fn().mockResolvedValue(catalog()),
    startSafeMode: vi.fn().mockResolvedValue({ ...catalog(), mode: 'safe' }),
    openTui: vi.fn().mockResolvedValue('/tmp/launch.command'),
    prepareBrowser: vi.fn().mockResolvedValue('/tmp/browser/0.1.1'),
    marketCatalog: vi.fn().mockResolvedValue({
      total: 1,
      matched: 1,
      query: '',
      categories: {},
      plugins: [{ name: 'dsh-browser' }],
    }),
    ...overrides,
  }
}

describe('workbench controller', () => {
  it('loads catalog and publishes ready state', async () => {
    const controller = new WorkbenchController(bridge())
    await controller.load()
    expect(controller.getSnapshot()).toMatchObject({ phase: 'ready', error: null })
    expect(controller.getSnapshot().catalog?.components).toHaveLength(1)
  })

  it('publishes returned catalog after a successful toggle', async () => {
    const controller = new WorkbenchController(bridge())
    await controller.load()
    await controller.setEnabled('skills-panel', false)
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'ready',
      pendingComponentId: null,
      error: null,
    })
    expect(controller.getSnapshot().catalog?.components[0].enabled).toBe(false)
  })

  it('keeps the previous catalog visible when a toggle fails', async () => {
    const initial = catalog()
    const controller = new WorkbenchController(
      bridge({
        catalog: vi.fn().mockResolvedValue(initial),
        setEnabled: vi
          .fn()
          .mockRejectedValue(new Error('required_component: 核心组件不能关闭')),
      }),
    )
    await controller.load()
    await controller.setEnabled('themes', false)
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'ready',
      catalog: initial,
      pendingComponentId: null,
      error: 'required_component: 核心组件不能关闭',
    })
  })

  it('runs repair and safe-mode actions one at a time', async () => {
    let releaseRepair: ((value: WorkbenchCatalog) => void) | undefined
    const repair = vi.fn(
      () =>
        new Promise<WorkbenchCatalog>((resolve) => {
          releaseRepair = resolve
        }),
    )
    const startSafeMode = vi.fn().mockResolvedValue({ ...catalog(), mode: 'safe' })
    const controller = new WorkbenchController(bridge({ repair, startSafeMode }))
    await controller.load()
    const repairing = controller.repair()
    await controller.startSafeMode()
    expect(startSafeMode).not.toHaveBeenCalled()
    releaseRepair?.(catalog())
    await repairing
    await controller.startSafeMode()
    expect(startSafeMode).toHaveBeenCalledOnce()
  })

  it('ignores an in-flight result after disposal', async () => {
    let release: ((value: WorkbenchCatalog) => void) | undefined
    const pending = new Promise<WorkbenchCatalog>((resolve) => {
      release = resolve
    })
    const controller = new WorkbenchController(
      bridge({ catalog: vi.fn().mockReturnValue(pending) }),
    )
    const loading = controller.load()
    controller.dispose()
    release?.(catalog())
    await loading
    expect(controller.getSnapshot().phase).toBe('loading')
  })
})
