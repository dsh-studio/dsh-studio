import type { WorkbenchBridge, WorkbenchCatalog } from './types'

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>

function desktopInvoke(): Invoke {
  const tauri = (window as Window & {
    __TAURI__?: { core?: { invoke?: Invoke } }
  }).__TAURI__
  if (typeof tauri?.core?.invoke !== 'function') {
    throw new Error('desktop_only: 工作台组件仅在 DSH Studio 桌面应用中可用')
  }
  return tauri.core.invoke
}

export function createWorkbenchBridge(): WorkbenchBridge {
  return {
    catalog: async () => desktopInvoke()<WorkbenchCatalog>('workbench_catalog'),
    setEnabled: async (componentId, enabled) =>
      desktopInvoke()<WorkbenchCatalog>('workbench_set_enabled', { componentId, enabled }),
    repair: async () => desktopInvoke()<WorkbenchCatalog>('workbench_repair'),
    startSafeMode: async () =>
      desktopInvoke()<WorkbenchCatalog>('workbench_start_safe_mode'),
  }
}
