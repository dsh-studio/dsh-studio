import type { ThemeEffects } from './types'

export const HOME_SCRIM_OPACITY = 0.04
export const CONVERSATION_SCRIM_OPACITY = 0.12

/**
 * Approximate the wallpaper signal that remains after brightness, panel fill,
 * and the global scrim are composited. This is deliberately simple: it gives
 * bundled themes a stable guardrail against turning artwork into a vague tint.
 */
export function wallpaperVisibility(
  effects: Pick<ThemeEffects, 'brightness' | 'panelOpacity'>,
  scrimOpacity: number,
): number {
  return effects.brightness * (1 - effects.panelOpacity) * (1 - scrimOpacity)
}
