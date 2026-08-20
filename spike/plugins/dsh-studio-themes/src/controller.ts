import type {
  ResolvedTheme,
  ThemeBridge,
  ThemeCatalog,
  ThemeControllerSnapshot,
  ThemeDraftPatch,
  ThemeDraftValues,
  ThemeEditorState,
  ThemeRendererPort,
  ThemeSummary,
} from './types'

type Listener = () => void

const INITIAL_SNAPSHOT: ThemeControllerSnapshot = freezeSnapshot({
  phase: 'loading',
  catalog: null,
  activeId: 'system',
  editor: null,
  error: null,
})

export class ThemeController {
  private snapshot = INITIAL_SNAPSHOT
  private readonly listeners = new Set<Listener>()
  private operation = 0
  private disposed = false

  constructor(
    private readonly bridge: ThemeBridge,
    private readonly renderer: ThemeRendererPort,
  ) {}

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): ThemeControllerSnapshot => this.snapshot

  async load(): Promise<void> {
    const operation = this.nextOperation()
    this.publish({ ...this.snapshot, phase: 'loading', error: null })
    try {
      const catalog = await this.bridge.catalog()
      if (!this.isCurrent(operation)) return
      if (catalog.activeId === 'system') {
        this.renderer.restoreCommitted('system')
      } else {
        const active = await this.bridge.load(catalog.activeId)
        if (!this.isCurrent(operation)) return
        this.renderer.applyCommitted(active)
      }
      this.publish({
        phase: 'ready',
        catalog,
        activeId: catalog.activeId,
        editor: null,
        error: catalog.warning,
      })
    } catch (error) {
      if (!this.isCurrent(operation)) return
      this.publish({ ...this.snapshot, phase: 'error', error: messageOf(error) })
    }
  }

  async activate(themeId: string): Promise<void> {
    if (themeId === this.snapshot.activeId) return
    const operation = this.nextOperation()
    try {
      const resolved = await this.bridge.activate(themeId)
      if (!this.isCurrent(operation)) return
      if (themeId === 'system') {
        this.renderer.restoreCommitted('system')
      } else {
        this.renderer.applyCommitted(resolved)
      }
      this.publish({
        ...this.snapshot,
        activeId: themeId,
        catalog: withActive(this.snapshot.catalog, themeId),
        error: null,
      })
    } catch (error) {
      if (!this.isCurrent(operation)) return
      this.publish({ ...this.snapshot, error: messageOf(error) })
    }
  }

  async restoreDefault(): Promise<void> {
    await this.activate('system')
  }

  async importImage(): Promise<void> {
    const operation = this.nextOperation()
    try {
      const imported = await this.bridge.importImage()
      if (!this.isCurrent(operation)) {
        if (imported !== null) void this.bridge.discardStage(imported.stageId)
        return
      }
      if (imported === null) return
      const editor: ThemeEditorState = {
        mode: 'create',
        themeId: null,
        rollbackId: this.snapshot.activeId,
        stageId: imported.stageId,
        draft: cloneValues(imported.values),
        backgroundDataUrl: imported.backgroundDataUrl,
        thumbnailDataUrl: imported.thumbnailDataUrl,
        saving: false,
      }
      this.renderer.preview(editor.draft, editor.backgroundDataUrl)
      this.publish({ ...this.snapshot, editor, error: null })
    } catch (error) {
      if (!this.isCurrent(operation)) return
      this.publish({ ...this.snapshot, error: messageOf(error) })
    }
  }

  async edit(themeId: string): Promise<void> {
    if (!themeId.startsWith('user-')) {
      this.publish({ ...this.snapshot, error: '只有本地主题可以编辑' })
      return
    }
    const operation = this.nextOperation()
    try {
      const resolved = await this.bridge.load(themeId)
      if (!this.isCurrent(operation)) return
      const summary = this.snapshot.catalog?.themes.find(
        (candidate) => candidate.manifest.id === themeId,
      )
      const editor: ThemeEditorState = {
        mode: 'edit',
        themeId,
        rollbackId: this.snapshot.activeId,
        stageId: null,
        draft: valuesFromResolved(resolved),
        backgroundDataUrl: resolved.backgroundDataUrl,
        thumbnailDataUrl: summary?.thumbnailDataUrl ?? resolved.backgroundDataUrl,
        saving: false,
      }
      this.renderer.preview(editor.draft, editor.backgroundDataUrl)
      this.publish({ ...this.snapshot, editor, error: null })
    } catch (error) {
      if (!this.isCurrent(operation)) return
      this.publish({ ...this.snapshot, error: messageOf(error) })
    }
  }

  patchDraft(patch: ThemeDraftPatch): void {
    const editor = this.snapshot.editor
    if (editor === null || editor.saving) return
    const draft: ThemeDraftValues = {
      ...editor.draft,
      ...patch.name === undefined ? {} : { name: patch.name },
      ...patch.appearance === undefined ? {} : { appearance: patch.appearance },
      colors: { ...editor.draft.colors, ...patch.colors },
      art: { ...editor.draft.art, ...patch.art },
      effects: { ...editor.draft.effects, ...patch.effects },
    }
    const nextEditor = { ...editor, draft }
    this.renderer.preview(draft, editor.backgroundDataUrl)
    this.publish({ ...this.snapshot, editor: nextEditor, error: null })
  }

  async cancelEditor(): Promise<void> {
    const editor = this.snapshot.editor
    if (editor === null) return
    this.nextOperation()
    this.renderer.restoreCommitted(editor.rollbackId)
    this.publish({ ...this.snapshot, editor: null, error: null })
    if (editor.stageId !== null) {
      try {
        await this.bridge.discardStage(editor.stageId)
      } catch (error) {
        if (this.disposed) return
        this.publish({ ...this.snapshot, error: messageOf(error) })
      }
    }
  }

  async saveEditor(): Promise<void> {
    const editor = this.snapshot.editor
    if (editor === null || editor.saving) return
    const operation = this.nextOperation()
    this.publish({ ...this.snapshot, editor: { ...editor, saving: true }, error: null })
    try {
      const resolved = await this.bridge.save({
        themeId: editor.themeId,
        stageId: editor.stageId,
        values: cloneValues(editor.draft),
      })
      if (!this.isCurrent(operation)) return
      this.renderer.applyCommitted(resolved)
      const summary: ThemeSummary = {
        manifest: resolved.manifest,
        source: resolved.source,
        thumbnailDataUrl: editor.thumbnailDataUrl,
      }
      this.publish({
        phase: 'ready',
        catalog: upsertSummary(this.snapshot.catalog, summary),
        activeId: resolved.manifest.id,
        editor: null,
        error: null,
      })
    } catch (error) {
      if (!this.isCurrent(operation)) return
      this.publish({
        ...this.snapshot,
        editor: { ...editor, saving: false },
        error: messageOf(error),
      })
    }
  }

  async deleteUserTheme(themeId: string): Promise<void> {
    const operation = this.nextOperation()
    try {
      const catalog = await this.bridge.delete(themeId)
      if (!this.isCurrent(operation)) return
      if (catalog.activeId !== this.snapshot.activeId) {
        this.renderer.restoreCommitted(catalog.activeId)
      }
      this.publish({
        ...this.snapshot,
        catalog,
        activeId: catalog.activeId,
        editor: this.snapshot.editor?.themeId === themeId ? null : this.snapshot.editor,
        error: catalog.warning,
      })
    } catch (error) {
      if (!this.isCurrent(operation)) return
      this.publish({ ...this.snapshot, error: messageOf(error) })
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.operation += 1
    const stageId = this.snapshot.editor?.stageId
    if (stageId !== null && stageId !== undefined) void this.bridge.discardStage(stageId)
    this.listeners.clear()
  }

  private nextOperation(): number {
    this.operation += 1
    return this.operation
  }

  private isCurrent(operation: number): boolean {
    return !this.disposed && operation === this.operation
  }

  private publish(snapshot: ThemeControllerSnapshot): void {
    if (this.disposed) return
    this.snapshot = freezeSnapshot(snapshot)
    for (const listener of this.listeners) listener()
  }
}

