import { CONVERSATION_SCRIM_OPACITY, HOME_SCRIM_OPACITY } from './visuals'

const STYLE_ID = 'dsh-studio-themes/styles'

export function installThemeStyles(): () => void {
  const existing = document.querySelector<HTMLStyleElement>(
    `style[data-plugin-css="${STYLE_ID}"]`,
  )
  if (existing !== null) return () => undefined

  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-studio-themes'
  style.dataset.pluginCss = STYLE_ID
  style.textContent = `
[data-dsh-studio-wallpaper]{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:0;background:#111318}
[data-dsh-studio-wallpaper-image]{position:absolute;inset:-40px;background-position:center;background-repeat:no-repeat;background-size:cover;transform:scale(1.035);will-change:filter,background-position;transition:filter .18s ease,background-position .18s ease}
[data-dsh-studio-wallpaper-scrim]{position:absolute;inset:0;background:rgba(8,10,14,${HOME_SCRIM_OPACITY});transition:background .18s ease}
body[data-dsh-studio-surface="conversation"] [data-dsh-studio-wallpaper-scrim]{background:rgba(8,10,14,${CONVERSATION_SCRIM_OPACITY})}
body>[id="root"]{position:relative;z-index:1;background:transparent!important}
body[data-dsh-studio-theme-active="true"] [class$="_centerCol"]{background:radial-gradient(ellipse at 54% 52%,var(--dsh-studio-readable-wash) 0%,transparent 72%)}
body[data-dsh-studio-theme-active="true"] [class$="_sidebarCol"]{border-right-color:transparent!important}
body[data-dsh-studio-theme-active="true"] [class$="_card"]{border-color:transparent!important}
.dsh-theme-button:focus-visible,.dsh-theme-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-theme-section,.dsh-theme-editor{color:var(--dsw-alias-label-primary);padding:26px 0 28px}
.dsh-theme-section *,.dsh-theme-editor *{box-sizing:border-box}
.dsh-theme-hero,.dsh-theme-editor__header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:22px}
.dsh-theme-hero h2,.dsh-theme-editor h2{font-size:24px;line-height:1.2;letter-spacing:-.02em;margin:5px 0 7px}
.dsh-theme-hero p,.dsh-theme-editor p,.dsh-theme-group__heading p{margin:0;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.55}
.dsh-theme-eyebrow{font-size:9px;letter-spacing:.16em;font-weight:700;color:var(--dsw-alias-brand-primary)}
.dsh-theme-button{font:inherit;color:inherit;cursor:pointer;border:0;background:var(--dsw-alias-bg-layer-1);border-radius:10px;transition:background .16s ease,transform .16s ease,box-shadow .16s ease}
.dsh-theme-button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);box-shadow:0 6px 18px rgba(0,0,0,.08)}
.dsh-theme-button:active:not(:disabled){transform:translateY(1px)}
.dsh-theme-button:disabled{cursor:not-allowed;opacity:.5}
.dsh-theme-button--quiet{padding:8px 13px;font-size:12px;white-space:nowrap}
.dsh-theme-button--primary{padding:9px 14px;color:#fff;background:var(--dsw-alias-brand-primary);font-weight:600;font-size:12px}
.dsh-theme-button--primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);filter:brightness(1.08)}
.dsh-theme-button--danger{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dsh-theme-notice{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;margin:0 0 16px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,var(--dsw-alias-bg-layer-1));font-size:12px}
.dsh-theme-notice button{border:0;background:none;color:var(--dsw-alias-brand-primary);cursor:pointer;font-weight:600}
.dsh-theme-current{display:flex;align-items:center;gap:12px;padding:13px 15px;border:0;border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 10px 30px rgba(0,0,0,.06);margin-bottom:26px}
.dsh-theme-current__swatch{width:34px;height:34px;border-radius:10px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.28)}
.dsh-theme-current>div:last-child{display:grid;grid-template-columns:auto 1fr;gap:1px 10px;align-items:baseline}
.dsh-theme-current span{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.dsh-theme-current strong{font-size:13px}.dsh-theme-current small{grid-column:1/-1;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsh-theme-group{margin-top:24px}.dsh-theme-group__heading{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:12px}
.dsh-theme-group__heading h3{font-size:14px;margin:0 0 3px}.dsh-theme-group__heading>span{font-size:10px;color:var(--dsw-alias-label-secondary)}
.dsh-theme-group__heading--mine{align-items:center}
.dsh-theme-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.dsh-theme-card{position:relative;overflow:hidden;border-radius:14px;border:0;background:var(--dsw-alias-bg-layer-1);transition:transform .18s ease,box-shadow .18s ease}
.dsh-theme-card:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(0,0,0,.12)}
.dsh-theme-card.is-active{box-shadow:0 14px 32px rgba(0,0,0,.14)}
.dsh-theme-card__apply{position:relative;display:block;width:100%;height:112px;overflow:hidden;padding:0;border:0;border-radius:0;background:#20242c}
.dsh-theme-card__apply img{width:100%;height:100%;display:block;object-fit:cover;transition:transform .3s ease}.dsh-theme-card:hover img{transform:scale(1.035)}
.dsh-theme-card__shade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 52%,rgba(0,0,0,.32))}
.dsh-theme-card__check{position:absolute;right:9px;top:9px;width:23px;height:23px;display:grid;place-items:center;border-radius:50%;font-size:11px;color:#fff;background:rgba(12,15,20,.62);backdrop-filter:blur(8px)}
.dsh-theme-card.is-active .dsh-theme-card__check{background:var(--dsw-alias-brand-primary)}
.dsh-theme-card__meta{display:flex;flex-direction:column;gap:3px;padding:10px 11px 11px}.dsh-theme-card__meta strong{font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dsh-theme-card__meta span{font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-theme-card__actions{display:flex;gap:6px;flex-wrap:wrap;padding-top:6px}.dsh-theme-card__actions button{padding:5px 8px;font-size:10.5px}
.dsh-theme-empty{min-height:72px;display:flex;align-items:center;justify-content:center;gap:10px;border:0;background:var(--dsw-alias-bg-layer-1);border-radius:14px;color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-theme-empty>span{font-size:22px}.dsh-theme-empty div{display:flex;flex-direction:column;gap:2px}.dsh-theme-empty strong{font-size:12px;color:var(--dsw-alias-label-primary)}.dsh-theme-empty small{font-size:10.5px}
.dsh-theme-editor__status{padding:5px 9px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10px}
.dsh-theme-editor__layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(220px,.85fr);gap:20px}
.dsh-theme-editor__preview small{display:block;margin-top:7px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:10.5px}
.dsh-theme-focus{position:relative;width:100%;aspect-ratio:16/10;border:0;border-radius:16px;background-size:cover;background-repeat:no-repeat;overflow:hidden;box-shadow:0 14px 32px rgba(0,0,0,.14)}
.dsh-theme-focus__marker{position:absolute;width:22px;height:22px;border:2px solid #fff;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 1px 8px rgba(0,0,0,.55)}.dsh-theme-focus__marker:after{content:"";position:absolute;width:4px;height:4px;border-radius:50%;background:#fff;left:7px;top:7px}
.dsh-theme-editor__controls{display:flex;flex-direction:column;gap:13px}.dsh-theme-field{display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:600}.dsh-theme-field>span{display:flex;justify-content:space-between}.dsh-theme-field output{font-weight:400;color:var(--dsw-alias-label-secondary)}
.dsh-theme-input:not([type="range"]){width:100%;border:0;border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:8px 10px;font:inherit;font-weight:400}.dsh-theme-input[aria-invalid="true"]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,var(--dsw-alias-bg-layer-1))}
.dsh-theme-color-row{display:flex;gap:8px}.dsh-theme-color{width:38px;height:34px;padding:3px;border:0;border-radius:9px;background:var(--dsw-alias-bg-layer-1)}.dsh-theme-color-text{flex:1}
.dsh-theme-range input{width:100%;accent-color:var(--dsw-alias-brand-primary)}
.dsh-theme-editor__footer{display:flex;justify-content:flex-end;gap:9px;margin-top:22px;padding-top:16px}
.dsh-theme-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:760px){.dsh-theme-grid{grid-template-columns:1fr 1fr}.dsh-theme-editor__layout{grid-template-columns:1fr}.dsh-theme-hero{align-items:center}}
@media (prefers-reduced-motion:reduce){[data-dsh-studio-wallpaper-image],[data-dsh-studio-wallpaper-scrim]{transition:none}}
`
  document.head.appendChild(style)
  return () => style.remove()
}
