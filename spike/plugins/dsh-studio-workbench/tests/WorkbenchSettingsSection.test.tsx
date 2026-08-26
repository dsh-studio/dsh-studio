import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { WorkbenchSettingsSection } from '../src/WorkbenchSettingsSection'
import type { WorkbenchSnapshot } from '../src/types'

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
})
