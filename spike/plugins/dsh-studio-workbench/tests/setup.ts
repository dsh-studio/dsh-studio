import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  delete (window as Window & { __TAURI__?: unknown }).__TAURI__
  document.head
    .querySelectorAll('[data-plugin="dsh-studio-workbench"]')
    .forEach((node) => node.remove())
})
