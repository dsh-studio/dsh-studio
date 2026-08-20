import { describe, expect, it, vi } from 'vitest'

import { apply } from '../src/client'
import type { ThemeDefinition, ThemeTokenPairs } from '../src/types'

describe('theme client placement', () => {
  it('adds themes inside General settings instead of creating another settings page', () => {
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
      theme: {
        register: vi.fn((_definition: ThemeDefinition) => vi.fn()),
        setTheme: vi.fn(),
        overrideTokens: vi.fn((_source: string, _pairs: ThemeTokenPairs) => vi.fn()),
        getTheme: vi.fn(() => ({ active: { colorScheme: 'dark' as const } })),
      },
      sessions: {
        list: {
          getSnapshot: () => ({ byId: {} }),
          subscribe: () => vi.fn(),
        },
      },
      effect: vi.fn(),
    }

    apply(context)

    expect(injected).toEqual(['settings.general.item'])
    expect(registered).toHaveLength(1)
    expect(registered[0]).toMatchObject({
      name: 'settings.general.item',
      id: 'dsh-studio-themes',
    })
  })
})
