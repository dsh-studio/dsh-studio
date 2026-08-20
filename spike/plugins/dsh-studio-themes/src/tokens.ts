import type { ThemeDraftValues, ThemeTokenPairs } from './types'

export type SemanticTokens = Record<string, string>

export function deriveTokens(
  values: ThemeDraftValues,
  scheme: 'light' | 'dark',
): SemanticTokens {
  const alpha = values.effects.panelOpacity.toFixed(2)
  const strongAlpha = Math.min(0.82, values.effects.panelOpacity + 0.16).toFixed(2)
  const hoverAlpha = Math.min(0.88, values.effects.panelOpacity + 0.22).toFixed(2)
  const accent = readableAccent(values.colors.accent, scheme)
  if (scheme === 'light') {
    return {
      '--dsw-alias-bg-base': 'transparent',
      '--dsw-alias-bg-layer-1': `rgba(255, 255, 255, ${alpha})`,
      '--dsw-alias-bg-layer-2': `rgba(250, 251, 253, ${strongAlpha})`,
      '--dsw-alias-bg-layer-3': 'rgba(255, 255, 255, 0.92)',
      '--dsw-alias-bg-overlay': 'rgba(255, 255, 255, 0.90)',
      '--dsw-alias-bg-module-platform': `rgba(250, 251, 253, ${strongAlpha})`,
      '--dsw-alias-bg-multi-select': `rgba(250, 251, 253, ${strongAlpha})`,
      '--dsw-alias-border-inverted2': 'transparent',
      '--dsw-alias-border-inverted': 'transparent',
      '--dsw-alias-border-l1': 'transparent',
      '--dsw-alias-border-l2': 'transparent',
      '--dsw-alias-border-l2-darkmode-thin': 'transparent',
      '--dsw-alias-border-l3': 'transparent',
      '--dsw-alias-border-l4': 'transparent',
      '--dsw-alias-brand-primary': accent,
      '--dsw-alias-label-primary': '#171a21',
      '--dsw-alias-label-secondary': '#525a68',
      '--dsw-alias-label-tertiary': '#687180',
      '--dsw-alias-label-caption': '#7b8492',
      '--dsw-alias-label-dimmed': '#adb4bf',
      '--dsw-alias-state-business-primary': accent,
      '--dsw-alias-state-error-primary': '#b4232f',
      '--dsw-alias-state-success-primary': '#14733f',
      '--dsw-alias-state-warn-primary': '#8a5500',
      '--dsw-alias-button-elevated-fill': `rgba(255, 255, 255, ${strongAlpha})`,
      '--dsw-alias-button-floating-fill': `rgba(255, 255, 255, ${strongAlpha})`,
      '--dsw-alias-button-floating-hover': `rgba(255, 255, 255, ${hoverAlpha})`,
      '--dsw-alias-button-info-fill': accent,
      '--dsw-alias-button-info-hover': accent,
      '--dsw-alias-button-primary-fill': accent,
      '--dsw-alias-button-primary-hover': accent,
      '--dsw-alias-interactive-bg-hover': 'rgba(255, 255, 255, 0.24)',
      '--dsw-alias-interactive-bg-hover-solid': `rgba(255, 255, 255, ${hoverAlpha})`,
      '--dsw-alias-interactive-bg-hover-accent': 'rgba(255, 255, 255, 0.32)',
      '--dsw-alias-interactive-bg-active': 'rgba(255, 255, 255, 0.34)',
      '--dsw-alias-markdown-code-block': `rgba(255, 255, 255, ${strongAlpha})`,
      '--dsw-alias-markdown-code-block-banner': `rgba(255, 255, 255, ${hoverAlpha})`,
      '--dsw-alias-markdown-inline-code': 'rgba(255, 255, 255, 0.46)',
      '--dsw-alias-markdown-placeholder': 'rgba(255, 255, 255, 0.30)',
      '--dsw-alias-markdown-tag': 'rgba(255, 255, 255, 0.38)',
      '--dsw-specific-input-major': `rgba(255, 255, 255, ${strongAlpha})`,
      '--dsw-specific-login-input': `rgba(255, 255, 255, ${strongAlpha})`,
      '--dsw-specific-selector': `rgba(255, 255, 255, ${strongAlpha})`,
      '--dsw-specific-tip': `rgba(255, 255, 255, ${strongAlpha})`,
      '--dsw-specific-bubble': `rgba(255, 255, 255, ${strongAlpha})`,
      '--dsw-specific-menu': 'rgba(255, 255, 255, 0.92)',
      '--dsw-specific-sidebar-fill': `rgba(247, 248, 251, ${alpha})`,
      '--dsw-specific-sidebar-nav-item-active-accent': 'rgba(79, 140, 255, 0.16)',
      '--dsw-specific-sidebar-nav-item-active': 'rgba(255, 255, 255, 0.30)',
      '--dsw-specific-sidebar-nav-item-hover': 'rgba(255, 255, 255, 0.20)',
      '--dsh-studio-readable-wash': 'rgba(255, 255, 255, 0.18)',
    }
  }
  return {
    '--dsw-alias-bg-base': 'transparent',
    '--dsw-alias-bg-layer-1': `rgba(17, 20, 26, ${alpha})`,
    '--dsw-alias-bg-layer-2': `rgba(20, 23, 30, ${strongAlpha})`,
    '--dsw-alias-bg-layer-3': 'rgba(20, 23, 30, 0.92)',
    '--dsw-alias-bg-overlay': 'rgba(20, 23, 30, 0.90)',
    '--dsw-alias-bg-module-platform': `rgba(20, 23, 30, ${strongAlpha})`,
    '--dsw-alias-bg-multi-select': `rgba(20, 23, 30, ${strongAlpha})`,
    '--dsw-alias-border-inverted2': 'transparent',
    '--dsw-alias-border-inverted': 'transparent',
    '--dsw-alias-border-l1': 'transparent',
    '--dsw-alias-border-l2': 'transparent',
    '--dsw-alias-border-l2-darkmode-thin': 'transparent',
    '--dsw-alias-border-l3': 'transparent',
    '--dsw-alias-border-l4': 'transparent',
    '--dsw-alias-brand-primary': accent,
    '--dsw-alias-label-primary': '#f3f5f8',
    '--dsw-alias-label-secondary': '#c0c6d0',
    '--dsw-alias-label-tertiary': '#a2aab7',
    '--dsw-alias-label-caption': '#858e9c',
    '--dsw-alias-label-dimmed': '#626b78',
    '--dsw-alias-state-business-primary': accent,
    '--dsw-alias-state-error-primary': '#ff7b86',
    '--dsw-alias-state-success-primary': '#68d391',
    '--dsw-alias-state-warn-primary': '#f5bd61',
    '--dsw-alias-button-elevated-fill': `rgba(17, 20, 26, ${strongAlpha})`,
    '--dsw-alias-button-floating-fill': `rgba(17, 20, 26, ${strongAlpha})`,
    '--dsw-alias-button-floating-hover': `rgba(27, 31, 39, ${hoverAlpha})`,
    '--dsw-alias-button-info-fill': accent,
    '--dsw-alias-button-info-hover': accent,
    '--dsw-alias-button-primary-fill': accent,
    '--dsw-alias-button-primary-hover': accent,
    '--dsw-alias-interactive-bg-hover': 'rgba(255, 255, 255, 0.10)',
    '--dsw-alias-interactive-bg-hover-solid': `rgba(27, 31, 39, ${hoverAlpha})`,
    '--dsw-alias-interactive-bg-hover-accent': 'rgba(255, 255, 255, 0.18)',
    '--dsw-alias-interactive-bg-active': 'rgba(255, 255, 255, 0.16)',
    '--dsw-alias-markdown-code-block': `rgba(13, 16, 21, ${strongAlpha})`,
    '--dsw-alias-markdown-code-block-banner': `rgba(13, 16, 21, ${hoverAlpha})`,
    '--dsw-alias-markdown-inline-code': 'rgba(13, 16, 21, 0.56)',
    '--dsw-alias-markdown-placeholder': 'rgba(13, 16, 21, 0.42)',
    '--dsw-alias-markdown-tag': 'rgba(13, 16, 21, 0.50)',
    '--dsw-specific-input-major': `rgba(13, 16, 21, ${strongAlpha})`,
    '--dsw-specific-login-input': `rgba(13, 16, 21, ${strongAlpha})`,
    '--dsw-specific-selector': `rgba(13, 16, 21, ${strongAlpha})`,
    '--dsw-specific-tip': `rgba(13, 16, 21, ${strongAlpha})`,
    '--dsw-specific-bubble': `rgba(13, 16, 21, ${strongAlpha})`,
    '--dsw-specific-menu': 'rgba(20, 23, 30, 0.92)',
    '--dsw-specific-sidebar-fill': `rgba(13, 16, 21, ${alpha})`,
    '--dsw-specific-sidebar-nav-item-active-accent': 'rgba(79, 140, 255, 0.20)',
    '--dsw-specific-sidebar-nav-item-active': 'rgba(255, 255, 255, 0.12)',
    '--dsw-specific-sidebar-nav-item-hover': 'rgba(255, 255, 255, 0.08)',
    '--dsh-studio-readable-wash': 'rgba(6, 8, 12, 0.20)',
  }
}

