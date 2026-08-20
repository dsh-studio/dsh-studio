export type Appearance = 'auto' | 'light' | 'dark'
export type ThemeSource = 'bundled' | 'user'

export interface ThemeColors {
  accent: string
}

export interface ThemeArt {
  focusX: number
  focusY: number
}

export interface ThemeEffects {
  brightness: number
  panelOpacity: number
  blur: number
}

export interface Attribution {
  author: string
  license: string
  sourceUrl: string
  checksum: string
}

export interface ThemeManifest {
  schemaVersion: number
  id: string
  name: string
  appearance: Appearance
  image: 'background.webp' | 'background.gif'
  colors: ThemeColors
  art: ThemeArt
  effects: ThemeEffects
  attribution?: Attribution
}

export interface ThemeDraftValues {
  name: string
  appearance: Appearance
  colors: ThemeColors
  art: ThemeArt
  effects: ThemeEffects
}

export interface ThemeDraftPatch {
  name?: string
  appearance?: Appearance
  colors?: Partial<ThemeColors>
  art?: Partial<ThemeArt>
  effects?: Partial<ThemeEffects>
}

export interface ThemeDraft {
  stageId: string
  values: ThemeDraftValues
  backgroundDataUrl: string
  thumbnailDataUrl: string
}

export interface SaveThemeRequest {
  themeId: string | null
  stageId: string | null
  values: ThemeDraftValues
}

export interface ThemeSummary {
  manifest: ThemeManifest
  source: ThemeSource
  thumbnailDataUrl: string
}

export interface ThemeCatalog {
  activeId: string
  themes: ThemeSummary[]
  warning: string | null
}

export interface ResolvedTheme {
  manifest: ThemeManifest
  source: ThemeSource
  backgroundDataUrl: string
}

export interface ThemeBridge {
  catalog(): Promise<ThemeCatalog>
  load(themeId: string): Promise<ResolvedTheme>
  importImage(): Promise<ThemeDraft | null>
  save(request: SaveThemeRequest): Promise<ResolvedTheme>
  activate(themeId: string): Promise<ResolvedTheme>
  delete(themeId: string): Promise<ThemeCatalog>
  discardStage(stageId: string): Promise<void>
}

export interface ThemeEditorState {
  mode: 'create' | 'edit'
  themeId: string | null
  rollbackId: string
  stageId: string | null
  draft: ThemeDraftValues
  backgroundDataUrl: string
  thumbnailDataUrl: string
  saving: boolean
}

export interface ThemeControllerSnapshot {
  phase: 'loading' | 'ready' | 'error'
  catalog: ThemeCatalog | null
  activeId: string
  editor: ThemeEditorState | null
  error: string | null
}

export interface ThemeRendererPort {
  applyCommitted(theme: ResolvedTheme): void
  preview(values: ThemeDraftValues, backgroundDataUrl: string): void
  restoreCommitted(themeId: string): void
}

export interface ThemeDefinition {
  id: string
  colorScheme: 'light' | 'dark'
  tokens: Record<string, string>
}

export type ThemeTokenPairs = Record<string, { light: string; dark: string }>

export interface ThemeRuntimeFace {
  register(definition: ThemeDefinition): () => void
  setTheme(id: string): void
  overrideTokens(source: string, pairs: ThemeTokenPairs): () => void
  getTheme(): { active: { colorScheme: 'light' | 'dark' } }
}

export interface SessionListSnapshot {
  current?: string
  byId: Record<string, { blank: boolean } | undefined>
}

export interface SessionsFace {
  list: {
    getSnapshot(): SessionListSnapshot
    subscribe(listener: () => void): () => void
  }
}
