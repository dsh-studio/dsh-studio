import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeController } from '../src/controller'
import type {
  ResolvedTheme,
  ThemeBridge,
  ThemeCatalog,
  ThemeDraft,
  ThemeRendererPort,
} from '../src/types'

const manifest = (id = 'preset-milky-way') => ({
  schemaVersion: 1,
  id,
  name: id === 'preset-milky-way' ? '银河 Milky Way' : '我的主题',
  appearance: 'auto' as const,
  image: 'background.webp',
  colors: { accent: '#4f8cff' },
  art: { focusX: 0.5, focusY: 0.5 },
  effects: { brightness: 0.8, panelOpacity: 0.76, blur: 12 },
  ...(id.startsWith('preset-')
    ? { attribution: { author: 'F4', license: 'MIT', sourceUrl: 'https://example.com', checksum: 'a'.repeat(64) } }
    : {}),
})

const resolved = (id = 'preset-milky-way'): ResolvedTheme => ({
  manifest: manifest(id),
  source: id.startsWith('preset-') ? 'bundled' : 'user',
  backgroundDataUrl: 'data:image/webp;base64,background',
})

const catalog = (activeId = 'preset-milky-way'): ThemeCatalog => ({
  activeId,
  warning: null,
  themes: [
    {
      manifest: manifest(),
      source: 'bundled',
      thumbnailDataUrl: 'data:image/webp;base64,thumb',
    },
  ],
})

const importDraft = (stageId = 'stage-123'): ThemeDraft => ({
  stageId,
  values: {
    name: '新主题',
    appearance: 'auto',
    colors: { accent: '#4f8cff' },
    art: { focusX: 0.5, focusY: 0.5 },
    effects: { brightness: 0.8, panelOpacity: 0.76, blur: 12 },
  },
  backgroundDataUrl: 'data:image/webp;base64,new-background',
  thumbnailDataUrl: 'data:image/webp;base64,new-thumb',
})

function readyController(activeId = 'preset-milky-way') {
  const bridge = {
    catalog: vi.fn().mockResolvedValue(catalog(activeId)),
    load: vi.fn().mockImplementation(async (id: string) => resolved(id)),
    importImage: vi.fn().mockResolvedValue(importDraft()),
    save: vi.fn().mockResolvedValue(resolved('user-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')),
    activate: vi.fn().mockImplementation(async (id: string) => resolved(id)),
    delete: vi.fn().mockResolvedValue(catalog('system')),
    discardStage: vi.fn().mockResolvedValue(undefined),
  } satisfies ThemeBridge
  const renderer = {
    applyCommitted: vi.fn(),
    preview: vi.fn(),
    restoreCommitted: vi.fn(),
  } satisfies ThemeRendererPort
  const controller = new ThemeController(bridge, renderer)
  return { controller, bridge, renderer }
}

describe('theme controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the persisted catalog and renders the active theme', async () => {
    const { controller, renderer } = readyController()
    await controller.load()

    expect(controller.getSnapshot()).toMatchObject({ phase: 'ready', activeId: 'preset-milky-way' })
    expect(renderer.applyCommitted).toHaveBeenCalledWith(resolved())
  })

  it('restores the rollback theme and discards staging on cancel', async () => {
    const { controller, bridge, renderer } = readyController()
    await controller.load()
    await controller.importImage()
    controller.patchDraft({ effects: { brightness: 0.55 } })
    await controller.cancelEditor()

    expect(renderer.restoreCommitted).toHaveBeenCalledWith('preset-milky-way')
    expect(bridge.discardStage).toHaveBeenCalledWith('stage-123')
    expect(controller.getSnapshot().editor).toBeNull()
  })

  it('deep-merges draft patches without mutating a published snapshot', async () => {
    const { controller } = readyController()
    await controller.load()
    await controller.importImage()
    const before = controller.getSnapshot()

    controller.patchDraft({ effects: { brightness: 0.55 }, art: { focusX: 0.2 } })

    expect(controller.getSnapshot().editor?.draft.effects).toEqual({
      brightness: 0.55,
      panelOpacity: 0.76,
      blur: 12,
    })
    expect(controller.getSnapshot().editor?.draft.art).toEqual({ focusX: 0.2, focusY: 0.5 })
    expect(before.editor?.draft.effects.brightness).toBe(0.8)
  })

  it('keeps draft values and active selection when save fails, then retries', async () => {
    const { controller, bridge } = readyController()
    await controller.load()
    await controller.importImage()
    controller.patchDraft({ name: '海边工作室' })
    bridge.save.mockRejectedValueOnce(new Error('disk full'))

    await controller.saveEditor()
    expect(controller.getSnapshot().editor?.draft.name).toBe('海边工作室')
    expect(controller.getSnapshot().activeId).toBe('preset-milky-way')
    expect(controller.getSnapshot().error).toContain('disk full')

    await controller.saveEditor()
    expect(controller.getSnapshot().editor).toBeNull()
    expect(controller.getSnapshot().activeId).toContain('user-')
  })

  it('ignores stale async activation completions', async () => {
    const { controller, bridge } = readyController()
    await controller.load()
    let resolveFirst: ((value: ResolvedTheme) => void) | undefined
    bridge.activate
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce(resolved('preset-second'))

    const first = controller.activate('preset-first')
    await controller.activate('preset-second')
    resolveFirst?.(resolved('preset-first'))
    await first

    expect(controller.getSnapshot().activeId).toBe('preset-second')
  })

  it('deleting the active user theme restores system', async () => {
    const userId = 'user-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const { controller, bridge, renderer } = readyController(userId)
    bridge.catalog.mockResolvedValue({ ...catalog(userId), themes: [{
      manifest: manifest(userId), source: 'user', thumbnailDataUrl: 'data:image/webp;base64,user',
    }] })
    await controller.load()

    await controller.deleteUserTheme(userId)

    expect(controller.getSnapshot().activeId).toBe('system')
    expect(renderer.restoreCommitted).toHaveBeenLastCalledWith('system')
  })
})
