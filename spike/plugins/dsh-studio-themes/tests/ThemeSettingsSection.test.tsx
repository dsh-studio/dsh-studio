import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ThemeController } from '../src/controller'
import { ThemeSettingsSection } from '../src/ThemeSettingsSection'
import type {
  ResolvedTheme,
  ThemeBridge,
  ThemeCatalog,
  ThemeDraft,
  ThemeRendererPort,
} from '../src/types'

const presets = [
  ['preset-gothic-void-crusade', 'Gothic Void Crusade', 'seansong-ideogram', 'MIT'],
  ['preset-milky-way', '银河 Milky Way', 'F4', 'MIT'],
  ['preset-sunset-voyage', '见夕阳', 'Joker Pan', 'MIT'],
  ['preset-inspiration-universe', '灵感小宇宙', 'axdlee', 'CC BY 4.0'],
  ['preset-cloud-ascent', '云上仙途', 'axdlee', 'CC BY 4.0'],
  ['preset-sunrise-coast', 'Sunrise Coast Lab', 'ZhangBoBo Lab', 'CC BY 4.0'],
] as const

function manifest(id: string, name: string, source: 'bundled' | 'user' = 'bundled') {
  return {
    schemaVersion: 1,
    id,
    name,
    appearance: 'auto' as const,
    image: 'background.webp' as const,
    colors: { accent: '#4f8cff' },
    art: { focusX: 0.5, focusY: 0.5 },
    effects: { brightness: 0.8, panelOpacity: 0.76, blur: 12 },
    ...(source === 'bundled'
      ? { attribution: {
          author: presets.find(([presetId]) => presetId === id)?.[2] ?? '作者',
          license: presets.find(([presetId]) => presetId === id)?.[3] ?? 'MIT',
          sourceUrl: 'https://example.com',
          checksum: 'a'.repeat(64),
        } }
      : {}),
  }
}

function catalog(activeId = 'preset-milky-way', withUser = false): ThemeCatalog {
  return {
    activeId,
    warning: null,
    themes: [
      ...presets.map(([id, name]) => ({
        manifest: manifest(id, name),
        source: 'bundled' as const,
        thumbnailDataUrl: `data:image/webp;base64,${id}`,
      })),
      ...(withUser ? [{
        manifest: manifest('user-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '我的海边', 'user'),
        source: 'user' as const,
        thumbnailDataUrl: 'data:image/webp;base64,user',
      }] : []),
    ],
  }
}

function resolved(id: string, name?: string): ResolvedTheme {
  const source = id.startsWith('user-') ? 'user' : 'bundled'
  return {
    manifest: manifest(id, name ?? catalog().themes.find((theme) => theme.manifest.id === id)?.manifest.name ?? '主题', source),
    source,
    backgroundDataUrl: `data:image/webp;base64,background-${id}`,
  }
}

const imported: ThemeDraft = {
  stageId: 'stage-1234567890abcdef1234567890abcdef',
  values: {
    name: '本地图片',
    appearance: 'auto',
    colors: { accent: '#4f8cff' },
    art: { focusX: 0.5, focusY: 0.5 },
    effects: { brightness: 0.8, panelOpacity: 0.76, blur: 12 },
  },
  backgroundDataUrl: 'data:image/webp;base64,imported',
  thumbnailDataUrl: 'data:image/webp;base64,imported-thumb',
}

async function ready(withUser = false) {
  let nextCatalog = catalog(withUser ? 'user-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' : 'preset-milky-way', withUser)
  const bridge = {
    catalog: vi.fn(async () => nextCatalog),
    load: vi.fn(async (id: string) => resolved(id)),
    importImage: vi.fn(async () => imported),
    save: vi.fn(async () => resolved('user-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '本地图片')),
    activate: vi.fn(async (id: string) => resolved(id)),
    delete: vi.fn(async (id: string) => {
      nextCatalog = {
        ...nextCatalog,
        activeId: nextCatalog.activeId === id ? 'system' : nextCatalog.activeId,
        themes: nextCatalog.themes.filter((theme) => theme.manifest.id !== id),
      }
      return nextCatalog
    }),
    discardStage: vi.fn(async () => undefined),
  } satisfies ThemeBridge
  const renderer = {
    applyCommitted: vi.fn(),
    preview: vi.fn(),
    restoreCommitted: vi.fn(),
  } satisfies ThemeRendererPort
  const controller = new ThemeController(bridge, renderer)
  await controller.load()
  return { controller, bridge, renderer }
}

describe('theme settings section', () => {
  it('renders an accessible gallery with exactly six bundled themes', async () => {
    const { controller } = await ready()
    render(<ThemeSettingsSection controller={controller} />)

    expect(screen.getByRole('heading', { name: '主题皮肤' })).toBeVisible()
    expect(screen.getByRole('button', { name: '还原默认' })).toBeEnabled()
    expect(screen.getAllByRole('button', { name: /应用主题/ })).toHaveLength(6)
    expect(screen.getByRole('button', { name: '导入本地图片' })).toBeEnabled()
    expect(screen.getByText('支持 PNG、JPEG、WebP、GIF，最大 20 MB')).toBeVisible()
    expect(screen.getByRole('button', { name: /银河 Milky Way/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('F4 · MIT')).toHaveLength(2)
  })

  it('opens the local editor, updates every control, and cancels cleanly', async () => {
    const user = userEvent.setup()
    const { controller, bridge, renderer } = await ready()
    render(<ThemeSettingsSection controller={controller} />)

    await user.click(screen.getByRole('button', { name: '导入本地图片' }))
    expect(screen.getByRole('heading', { name: '编辑主题' })).toBeVisible()
    await user.clear(screen.getByLabelText('主题名称'))
    await user.type(screen.getByLabelText('主题名称'), '海边工作室')
    expect(screen.queryByLabelText('外观模式')).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText('强调色十六进制值'))
    await user.type(screen.getByLabelText('强调色十六进制值'), '#ff8844')
    await user.click(screen.getByRole('button', { name: '取消编辑' }))

    expect(screen.queryByRole('heading', { name: '编辑主题' })).not.toBeInTheDocument()
    expect(bridge.discardStage).toHaveBeenCalledWith(imported.stageId)
    expect(renderer.restoreCommitted).toHaveBeenCalledWith('preset-milky-way')
  })

  it('keeps failed saves editable and supports retry', async () => {
    const user = userEvent.setup()
    const { controller, bridge } = await ready()
    bridge.save.mockRejectedValueOnce(new Error('磁盘空间不足'))
    render(<ThemeSettingsSection controller={controller} />)

    await user.click(screen.getByRole('button', { name: '导入本地图片' }))
    await user.click(screen.getByRole('button', { name: '保存主题' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('磁盘空间不足')
    expect(screen.getByLabelText('主题名称')).toHaveValue('本地图片')

    await user.click(screen.getByRole('button', { name: '保存主题' }))
    expect(screen.queryByRole('heading', { name: '编辑主题' })).not.toBeInTheDocument()
  })

  it('requires a second explicit action before deleting a local theme', async () => {
    const user = userEvent.setup()
    const { controller, bridge } = await ready(true)
    render(<ThemeSettingsSection controller={controller} />)

    await user.click(screen.getByRole('button', { name: '删除 我的海边' }))
    expect(screen.getByRole('button', { name: '确认删除 我的海边' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '确认删除 我的海边' }))

    expect(bridge.delete).toHaveBeenCalledWith('user-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(screen.queryByText('我的海边')).not.toBeInTheDocument()
  })
})
