import type { PointerEvent, ReactElement } from 'react'
import { useEffect, useState, useSyncExternalStore } from 'react'

import type { ThemeController } from './controller'
import type { ThemeEditorState, ThemeSummary } from './types'

export interface ThemeSettingsSectionProps {
  controller: ThemeController
}

export function ThemeSettingsSection({ controller }: ThemeSettingsSectionProps): ReactElement {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )

  useEffect(() => () => {
    if (controller.getSnapshot().editor !== null) void controller.cancelEditor()
  }, [controller])

  if (snapshot.editor !== null) {
    return <ThemeEditor controller={controller} editor={snapshot.editor} error={snapshot.error} />
  }

  const bundled = snapshot.catalog?.themes.filter((theme) => theme.source === 'bundled') ?? []
  const users = snapshot.catalog?.themes.filter((theme) => theme.source === 'user') ?? []
  const current = snapshot.catalog?.themes.find(
    (theme) => theme.manifest.id === snapshot.activeId,
  )

  return (
    <section className="dsh-theme-section" aria-labelledby="dsh-theme-title">
      <header className="dsh-theme-hero">
        <div>
          <span className="dsh-theme-eyebrow">DSH STUDIO · DREAM SKIN</span>
          <h2 id="dsh-theme-title">主题皮肤</h2>
          <p>直接选择 Dream Skin 精选主题，也可以把自己的图片做成桌面皮肤。</p>
        </div>
        <button
          type="button"
          className="dsh-theme-button dsh-theme-button--quiet"
          onClick={() => { void controller.restoreDefault() }}
          disabled={snapshot.phase === 'loading' || snapshot.activeId === 'system'}
        >
          还原默认
        </button>
      </header>

      {snapshot.error !== null && (
        <div className="dsh-theme-notice" role="alert">
          <span>{snapshot.error}</span>
          {snapshot.phase === 'error' && (
            <button type="button" onClick={() => { void controller.load() }}>重试</button>
          )}
        </div>
      )}

      <div className="dsh-theme-current" aria-label="当前主题">
        <div className="dsh-theme-current__swatch" style={{ background: current?.manifest.colors.accent ?? '#7b8495' }} />
        <div>
          <span>当前主题</span>
          <strong>{current?.manifest.name ?? '系统默认'}</strong>
          <small>
            {current === undefined
              ? '跟随 DSH 默认外观'
              : current.source === 'bundled'
                ? `${current.manifest.attribution?.author ?? '未知作者'} · ${current.manifest.attribution?.license ?? '来源已记录'}`
                : '我的本地主题'}
          </small>
        </div>
      </div>

      <section className="dsh-theme-group" aria-labelledby="dsh-theme-curated">
        <div className="dsh-theme-group__heading">
          <div>
            <h3 id="dsh-theme-curated">精选主题</h3>
            <p>来自 Dream Skin 的已审核离线主题</p>
          </div>
          <span>{bundled.length} 套</span>
        </div>
        {snapshot.phase === 'loading' ? (
          <div className="dsh-theme-empty" aria-live="polite">正在载入主题…</div>
        ) : (
          <div className="dsh-theme-grid">
            {bundled.map((theme) => (
              <ThemeCard
                key={theme.manifest.id}
                theme={theme}
                active={snapshot.activeId === theme.manifest.id}
                onApply={() => { void controller.activate(theme.manifest.id) }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="dsh-theme-group" aria-labelledby="dsh-theme-mine">
        <div className="dsh-theme-group__heading dsh-theme-group__heading--mine">
          <div>
            <h3 id="dsh-theme-mine">我的主题</h3>
            <p>图片只保存在这台电脑，不会上传</p>
          </div>
          <button
            type="button"
            className="dsh-theme-button dsh-theme-button--primary"
            onClick={() => { void controller.importImage() }}
          >
            <span aria-hidden="true">＋</span> 导入本地图片
          </button>
        </div>
        {users.length === 0 ? (
          <div className="dsh-theme-empty">
            <span aria-hidden="true">◇</span>
            <div><strong>还没有本地主题</strong><small>支持 PNG、JPEG、WebP、GIF，最大 20 MB</small></div>
          </div>
        ) : (
          <div className="dsh-theme-grid">
            {users.map((theme) => (
              <UserThemeCard
                key={theme.manifest.id}
                theme={theme}
                active={snapshot.activeId === theme.manifest.id}
                onApply={() => { void controller.activate(theme.manifest.id) }}
                onEdit={() => { void controller.edit(theme.manifest.id) }}
                onDelete={() => controller.deleteUserTheme(theme.manifest.id)}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

interface ThemeCardProps {
  theme: ThemeSummary
  active: boolean
  onApply: () => void
}

function ThemeCard({ theme, active, onApply }: ThemeCardProps): ReactElement {
  return (
    <article className={`dsh-theme-card${active ? ' is-active' : ''}`}>
      <button
        type="button"
        className="dsh-theme-card__apply dsh-theme-button"
        aria-label={`应用主题：${theme.manifest.name}`}
        aria-pressed={active}
        onClick={onApply}
      >
        <img src={theme.thumbnailDataUrl} alt="" />
        <span className="dsh-theme-card__shade" />
        <span className="dsh-theme-card__check" aria-hidden="true">{active ? '✓' : '↗'}</span>
      </button>
      <div className="dsh-theme-card__meta">
        <strong>{theme.manifest.name}</strong>
        <span>
          {theme.source === 'bundled'
            ? `${theme.manifest.attribution?.author ?? '未知作者'} · ${theme.manifest.attribution?.license ?? '来源已记录'}`
            : '本地图片'}
        </span>
      </div>
    </article>
  )
}

function UserThemeCard({
  theme,
  active,
  onApply,
  onEdit,
  onDelete,
}: ThemeCardProps & { onEdit: () => void; onDelete: () => Promise<void> }): ReactElement {
  const [confirming, setConfirming] = useState(false)
  return (
    <div>
      <ThemeCard theme={theme} active={active} onApply={onApply} />
      <div className="dsh-theme-card__actions">
        <button type="button" className="dsh-theme-button" onClick={onEdit}>编辑 {theme.manifest.name}</button>
        {confirming ? (
          <>
            <button
              type="button"
              className="dsh-theme-button dsh-theme-button--danger"
              onClick={() => { void onDelete() }}
            >
              确认删除 {theme.manifest.name}
            </button>
            <button type="button" className="dsh-theme-button" onClick={() => setConfirming(false)}>取消删除</button>
          </>
        ) : (
          <button
            type="button"
            className="dsh-theme-button"
            onClick={() => setConfirming(true)}
          >
            删除 {theme.manifest.name}
          </button>
        )}
      </div>
    </div>
  )
}

function ThemeEditor({
  controller,
  editor,
  error,
}: {
  controller: ThemeController
  editor: ThemeEditorState
  error: string | null
}): ReactElement {
  const valid = editor.draft.name.trim().length > 0
    && [...editor.draft.name].length <= 48
    && /^#[0-9a-fA-F]{6}$/.test(editor.draft.colors.accent)

  const moveFocus = (event: PointerEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    controller.patchDraft({
      art: {
        focusX: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
        focusY: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
      },
    })
  }

  return (
    <section className="dsh-theme-editor" aria-labelledby="dsh-theme-editor-title">
      <header className="dsh-theme-editor__header">
        <div>
          <span className="dsh-theme-eyebrow">LIVE PREVIEW</span>
          <h2 id="dsh-theme-editor-title">编辑主题</h2>
          <p>所有变化会立即预览，保存前不会覆盖原主题。</p>
        </div>
        <span className="dsh-theme-editor__status">{editor.mode === 'create' ? '新主题' : '编辑本地主题'}</span>
      </header>

      {error !== null && <div className="dsh-theme-notice" role="alert">{error}</div>}

      <div className="dsh-theme-editor__layout">
        <div className="dsh-theme-editor__preview">
          <button
            type="button"
            className="dsh-theme-focus dsh-theme-button"
            aria-label="选择图片焦点"
            onPointerDown={moveFocus}
            style={{
              backgroundImage: `linear-gradient(rgba(0,0,0,.08),rgba(0,0,0,.18)),url("${editor.backgroundDataUrl}")`,
              backgroundPosition: `${editor.draft.art.focusX * 100}% ${editor.draft.art.focusY * 100}%`,
              filter: `brightness(${editor.draft.effects.brightness})`,
            }}
          >
            <span
              className="dsh-theme-focus__marker"
              style={{ left: `${editor.draft.art.focusX * 100}%`, top: `${editor.draft.art.focusY * 100}%` }}
            />
          </button>
          <small>点击画面设置构图焦点</small>
        </div>

        <div className="dsh-theme-editor__controls">
          <label className="dsh-theme-field">
            <span>主题名称</span>
            <input
              className="dsh-theme-input"
              value={editor.draft.name}
              maxLength={48}
              aria-invalid={editor.draft.name.trim().length === 0}
              onChange={(event) => controller.patchDraft({ name: event.currentTarget.value })}
            />
          </label>

          <div className="dsh-theme-field">
            <span>强调色</span>
            <div className="dsh-theme-color-row">
              <label>
                <span className="dsh-theme-sr-only">强调色选择器</span>
                <input
                  type="color"
                  className="dsh-theme-color"
                  value={/^#[0-9a-fA-F]{6}$/.test(editor.draft.colors.accent) ? editor.draft.colors.accent : '#4f8cff'}
                  onChange={(event) => controller.patchDraft({ colors: { accent: event.currentTarget.value } })}
                />
              </label>
              <label className="dsh-theme-color-text">
                <span className="dsh-theme-sr-only">强调色十六进制值</span>
                <input
                  className="dsh-theme-input"
                  aria-label="强调色十六进制值"
                  value={editor.draft.colors.accent}
                  aria-invalid={!/^#[0-9a-fA-F]{6}$/.test(editor.draft.colors.accent)}
                  onChange={(event) => controller.patchDraft({ colors: { accent: event.currentTarget.value } })}
                />
              </label>
            </div>
          </div>

          <RangeField label="图片亮度" value={editor.draft.effects.brightness} min={0.35} max={1.2} step={0.01}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(brightness) => controller.patchDraft({ effects: { brightness } })} />
          <RangeField label="面板透明度" value={editor.draft.effects.panelOpacity} min={0.4} max={0.96} step={0.01}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(panelOpacity) => controller.patchDraft({ effects: { panelOpacity } })} />
          <RangeField label="背景模糊" value={editor.draft.effects.blur} min={0} max={32} step={1}
            format={(value) => `${value}px`}
            onChange={(blur) => controller.patchDraft({ effects: { blur } })} />
        </div>
      </div>

      <footer className="dsh-theme-editor__footer">
        <button
          type="button"
          className="dsh-theme-button dsh-theme-button--quiet"
          onClick={() => { void controller.cancelEditor() }}
          disabled={editor.saving}
        >
          取消编辑
        </button>
        <button
          type="button"
          className="dsh-theme-button dsh-theme-button--primary"
          onClick={() => { void controller.saveEditor() }}
          disabled={!valid || editor.saving}
        >
          {editor.saving ? '正在保存…' : '保存主题'}
        </button>
      </footer>
    </section>
  )
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}): ReactElement {
  return (
    <label className="dsh-theme-field dsh-theme-range">
      <span>{label}<output>{format(value)}</output></span>
      <input
        className="dsh-theme-input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  )
}
