const STYLE_ID = 'dsh-studio-workbench/styles'

export function installWorkbenchStyles(): () => void {
  const existing = document.querySelector<HTMLStyleElement>(
    `style[data-plugin-css="${STYLE_ID}"]`,
  )
  if (existing !== null) return () => undefined
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-studio-workbench'
  style.dataset.pluginCss = STYLE_ID
  style.textContent = `
.dshstudio-workbench{color:var(--dsw-alias-label-primary);max-width:860px}
.dshstudio-workbench__intro{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;margin:6px 0 16px}
.dshstudio-workbench__notice,.dshstudio-workbench__error{border-radius:10px;padding:10px 12px;margin:10px 0;font-size:13px;line-height:19px}
.dshstudio-workbench__notice{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 88%,#d8a43b 12%)}
.dshstudio-workbench__error{background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 84%,#d9534f 16%);color:var(--dsw-alias-label-primary)}
.dshstudio-workbench__list{display:grid;gap:10px}
.dshstudio-workbench__row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 16px;border-radius:12px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.dshstudio-workbench__name{font-size:14px;font-weight:600}
.dshstudio-workbench__description,.dshstudio-workbench__meta{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:4px}
.dshstudio-workbench__chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.dshstudio-workbench__chip{padding:2px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:11px;color:var(--dsw-alias-label-secondary)}
.dshstudio-workbench__status{font-size:12px;margin-top:6px}
.dshstudio-workbench__switch{min-width:54px;border:0;border-radius:999px;padding:6px 10px;cursor:pointer;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshstudio-workbench__switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary);color:white}
.dshstudio-workbench__switch:disabled{cursor:not-allowed;opacity:.62}
.dshstudio-workbench__actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.dshstudio-workbench__button{border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:7px 12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer}
.dshstudio-workbench__button:disabled{cursor:wait;opacity:.65}
`
  document.head.appendChild(style)
  return () => style.remove()
}
