import { describe, expect, it } from 'vitest'

import { composite, contrast, deriveTokens } from '../src/tokens'
import type { ThemeDraftValues } from '../src/types'

const themeWith = (accent: string, appearance: 'light' | 'dark', panelOpacity = 0.76): ThemeDraftValues => ({
  name: '测试主题',
  appearance,
  colors: { accent },
  art: { focusX: 0.5, focusY: 0.5 },
  effects: { brightness: 0.8, panelOpacity, blur: 12 },
})

describe('theme tokens', () => {
  it.each(['#000000', '#ffffff', '#d4a15f', '#23eaee'])(
    'derives readable semantic tokens from %s',
    (accent) => {
      for (const scheme of ['light', 'dark'] as const) {
        const tokens = deriveTokens(themeWith(accent, scheme), scheme)
        const panel = composite(tokens['--dsw-alias-bg-layer-1'], scheme === 'light' ? '#ffffff' : '#111318')
        expect(contrast(tokens['--dsw-alias-label-primary'], panel)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(tokens['--dsw-alias-brand-primary'], panel)).toBeGreaterThanOrEqual(3)
        expect(tokens['--dsw-alias-bg-base']).toBe('transparent')
        expect(tokens['--dsw-alias-state-error-primary']).toBeDefined()
      }
    },
  )

  it('emits only literal safe colors and keeps opacity on panel tokens', () => {
    const low = deriveTokens(themeWith('#4f8cff', 'dark', 0.4), 'dark')
    const high = deriveTokens(themeWith('#4f8cff', 'dark', 0.96), 'dark')
    const safe = /^(?:#[0-9a-f]{6}|rgba\(\d+, \d+, \d+, 0?\.\d+\)|transparent)$/

    expect(Object.values(low).every((value) => safe.test(value))).toBe(true)
    expect(low['--dsw-alias-bg-layer-1']).not.toBe(high['--dsw-alias-bg-layer-1'])
    expect(low['--dsw-alias-label-primary']).toBe(high['--dsw-alias-label-primary'])
    expect(low['--dsw-alias-brand-primary']).toBe(high['--dsw-alias-brand-primary'])
    expect(low['--dsw-alias-border-l1']).toBe('transparent')
    expect(low['--dsw-alias-border-l2']).toBe('transparent')
    expect(low['--dsw-alias-border-l2-darkmode-thin']).toBe('transparent')
    expect(low['--dsw-specific-input-major']).toMatch(/^rgba\(/)
    expect(low['--dsw-alias-bg-module-platform']).toMatch(/^rgba\(/)
    expect(low['--dsw-alias-interactive-bg-hover-solid']).toMatch(/^rgba\(/)
    expect(low['--dsw-specific-login-input']).toMatch(/^rgba\(/)
    expect(low['--dsw-alias-state-business-primary']).toBe(low['--dsw-alias-brand-primary'])
  })
})
