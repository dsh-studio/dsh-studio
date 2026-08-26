import type { ReactElement } from 'react'
import { useState, useSyncExternalStore } from 'react'

import type { WorkbenchController } from './controller'
import type { ComponentHealth, WorkbenchSnapshot } from './types'

interface ControllerFace {
  subscribe(listener: () => void): () => void
  getSnapshot(): WorkbenchSnapshot
  setEnabled(componentId: string, enabled: boolean): Promise<void>
  repair(): Promise<void>
  startSafeMode(): Promise<void>
}

const PERMISSION_LABELS: Record<string, string> = {
  'workspace-read': '工作区读取',
  'workspace-write': '工作区写入',
  terminal: '终端执行',
  browser: '浏览器控制',
  network: '网络访问',
  model: '模型调用',
}

const HEALTH_LABELS: Record<ComponentHealth, string> = {
  active: '运行中',
  disabled: '已关闭',
  safeModeDisabled: '安全模式下已停用',
  damaged: '组件文件损坏',
  restarting: '等待重启',
}

export function WorkbenchSettingsSection({
  controller,
}: {
  controller: ControllerFace | WorkbenchController
}): ReactElement {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )
  const [confirmSafeMode, setConfirmSafeMode] = useState(false)
  const busy =
    snapshot.pendingComponentId !== null || snapshot.pendingGlobalAction !== null
  const catalog = snapshot.catalog

  return (
    <section className="dshstudio-workbench" aria-busy={busy}>
      <h2 style={{ margin: 0, fontSize: '18px' }}>工作台组件</h2>
      <p className="dshstudio-workbench__intro">
        DSH Studio 在本机离线加载经过锁定的组件。关闭或修复组件时，只调整 Studio
        管理的 Profile 条目，不会覆盖会话和用户自行安装的插件。
      </p>

      {catalog?.warning !== null && catalog?.warning !== undefined ? (
        <div className="dshstudio-workbench__notice" role="status">
          {catalog.warning}
        </div>
      ) : catalog?.rolledBack ? (
        <div className="dshstudio-workbench__notice" role="status">
          已恢复上一组可用组件
        </div>
      ) : null}
      {catalog?.mode === 'safe' ? (
        <div className="dshstudio-workbench__notice" role="status">
          当前处于安全模式，第三方和可选组件已停用。
        </div>
      ) : null}
      {snapshot.error !== null ? (
        <div className="dshstudio-workbench__error" role="alert">
          {snapshot.error}
        </div>
      ) : null}

      {catalog === null ? (
        <div role="status">正在读取组件状态…</div>
      ) : (
        <div className="dshstudio-workbench__list">
          {catalog.components.map((component) => {
            const pending = snapshot.pendingComponentId === component.id
            return (
              <article className="dshstudio-workbench__row" key={component.id}>
                <div>
                  <div className="dshstudio-workbench__name">{component.displayName}</div>
                  <div className="dshstudio-workbench__description">
                    {component.description}
                  </div>
                  <div className="dshstudio-workbench__meta">
                    {component.package} · {component.version} · {component.license}
                  </div>
                  {component.permissions.length > 0 ? (
                    <div className="dshstudio-workbench__chips" aria-label="组件权限">
                      {component.permissions.map((permission) => (
                        <span className="dshstudio-workbench__chip" key={permission}>
                          {PERMISSION_LABELS[permission] ?? permission}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="dshstudio-workbench__status">
                    {HEALTH_LABELS[component.health]}
                    {component.required ? ' · 核心组件' : ''}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label={component.displayName}
                  aria-checked={component.enabled}
                  className="dshstudio-workbench__switch"
                  disabled={component.required || busy || component.health === 'damaged'}
                  onClick={() => {
                    void controller.setEnabled(component.id, !component.enabled)
                  }}
                >
                  {pending ? '切换中' : component.enabled ? '开启' : '关闭'}
                </button>
              </article>
            )
          })}
        </div>
      )}

      <div className="dshstudio-workbench__actions">
        <button
          type="button"
          className="dshstudio-workbench__button"
          disabled={busy}
          onClick={() => void controller.repair()}
        >
          {snapshot.pendingGlobalAction === 'repair' ? '正在修复…' : '修复组件'}
        </button>
        {!confirmSafeMode ? (
          <button
            type="button"
            className="dshstudio-workbench__button"
            disabled={busy}
            onClick={() => setConfirmSafeMode(true)}
          >
            以安全模式重启
          </button>
        ) : (
          <>
            <button
              type="button"
              className="dshstudio-workbench__button"
              disabled={busy}
              onClick={() => {
                setConfirmSafeMode(false)
                void controller.startSafeMode()
              }}
            >
              确认安全模式重启
            </button>
            <button
              type="button"
              className="dshstudio-workbench__button"
              disabled={busy}
              onClick={() => setConfirmSafeMode(false)}
            >
              取消
            </button>
          </>
        )}
      </div>
      {busy ? <div role="status">正在重启本地 DSH…</div> : null}
    </section>
  )
}