function valuesFromResolved(theme: ResolvedTheme): ThemeDraftValues {
  return cloneValues({
    name: theme.manifest.name,
    appearance: theme.manifest.appearance,
    colors: theme.manifest.colors,
    art: theme.manifest.art,
    effects: theme.manifest.effects,
  })
}

function cloneValues(values: ThemeDraftValues): ThemeDraftValues {
  return {
    ...values,
    colors: { ...values.colors },
    art: { ...values.art },
    effects: { ...values.effects },
  }
}

function freezeSnapshot(snapshot: ThemeControllerSnapshot): ThemeControllerSnapshot {
  if (snapshot.editor !== null) {
    Object.freeze(snapshot.editor.draft.colors)
    Object.freeze(snapshot.editor.draft.art)
    Object.freeze(snapshot.editor.draft.effects)
    Object.freeze(snapshot.editor.draft)
    Object.freeze(snapshot.editor)
  }
  if (snapshot.catalog !== null) {
    Object.freeze(snapshot.catalog.themes)
    Object.freeze(snapshot.catalog)
  }
  return Object.freeze(snapshot)
}

function withActive(catalog: ThemeCatalog | null, activeId: string): ThemeCatalog | null {
  return catalog === null ? null : { ...catalog, activeId }
}

function upsertSummary(catalog: ThemeCatalog | null, summary: ThemeSummary): ThemeCatalog {
  const themes = catalog?.themes.filter(
    (candidate) => candidate.manifest.id !== summary.manifest.id,
  ) ?? []
  return {
    activeId: summary.manifest.id,
    warning: null,
    themes: [...themes, summary],
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
