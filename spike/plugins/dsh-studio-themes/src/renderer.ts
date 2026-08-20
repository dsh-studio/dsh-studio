import { installThemeStyles } from './styles'
import { deriveTokenPairs, deriveTokens } from './tokens'
import type {
  ResolvedTheme,
  SessionsFace,
  ThemeDefinition,
  ThemeDraftValues,
  ThemeRendererPort,
  ThemeRuntimeFace,
} from './types'

const ACTIVE_ID = 'dsh-studio-active'
const PREVIEW_ID = 'dsh-studio-preview'
const PREVIEW_SOURCE = 'dsh-studio-themes:preview'

export class ThemeRenderer implements ThemeRendererPort {
  private readonly committed = new Map<string, ResolvedTheme>()
  private activeDispose: (() => void) | null = null
  private previewDispose: (() => void) | null = null
  private overrideDispose: (() => void) | null = null
  private wallpaper: HTMLDivElement | null = null
  private wallpaperImage: HTMLDivElement | null = null
  private readonly stopSessions: () => void
  private readonly stopStyles: () => void
  private readonly media: MediaQueryList | null
  private current: { values: ThemeDraftValues; image: string; mode: 'active' | 'preview' } | null = null
  private disposed = false

  constructor(
    private readonly theme: ThemeRuntimeFace,
    sessions: SessionsFace,
  ) {
    this.stopStyles = installThemeStyles()
    this.stopSessions = sessions.list.subscribe(() => this.updateSurface(sessions))
    this.updateSurface(sessions)
    this.media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null
    this.media?.addEventListener('change', this.handleSchemeChange)
  }

  applyCommitted(theme: ResolvedTheme): void {
    if (this.disposed) return
    this.committed.set(theme.manifest.id, theme)
    this.clearPreview()
    this.registerActive(theme)
    this.paint(valuesFrom(theme), theme.backgroundDataUrl, 'active')
  }

  preview(values: ThemeDraftValues, backgroundDataUrl: string): void {
    if (this.disposed) return
    const scheme = this.resolveScheme(values)
    if (this.previewDispose === null) {
      this.previewDispose = this.theme.register({
        id: PREVIEW_ID,
        colorScheme: scheme,
        tokens: deriveTokens(values, scheme),
      })
    }
    this.overrideDispose?.()
    this.overrideDispose = this.theme.overrideTokens(PREVIEW_SOURCE, deriveTokenPairs(values))
    this.theme.setTheme(PREVIEW_ID)
    this.paint(values, backgroundDataUrl, 'preview')
  }

  restoreCommitted(themeId: string): void {
    if (this.disposed) return
    this.clearPreview()
    if (themeId === 'system') {
      this.activeDispose?.()
      this.activeDispose = null
      this.removeWallpaper()
      this.theme.setTheme('system')
      return
    }
    const theme = this.committed.get(themeId)
    if (theme === undefined) {
      this.removeWallpaper()
      this.theme.setTheme('system')
      return
    }
    this.registerActive(theme)
    this.paint(valuesFrom(theme), theme.backgroundDataUrl, 'active')
  }

  dispose(): void {
    if (this.disposed) return
    this.clearPreview()
    this.activeDispose?.()
    this.activeDispose = null
    this.stopSessions()
    this.media?.removeEventListener('change', this.handleSchemeChange)
    this.removeWallpaper()
    delete document.body.dataset.dshStudioSurface
    this.theme.setTheme('system')
    this.stopStyles()
    this.disposed = true
  }

  private registerActive(theme: ResolvedTheme): void {
    this.activeDispose?.()
    const values = valuesFrom(theme)
    const scheme = this.resolveScheme(values)
    this.activeDispose = this.theme.register({
      id: ACTIVE_ID,
      colorScheme: scheme,
      tokens: deriveTokens(values, scheme),
    })
    this.theme.setTheme(ACTIVE_ID)
  }

  private clearPreview(): void {
    this.overrideDispose?.()
    this.overrideDispose = null
    this.previewDispose?.()
    this.previewDispose = null
  }

  private paint(values: ThemeDraftValues, image: string, mode: 'active' | 'preview'): void {
    const imageLayer = this.ensureWallpaper()
    imageLayer.style.backgroundImage = `url("${image.replaceAll('"', '%22')}")`
    imageLayer.style.backgroundPosition = `${values.art.focusX * 100}% ${values.art.focusY * 100}%`
    imageLayer.style.filter = `brightness(${values.effects.brightness}) blur(${values.effects.blur}px)`
    document.body.dataset.dshStudioThemeActive = 'true'
    this.current = { values, image, mode }
  }

  private ensureWallpaper(): HTMLDivElement {
    if (this.wallpaperImage !== null) return this.wallpaperImage
    const wallpaper = document.createElement('div')
    wallpaper.dataset.dshStudioWallpaper = ''
    wallpaper.setAttribute('aria-hidden', 'true')
    const image = document.createElement('div')
    image.dataset.dshStudioWallpaperImage = ''
    const scrim = document.createElement('div')
    scrim.dataset.dshStudioWallpaperScrim = ''
    wallpaper.append(image, scrim)
    document.body.prepend(wallpaper)
    this.wallpaper = wallpaper
    this.wallpaperImage = image
    return image
  }

  private removeWallpaper(): void {
    this.wallpaper?.remove()
    this.wallpaper = null
    this.wallpaperImage = null
    this.current = null
    delete document.body.dataset.dshStudioThemeActive
  }

  private updateSurface(sessions: SessionsFace): void {
    const state = sessions.list.getSnapshot()
    const current = state.current === undefined ? undefined : state.byId[state.current]
    document.body.dataset.dshStudioSurface = current === undefined || current.blank
      ? 'home'
      : 'conversation'
  }

  private resolveScheme(values: ThemeDraftValues): 'light' | 'dark' {
    if (values.appearance !== 'auto') return values.appearance
    if (this.media !== null) return this.media.matches ? 'dark' : 'light'
    return this.theme.getTheme().active.colorScheme
  }

  private readonly handleSchemeChange = (): void => {
    const current = this.current
    if (current === null || current.values.appearance !== 'auto') return
    if (current.mode === 'preview') {
      this.previewDispose?.()
      this.previewDispose = null
      this.preview(current.values, current.image)
      return
    }
    const committed = [...this.committed.values()].find(
      (theme) => theme.backgroundDataUrl === current.image,
    )
    if (committed !== undefined) this.registerActive(committed)
  }
}

function valuesFrom(theme: ResolvedTheme): ThemeDraftValues {
  return {
    name: theme.manifest.name,
    appearance: theme.manifest.appearance,
    colors: { ...theme.manifest.colors },
    art: { ...theme.manifest.art },
    effects: { ...theme.manifest.effects },
  }
}

export type { ThemeDefinition }
