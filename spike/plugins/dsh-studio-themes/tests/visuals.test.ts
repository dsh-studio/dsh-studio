import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  CONVERSATION_SCRIM_OPACITY,
  HOME_SCRIM_OPACITY,
  wallpaperVisibility,
} from '../src/visuals'
import type { ThemeManifest } from '../src/types'

const presetsRoot = resolve(process.cwd(), '../../themes/presets')

function bundledThemes(): ThemeManifest[] {
  return readdirSync(presetsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => JSON.parse(
      readFileSync(join(presetsRoot, entry.name, 'theme.json'), 'utf8'),
    ) as ThemeManifest)
}

describe('bundled wallpaper visibility', () => {
  it('keeps artwork legible behind the home and conversation surfaces', () => {
    const themes = bundledThemes()
    expect(themes).toHaveLength(6)

    for (const theme of themes) {
      expect(theme.appearance, theme.name).not.toBe('auto')
      expect(theme.effects.blur, theme.name).toBeLessThanOrEqual(2)
      expect(wallpaperVisibility(theme.effects, HOME_SCRIM_OPACITY), theme.name)
        .toBeGreaterThanOrEqual(0.5)
      expect(wallpaperVisibility(theme.effects, CONVERSATION_SCRIM_OPACITY), theme.name)
        .toBeGreaterThanOrEqual(0.44)
    }
  })
})
