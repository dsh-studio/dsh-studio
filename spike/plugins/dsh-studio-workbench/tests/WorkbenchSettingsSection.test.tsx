import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { WorkbenchSettingsSection } from '../src/WorkbenchSettingsSection'
import type { ComponentView, ProfileRole, WorkbenchSnapshot } from '../src/types'

function ecosystemComponent(
  id: string,
  displayName: string,
  enabled: boolean,
  profileRole: ProfileRole = 'web',
): ComponentView {
  return {
    id,
    displayName,
    description: `${displayName} description`,
    package: `example/${id}`,
    version: '1.0.0',
    source: `npm:${id}`,
    profileRole,
    license: 'MIT',
    permissions: [],
    required: false,
    enabled,
    effectiveEnabled: enabled,
    health: enabled ? 'active' : 'disabled',
  }
}

function snapshot(overrides: Partial<WorkbenchSnapshot> = {}): WorkbenchSnapshot {
  return {
    phase: 'ready',
    catalog: {
      generation: 'a'.repeat(64),
      mode: 'normal',
      rolledBack: false,
      warning: null,
      components: [
        {
          id: 'themes',
          displayName: '主题皮肤',
          description: '唯一主题引擎',
          package: 'dsh-studio-themes',
          version: '0.1.0',
          source: 'workspace:themes',
          profileRole: 'web',
          license: 'MIT',
          permissions: [],
          required: true,
          enabled: true,
          effectiveEnabled: true,
          health: 'active',
        },
        {
          id: 'skills-panel',
          displayName: '中文技能面板',
          description: '技能入口',
          package: 'dsh-studio-skills-panel',
          version: '0.1.0',
          source: 'workspace:skills',
          profileRole: 'web',
          license: 'MIT',
          permissions: ['workspace-read'],
          required: false,
          enabled: true,
          effectiveEnabled: true,
          health: 'active',
        },
      ],
    },
    pendingComponentId: null,
    pendingGlobalAction: null,
    error: null,
    ...overrides,
  }
}

function controller(current = snapshot()) {
  return {
    subscribe: vi.fn(() => () => undefined),
    getSnapshot: vi.fn(() => current),
    setEnabled: vi.fn().mockResolvedValue(undefined),
    repair: vi.fn().mockResolvedValue(undefined),
    startSafeMode: vi.fn().mockResolvedValue(undefined),
    openTui: vi.fn().mockResolvedValue('/tmp/launch.command'),
    prepareBrowser: vi.fn().mockResolvedValue('/tmp/browser/0.1.1'),
    marketCatalog: vi.fn().mockResolvedValue({
      total: 1,
      matched: 1,
      query: '',
      categories: {},
      plugins: [
        {
          name: 'dsh-browser',
          owner: 'Lum1104',
          description: { zh: '浏览器控制' },
        },
      ],
    }),
  }
}

