/**
 * DSH Studio 技能面板,browser half。三块:
 * 1. hero 建议卡:挂 `conversation.input.dock`(composer.dock 在 hero 被
 *    ConversationRoot 显式 `!hero` 排除),点击 setDraft 预填 `/技能名 任务`。
 * 2. hero 排序:上游 hero 栈序是 标题→工作区行→input.dock→composer;产品要求
 *    卡片在工作区行上方,注入 flex order 样式重排(选择器用类名后缀,
 *    与上游 CSS Modules 的 hash 前缀无关;类名变更时需跟进,见 spike 坑档案)。
 * 3. 技能管理分区:挂 `settings.section`(与 Models/Plugins 同级),
 *    列出内置技能与触发词,支持复制。
 */
import type { CSSProperties, ReactElement } from 'react'
import { useState } from 'react'

interface SkillMeta {
  id: string
  title: string
  hint: string
  /** 完整说明(设置分区里展示)。 */
  detail: string
  prefill: string
  /** 简单线性图标的 SVG path(24 viewBox,stroke 风格)。 */
  iconPath: string
}

const SKILLS: readonly SkillMeta[] = [
  {
    id: 'file-organizer-zh',
    title: '整理文件夹',
    hint: '先出方案再动手,绝不误删',
    detail: '扫描目标目录后先给出分类方案等确认,只移动不删除,同名自动改名,隐藏文件不动。',
    prefill: '/file-organizer-zh 帮我整理下载文件夹',
    iconPath: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z',
  },
  {
    id: 'research-report-zh',
    title: '调研报告',
    hint: '多来源交叉核验,结论带引用',
    detail: '把问题拆成可检索的小问题,多角度搜索并交叉验证,产出带来源清单的 Markdown 报告,事实与推断分开标注。',
    prefill: '/research-report-zh 帮我调研:',
    iconPath: 'M7 3.5h7L18.5 8v12a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM14 3.5V8h4.5M9.5 12h5M9.5 15.5h5',
  },
  {
    id: 'spreadsheet-zh',
    title: '处理表格',
    hint: '清洗汇总,数字验证后交付',
    detail: 'CSV/Excel 清洗、合并、汇总、透视。原文件只读、输出新文件,汇总数字抽查复算后才交付,敏感号码默认脱敏。',
    prefill: '/spreadsheet-zh 把这个表按月汇总:',
    iconPath: 'M4 5.5h16v13H4zM4 10h16M9.5 10v8.5M15 10v8.5',
  },
]

/* ── hero 建议卡 ── */

interface DockEntryProps {
  session?: { nodes?: readonly unknown[] }
  input?: { draft?: string }
  inputActions?: { setDraft(text: string): void }
}

const wrapStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  justifyContent: 'center',
  paddingBottom: '2px',
}

const cardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  padding: '9px 12px',
  borderRadius: '12px',
  border: '1px solid var(--dsw-alias-border-l1)',
  background: 'var(--dsw-alias-bg-layer-1)',
  color: 'var(--dsw-alias-label-primary)',
  cursor: 'pointer',
  textAlign: 'left' as const,
  maxWidth: '220px',
}

const cardTitleStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  lineHeight: '18px',
}

const cardHintStyle: CSSProperties = {
  fontSize: '12px',
  lineHeight: '16px',
  marginTop: '1px',
  color: 'var(--dsw-alias-label-secondary)',
  display: 'block',
}

function SkillIcon({ path, size = 16 }: { path: string; size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--dsw-alias-label-secondary)"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: 'none', marginTop: '2px' }}
      aria-hidden
    >
      <path d={path} />
    </svg>
  )
}