export function deriveTokenPairs(values: ThemeDraftValues): ThemeTokenPairs {
  const light = deriveTokens(values, 'light')
  const dark = deriveTokens(values, 'dark')
  return Object.fromEntries(
    Object.keys(light).map((name) => [name, { light: light[name], dark: dark[name] }]),
  )
}

export function contrast(foreground: string, background: string): number {
  const first = relativeLuminance(parseColor(foreground, [255, 255, 255]))
  const second = relativeLuminance(parseColor(background, [255, 255, 255]))
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

export function composite(color: string, backdrop = '#ffffff'): string {
  const background = parseColor(backdrop, [255, 255, 255])
  const match = color.match(/^rgba\((\d+), (\d+), (\d+), (0?\.\d+)\)$/)
  if (match === null) return normalizeHex(color)
  const alpha = Number(match[4])
  return toHex([
    Number(match[1]) * alpha + background[0] * (1 - alpha),
    Number(match[2]) * alpha + background[1] * (1 - alpha),
    Number(match[3]) * alpha + background[2] * (1 - alpha),
  ])
}

function readableAccent(accent: string, scheme: 'light' | 'dark'): string {
  let rgb = parseHex(accent)
  const panel = scheme === 'light' ? '#f8f9fb' : '#14171d'
  const toward: [number, number, number] = scheme === 'light' ? [0, 0, 0] : [255, 255, 255]
  for (let step = 0; step < 20 && contrast(toHex(rgb), panel) < 3; step += 1) {
    rgb = rgb.map((channel, index) => channel + (toward[index] - channel) * 0.08) as [number, number, number]
  }
  return toHex(rgb)
}

function parseColor(value: string, backdrop: [number, number, number]): [number, number, number] {
  if (value === 'transparent') return backdrop
  const rgba = value.match(/^rgba\((\d+), (\d+), (\d+), (0?\.\d+)\)$/)
  if (rgba !== null) {
    const alpha = Number(rgba[4])
    return [
      Number(rgba[1]) * alpha + backdrop[0] * (1 - alpha),
      Number(rgba[2]) * alpha + backdrop[1] * (1 - alpha),
      Number(rgba[3]) * alpha + backdrop[2] * (1 - alpha),
    ]
  }
  return parseHex(value)
}

function parseHex(value: string): [number, number, number] {
  const normalized = normalizeHex(value)
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ]
}

function normalizeHex(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : '#4f8cff'
}

function toHex(channels: readonly number[]): string {
  return `#${channels
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')}`
}

function relativeLuminance(channels: [number, number, number]): number {
  const [red, green, blue] = channels.map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}