describe('WorkbenchSettingsSection', () => {
  it('shows permissions, protects required components, and toggles optional ones', async () => {
    const user = userEvent.setup()
    const face = controller()
    render(<WorkbenchSettingsSection controller={face} />)

    expect(screen.getByRole('heading', { name: '工作台组件' })).toBeVisible()
    expect(screen.getByText('工作区读取')).toBeVisible()
    expect(screen.getByRole('switch', { name: '主题皮肤' })).toBeDisabled()
    await user.click(screen.getByRole('switch', { name: '中文技能面板' }))
    expect(face.setEnabled).toHaveBeenCalledWith('skills-panel', false)
  })

  it('shows rollback and damaged-component recovery without hiding the list', async () => {
    const user = userEvent.setup()
    const current = snapshot()
    current.catalog = {
      ...current.catalog!,
      rolledBack: true,
      warning: '新组件启动失败，已恢复上一组可用组件',
      components: current.catalog!.components.map((component) =>
        component.id === 'skills-panel'
          ? { ...component, effectiveEnabled: false, health: 'damaged' as const }
          : component,
      ),
    }
    const face = controller(current)
    render(<WorkbenchSettingsSection controller={face} />)

    expect(screen.getByRole('status')).toHaveTextContent('已恢复上一组可用组件')
    expect(screen.getByText('组件文件损坏')).toBeVisible()
    expect(screen.getByText('主题皮肤')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '修复组件' }))
    expect(face.repair).toHaveBeenCalledOnce()
  })

  it('requires explicit confirmation before safe-mode restart', async () => {
    const user = userEvent.setup()
    const face = controller()
    render(<WorkbenchSettingsSection controller={face} />)

    await user.click(screen.getByRole('button', { name: '以安全模式重启' }))
    expect(face.startSafeMode).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '确认安全模式重启' }))
    expect(face.startSafeMode).toHaveBeenCalledOnce()
  })

  it('keeps component rows visible when a desktop action fails', () => {
    const face = controller(snapshot({ error: 'desktop_only: 仅桌面可用' }))
    render(<WorkbenchSettingsSection controller={face} />)

    expect(screen.getByRole('alert')).toHaveTextContent('desktop_only')
    expect(screen.getByText('中文技能面板')).toBeVisible()
  })

  it('renders all seven ecosystem components with the selected defaults', () => {
    const current = snapshot()
    current.catalog = {
      ...current.catalog!,
      components: [
        ecosystemComponent('better-sidebar', 'Better Sidebar', true),
        ecosystemComponent('at-file', '@ 文件引用', true),
        ecosystemComponent('agent-teams', 'Agent Teams', true),
        ecosystemComponent('modlens', 'ModLens', false),
        ecosystemComponent('browser', 'DSH Browser', false),
        ecosystemComponent('tui', 'DSH TUI', false, 'tui'),
        ecosystemComponent('market', 'DSH Market（只读）', false, 'catalog'),
      ],
    }
    render(<WorkbenchSettingsSection controller={controller(current)} />)

    for (const name of ['Better Sidebar', '@ 文件引用', 'Agent Teams']) {
      expect(screen.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'true')
    }
    for (const name of ['ModLens', 'DSH Browser', 'DSH TUI', 'DSH Market（只读）']) {
      expect(screen.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'false')
    }
  })

  it('prepares Browser, opens TUI, and renders the bounded read-only Market catalog', async () => {
    const user = userEvent.setup()
    const current = snapshot()
    current.catalog = {
      ...current.catalog!,
      components: [
        ...current.catalog!.components,
        {
          ...ecosystemComponent('browser', 'DSH Browser', true),
          permissions: ['browser-control'],
        },
        {
          id: 'tui',
          displayName: 'DSH TUI',
          description: '终端界面',
          package: '@deepseek-harness-tui/dsh-tui',
          version: '0.9.3',
          source: 'npm:tui',
          profileRole: 'tui',
          license: 'MIT',
          permissions: ['terminal'],
          required: false,
          enabled: true,
          effectiveEnabled: true,
          health: 'active',
        },
        {
          id: 'market',
          displayName: 'DSH Market（只读）',
          description: '插件目录',
          package: 'dshmarket',
          version: '1.31.1',
          source: 'npm:dshmarket',
          profileRole: 'catalog',
          license: 'MIT',
          permissions: ['catalog-read'],
          required: false,
          enabled: true,
          effectiveEnabled: true,
          health: 'active',
        },
      ],
    }
    const face = controller(current)
    render(<WorkbenchSettingsSection controller={face} />)

    await user.click(screen.getByRole('button', { name: '准备 Chrome 扩展' }))
    expect(face.prepareBrowser).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '打开 TUI' }))
    expect(face.openTui).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '浏览插件目录' }))
    expect(face.marketCatalog).toHaveBeenCalledWith('', 50)
    expect(await screen.findByText('dsh-browser')).toBeVisible()
    expect(screen.getByText('目录只读')).toBeVisible()
    expect(screen.queryByRole('button', { name: /安装|更新|卸载/ })).not.toBeInTheDocument()
  })
})
