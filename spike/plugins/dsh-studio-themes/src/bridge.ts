import type {
  ResolvedTheme,
  SaveThemeRequest,
  ThemeBridge,
  ThemeCatalog,
  ThemeDraft,
} from './types'

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>

function desktopInvoke(): Invoke {
  const tauri = (window as Window & {
    __TAURI__?: { core?: { invoke?: Invoke } }
  }).__TAURI__
  if (typeof tauri?.core?.invoke !== 'function') {
    throw new Error('desktop_only: 主题功能仅在 DSH Studio 桌面应用中可用')
  }
  return tauri.core.invoke
}

export function createThemeBridge(): ThemeBridge {
  return {
    catalog: async () => desktopInvoke()<ThemeCatalog>('theme_catalog'),
    load: async (themeId) => desktopInvoke()<ResolvedTheme>('theme_load', { themeId }),
    importImage: async () => desktopInvoke()<ThemeDraft | null>('theme_import_image'),
    save: async (request: SaveThemeRequest) =>
      desktopInvoke()<ResolvedTheme>('theme_save', { request }),
    activate: async (themeId) =>
      desktopInvoke()<ResolvedTheme>('theme_activate', { themeId }),
    delete: async (themeId) => desktopInvoke()<ThemeCatalog>('theme_delete', { themeId }),
    discardStage: async (stageId) =>
      desktopInvoke()<void>('theme_discard_stage', { stageId }),
  }
}
