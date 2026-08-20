import type { ReactElement } from 'react'

import { createThemeBridge } from './bridge'
import { ThemeController } from './controller'
import { ThemeRenderer } from './renderer'
import { ThemeSettingsSection } from './ThemeSettingsSection'
import type { SessionsFace, ThemeRuntimeFace } from './types'

interface SlotRegistry {
  inject(name: string, callback: () => void): void
  register(spec: Record<string, unknown>, component: unknown): void
}

interface ClientContext {
  slots: SlotRegistry
  theme: ThemeRuntimeFace
  sessions: SessionsFace
  effect(body: () => void | (() => void), label?: string): void
}

export const inject = ['slots', 'theme', 'sessions']

export function apply(ctx: ClientContext): void {
  const bridge = createThemeBridge()
  const renderer = new ThemeRenderer(ctx.theme, ctx.sessions)
  const controller = new ThemeController(bridge, renderer)

  ctx.effect(() => {
    void controller.load()
    return () => {
      controller.dispose()
      renderer.dispose()
    }
  }, 'dsh-studio-themes: desktop theme lifecycle')

  function StudioThemeSection(): ReactElement {
    return <ThemeSettingsSection controller={controller} />
  }

  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register(
      {
        name: 'settings.general.item',
        id: 'dsh-studio-themes',
        order: 90,
      },
      StudioThemeSection,
    ),
  )
}