function SkillCards(props: DockEntryProps): ReactElement | null {
  const conversationEmpty = (props.session?.nodes?.length ?? 0) === 0
  const draftEmpty = (props.input?.draft ?? '') === ''
  const setDraft = props.inputActions?.setDraft
  if (!conversationEmpty || !draftEmpty || setDraft === undefined) return null
  return (
    <div style={wrapStyle} data-testid="dsh-studio-skills-panel">
      {SKILLS.map((skill) => (
        <button
          key={skill.id}
          type="button"
          className="dshstudio-skill-card"
          style={cardStyle}
          onClick={() => {
            setDraft(skill.prefill)
          }}
        >
          <SkillIcon path={skill.iconPath} />
          <span>
            <span style={cardTitleStyle}>{skill.title}</span>
            <span style={cardHintStyle}>{skill.hint}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

/* ── 设置页「技能」分区 ── */

interface SectionProps {
  close?: () => void
}

const sectionTitleStyle: CSSProperties = {
  fontSize: '18px',
  fontWeight: 600,
  color: 'var(--dsw-alias-label-primary)',
}

const sectionDescStyle: CSSProperties = {
  fontSize: '13px',
  marginTop: '6px',
  marginBottom: '18px',
  color: 'var(--dsw-alias-label-secondary)',
}

const skillRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  padding: '14px 16px',
  borderRadius: '12px',
  border: '1px solid var(--dsw-alias-border-l1)',
  background: 'var(--dsw-alias-bg-layer-1)',
  marginBottom: '10px',
}

const slugStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: '12px',
  padding: '2px 8px',
  borderRadius: '6px',
  background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-alias-label-secondary)',
}

const copyBtnStyle: CSSProperties = {
  flex: 'none',
  padding: '6px 12px',
  borderRadius: '9px',
  fontSize: '12.5px',
  cursor: 'pointer',
  border: '1px solid var(--dsw-alias-border-l1)',
  background: 'var(--dsw-alias-bg-layer-1)',
  color: 'var(--dsw-alias-label-primary)',
  whiteSpace: 'nowrap',
}

function SkillRow({ skill }: { skill: SkillMeta }): ReactElement {
  const [copied, setCopied] = useState(false)
  return (
    <div style={skillRowStyle}>
      <SkillIcon path={skill.iconPath} size={18} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }}>
            {skill.title}
          </span>
          <span style={slugStyle}>/{skill.id}</span>
        </div>
        <div style={{ fontSize: '12.5px', lineHeight: '18px', marginTop: '5px', color: 'var(--dsw-alias-label-secondary)' }}>
          {skill.detail}
        </div>
      </div>
      <button
        type="button"
        className="dshstudio-skill-card"
        style={copyBtnStyle}
        onClick={() => {
          void navigator.clipboard.writeText(`/${skill.id} `).then(() => {
            setCopied(true)
            window.setTimeout(() => { setCopied(false) }, 1500)
          })
        }}
      >
        {copied ? '已复制' : '复制触发词'}
      </button>
    </div>
  )
}

function SkillsSection(_props: SectionProps): ReactElement {
  return (
    <div data-testid="dsh-studio-skills-section">
      <div style={sectionTitleStyle}>技能</div>
      <div style={sectionDescStyle}>
        DSH Studio 内置的中文技能。新会话页点击建议卡即可使用;也可以在输入框输入
        <span style={{ ...slugStyle, margin: '0 4px' }}>/</span>
        唤出全部技能列表。
      </div>
      {SKILLS.map((skill) => (
        <SkillRow key={skill.id} skill={skill} />
      ))}
      <div style={{ fontSize: '12px', marginTop: '14px', color: 'var(--dsw-alias-label-secondary)' }}>
        技能文件位于数据目录 skills/ 下,新增自定义技能后重启应用即可生效。
      </div>
    </div>
  )
}

/* ── 样式注入与装配 ── */

/** hover 态与 hero 排序(内联 style 做不了伪类/兄弟重排)。 */
function injectStudioStyles(): void {
  const tagId = 'dsh-studio-skills-panel/styles'
  if (document.querySelector(`style[data-plugin-css="${tagId}"]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-studio-skills-panel'
  tag.dataset.pluginCss = tagId
  tag.textContent = [
    '.dshstudio-skill-card:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);}',
    // hero 栈重排:标题(0) → 技能卡(0,DOM 靠后) → 工作区行(1) → composer(2)。
    // 类名后缀选择器与上游 hash 前缀无关;仅作用于 hero 形态。
    '[class*="composerHero"]>[class*="heroWorkspaceRow"]{order:1;}',
    '[class*="composerHero"]>div>[class*="_hero"]{order:2;}',
    '[class*="composerHero"] [data-testid="dsh-studio-skills-panel"]{order:0;margin-bottom:2px;}',
  ].join('\n')
  document.head.appendChild(tag)
}

interface SlotRegistry {
  inject(name: string, callback: () => void): void
  register(spec: Record<string, unknown>, component: unknown): void
}

interface ClientCtx {
  slots: SlotRegistry
}

export const inject = ['slots']

export function apply(ctx: ClientCtx): void {
  injectStudioStyles()
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.dock',
        id: 'dsh-studio-skills',
        order: 5,
      },
      SkillCards,
    ),
  )
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'dsh-studio-skills',
        order: 16,
        label: () => '技能',
      },
      SkillsSection,
    ),
  )
}
