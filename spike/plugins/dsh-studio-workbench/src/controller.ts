import type {
  MarketCatalogPage,
  WorkbenchBridge,
  WorkbenchCatalog,
  WorkbenchSnapshot,
} from './types'

type Listener = () => void

const INITIAL_SNAPSHOT: WorkbenchSnapshot = Object.freeze({
  phase: 'loading',
  catalog: null,
  pendingComponentId: null,
  pendingGlobalAction: null,
  error: null,
})

export class WorkbenchController {
  private snapshot = INITIAL_SNAPSHOT
  private readonly listeners = new Set<Listener>()
  private operation = 0
  private disposed = false

  constructor(private readonly bridge: WorkbenchBridge) {}

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): WorkbenchSnapshot => this.snapshot

  async load(): Promise<void> {
    const operation = this.nextOperation()
    this.publish({ ...this.snapshot, phase: 'loading', error: null })
    try {
      const catalog = await this.bridge.catalog()
      if (!this.isCurrent(operation)) return
      this.publish({
        phase: 'ready',
        catalog,
        pendingComponentId: null,
        pendingGlobalAction: null,
        error: null,
      })
    } catch (error) {
      if (!this.isCurrent(operation)) return
      this.publish({ ...this.snapshot, phase: 'error', error: messageOf(error) })
    }
  }

  async setEnabled(componentId: string, enabled: boolean): Promise<void> {
    if (this.busy()) return
    const operation = this.nextOperation()
    this.publish({
      ...this.snapshot,
      pendingComponentId: componentId,
      error: null,
    })
    try {
      const catalog = await this.bridge.setEnabled(componentId, enabled)
      this.finish(operation, catalog)
    } catch (error) {
      this.fail(operation, error)
    }
  }

  async repair(): Promise<void> {
    await this.runGlobal('repair', () => this.bridge.repair())
  }

  async startSafeMode(): Promise<void> {
    await this.runGlobal('safeMode', () => this.bridge.startSafeMode())
  }

  async openTui(): Promise<string> {
    return this.bridge.openTui()
  }

  async prepareBrowser(): Promise<string> {
    return this.bridge.prepareBrowser()
  }

  async marketCatalog(query: string, limit = 50): Promise<MarketCatalogPage> {
    return this.bridge.marketCatalog(query, limit)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.operation += 1
    this.listeners.clear()
  }

  private async runGlobal(
    action: 'repair' | 'safeMode',
    run: () => Promise<WorkbenchCatalog>,
  ): Promise<void> {
    if (this.busy()) return
    const operation = this.nextOperation()
    this.publish({
      ...this.snapshot,
      pendingGlobalAction: action,
      error: null,
    })
    try {
      this.finish(operation, await run())
    } catch (error) {
      this.fail(operation, error)
    }
  }

  private busy(): boolean {
    return (
      this.disposed ||
      this.snapshot.pendingComponentId !== null ||
      this.snapshot.pendingGlobalAction !== null
    )
  }

  private finish(operation: number, catalog: WorkbenchCatalog): void {
    if (!this.isCurrent(operation)) return
    this.publish({
      phase: 'ready',
      catalog,
      pendingComponentId: null,
      pendingGlobalAction: null,
      error: null,
    })
  }

  private fail(operation: number, error: unknown): void {
    if (!this.isCurrent(operation)) return
    this.publish({
      ...this.snapshot,
      phase: this.snapshot.catalog === null ? 'error' : 'ready',
      pendingComponentId: null,
      pendingGlobalAction: null,
      error: messageOf(error),
    })
  }

  private nextOperation(): number {
    this.operation += 1
    return this.operation
  }

  private isCurrent(operation: number): boolean {
    return !this.disposed && operation === this.operation
  }

  private publish(snapshot: WorkbenchSnapshot): void {
    if (this.disposed) return
    this.snapshot = Object.freeze(snapshot)
    for (const listener of this.listeners) listener()
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
