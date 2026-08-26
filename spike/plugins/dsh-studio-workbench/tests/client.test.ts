import { describe, expect, it, vi } from 'vitest'

import { apply } from '../src/client'

describe('workbench client placement', () => {
  it('registers exactly one Workbench Components settings section', () => {
    const injected: string[] = []
    const registered: Array<Record<string, unknown>> = []
    const context = {
      slots: {
        inject(name: string, callback: () => void) {
          injected.push(name)
          callback()
        },
        register(spec: Record<string, unknown>) {
          registered.push(spec)
        },
      },
      effect: vi.fn(),
    }

    apply(context)

    expect(injected).toEqual(['settings.section'])
    expect(registered).toHaveLength(1)
    expect(registered[0]).toMatchObject({
      name: 'settings.section',
      id: 'dsh-studio-workbench',
      order: 15,
    })
  })
})
