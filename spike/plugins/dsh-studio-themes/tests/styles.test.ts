import { afterEach, describe, expect, it } from 'vitest'

import { installThemeStyles } from '../src/styles'

afterEach(() => {
  document.head.querySelectorAll('[data-plugin="dsh-studio-themes"]').forEach((node) => node.remove())
})

describe('theme visual styles', () => {
  it('keeps the editor and gallery controls borderless while preserving focus outlines', () => {
    const dispose = installThemeStyles()
    const css = document.head.querySelector<HTMLStyleElement>(
      '[data-plugin-css="dsh-studio-themes/styles"]',
    )?.textContent ?? ''

    expect(css).toContain('.dsh-theme-button{')
    expect(css).toContain('border:0')
    expect(css).toContain('.dsh-theme-input:not([type="range"]){')
    expect(css).toContain('.dsh-theme-input:focus-visible{outline:2px')
    expect(css).not.toContain('border:1px solid var(--dsw-alias-border-l1)')

    dispose()
  })
})
