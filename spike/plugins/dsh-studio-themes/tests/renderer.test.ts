import { describe, expect, it, vi } from 'vitest'

import { ThemeRenderer } from '../src/renderer'
import type {
  ResolvedTheme,
  SessionListSnapshot,
  SessionsFace,
  ThemeDefinition,
  ThemeRuntimeFace,
  ThemeTokenPairs,
} from '../src/types'

const committedTheme = (id = 'preset-milky-way'): ResolvedTheme => ({
  manifest: {
    schemaVersion: 1,
    id,
    name: '银河 Milky Way',
    appearance: 'auto',
    image: 'background.webp',
    colors: { accent: '#4f8cff' },
    art: { focusX: 0.4, focusY: 0.6 },
    effects: { brightness: 0.72, panelOpacity: 0.76, blur: 12 },
    attribution: { author: 'F4', license: 'MIT', sourceUrl: 'https://example.com', checksum: 'a'.repeat(64) },
  },
  source: 'bundled',
  backgroundDataUrl: 'data:image/webp;base64,wallpaper',
})

function fakeThemeRuntime() {
  const registrations = new Map<string, ThemeDefinition>()
  const face = {
    register: vi.fn((definition: ThemeDefinition) => {
      registrations.set(definition.id, definition)
      return () => registrations.delete(definition.id)
    }),
    setTheme: vi.fn(),
    overrideTokens: vi.fn((_source: string, _pairs: ThemeTokenPairs) => vi.fn()),
    getTheme: vi.fn(() => ({ active: { colorScheme: 'dark' as const } })),
  } satisfies ThemeRuntimeFace
  return { face, registrations }
}

function fakeSessions(initial: SessionListSnapshot) {
  let snapshot = initial
  const listeners = new Set<() => void>()
  const face: SessionsFace = {
    list: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  }
  return {
    face,
    publish(next: SessionListSnapshot) {
      snapshot = next
      for (const listener of listeners) listener()
    },
  }
}

describe('theme renderer', () => {
  it('owns one noninteractive wallpaper and restores system on dispose', () => {
    const theme = fakeThemeRuntime()
    const sessions = fakeSessions({ current: undefined, byId: {} })
    const renderer = new ThemeRenderer(theme.face, sessions.face)

    renderer.applyCommitted(committedTheme())
    const wall = document.querySelector('[data-dsh-studio-wallpaper]') as HTMLElement
    expect(wall).not.toBeNull()
    expect(getComputedStyle(wall).pointerEvents).toBe('none')
    expect(document.body.dataset.dshStudioSurface).toBe('home')
    expect(theme.face.setTheme).toHaveBeenLastCalledWith('dsh-studio-active')

    renderer.dispose()
    expect(document.querySelector('[data-dsh-studio-wallpaper]')).toBeNull()
    expect(theme.face.setTheme).toHaveBeenLastCalledWith('system')
  })

  it('tracks blank and conversation surfaces through the session store', () => {
    const theme = fakeThemeRuntime()
    const sessions = fakeSessions({ current: 'blank', byId: { blank: { blank: true } } })
    const renderer = new ThemeRenderer(theme.face, sessions.face)
    renderer.applyCommitted(committedTheme())
    expect(document.body.dataset.dshStudioSurface).toBe('home')

    sessions.publish({ current: 'chat', byId: { chat: { blank: false } } })
    expect(document.body.dataset.dshStudioSurface).toBe('conversation')
    renderer.dispose()
  })

  it('previews without changing the committed id and restores it on cancel', () => {
    const theme = fakeThemeRuntime()
    const sessions = fakeSessions({ byId: {} })
    const renderer = new ThemeRenderer(theme.face, sessions.face)
    const committed = committedTheme()
    renderer.applyCommitted(committed)

    renderer.preview(
      { ...committed.manifest, name: '预览', effects: { ...committed.manifest.effects, brightness: 0.5 } },
      'data:image/webp;base64,preview',
    )
    expect(theme.face.setTheme).toHaveBeenLastCalledWith('dsh-studio-preview')

    renderer.restoreCommitted(committed.manifest.id)
    expect(theme.face.setTheme).toHaveBeenLastCalledWith('dsh-studio-active')
    expect((document.querySelector('[data-dsh-studio-wallpaper-image]') as HTMLElement).style.backgroundImage)
      .toContain('wallpaper')
    renderer.dispose()
  })

  it('passes an animated GIF data URL through to the wallpaper layer', () => {
    const theme = fakeThemeRuntime()
    const sessions = fakeSessions({ current: undefined, byId: {} })
    const renderer = new ThemeRenderer(theme.face, sessions.face)
    const gif: ResolvedTheme = {
      ...committedTheme('user-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      manifest: {
        ...committedTheme().manifest,
        id: 'user-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        image: 'background.gif',
        attribution: undefined,
      },
      source: 'user',
      backgroundDataUrl: 'data:image/gif;base64,animated',
    }

    renderer.applyCommitted(gif)

    expect((document.querySelector('[data-dsh-studio-wallpaper-image]') as HTMLElement).style.backgroundImage)
      .toContain('data:image/gif;base64,animated')
    renderer.dispose()
  })
})
