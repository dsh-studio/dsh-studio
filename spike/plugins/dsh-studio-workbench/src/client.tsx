import type { ReactElement } from 'react'

import { createWorkbenchBridge } from './bridge'
import { WorkbenchController } from './controller'
import { installWorkbenchStyles } from './styles'
import { WorkbenchSettingsSection } from './WorkbenchSettingsSection'

interface SlotRegistry {
  inject(name: string, callback: () => void): void
  register(spec: Record<string, unknown>, component: unknown): void
}

interface ClientContext {
  slots: SlotRegistry
  effect(body: () => void | (() => void), label?: string): void
}

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  const controller = new WorkbenchController(createWorkbenchBridge())
  ctx.effect(() => {
    const removeStyles = installWorkbenchStyles()
    void controller.load()
    return () => {
      controller.dispose()
      removeStyles()
    }
  }, 'dsh-studio-workbench: component lifecycle')

  function StudioWorkbenchSection(): ReactElement {
    return <WorkbenchSettingsSection controller={controller} />
  }

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'dsh-studio-workbench',
        order: 15,
        label: () => '工作台组件',
      },
      StudioWorkbenchSection,
    ),
  )
}
