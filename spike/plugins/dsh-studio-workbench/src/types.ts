export type WorkbenchMode = 'normal' | 'safe'
export type ProfileRole = 'web' | 'tui' | 'catalog'
export type ComponentHealth =
  | 'active'
  | 'disabled'
  | 'safeModeDisabled'
  | 'damaged'
  | 'restarting'

export interface ComponentView {
  id: string
  displayName: string
  description: string
  package: string
  version: string
  source: string
  profileRole: ProfileRole
  license: string
  permissions: string[]
  required: boolean
  enabled: boolean
  effectiveEnabled: boolean
  health: ComponentHealth
}

export interface WorkbenchCatalog {
  generation: string
  mode: WorkbenchMode
  rolledBack: boolean
  warning: string | null
  components: ComponentView[]
}

export interface MarketPlugin {
  name: string
  owner?: string
  url?: string
  npm?: string
  category?: string | string[]
  description?: Record<string, string | undefined>
  stars?: number
  downloads?: number | null
}

export interface MarketCatalogPage {
  total: number
  matched: number
  query: string
  categories: Record<string, Record<string, string | undefined>>
  plugins: MarketPlugin[]
}

export interface WorkbenchBridge {
  catalog(): Promise<WorkbenchCatalog>
  setEnabled(componentId: string, enabled: boolean): Promise<WorkbenchCatalog>
  repair(): Promise<WorkbenchCatalog>
  startSafeMode(): Promise<WorkbenchCatalog>
  openTui(): Promise<string>
  prepareBrowser(): Promise<string>
  marketCatalog(query: string, limit?: number): Promise<MarketCatalogPage>
}

export interface WorkbenchSnapshot {
  phase: 'loading' | 'ready' | 'error'
  catalog: WorkbenchCatalog | null
  pendingComponentId: string | null
  pendingGlobalAction: 'repair' | 'safeMode' | null
  error: string | null
}
