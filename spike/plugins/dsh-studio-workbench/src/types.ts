export type WorkbenchMode = 'normal' | 'safe'
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

export interface WorkbenchBridge {
  catalog(): Promise<WorkbenchCatalog>
  setEnabled(componentId: string, enabled: boolean): Promise<WorkbenchCatalog>
  repair(): Promise<WorkbenchCatalog>
  startSafeMode(): Promise<WorkbenchCatalog>
}

export interface WorkbenchSnapshot {
  phase: 'loading' | 'ready' | 'error'
  catalog: WorkbenchCatalog | null
  pendingComponentId: string | null
  pendingGlobalAction: 'repair' | 'safeMode' | null
  error: string | null
}
