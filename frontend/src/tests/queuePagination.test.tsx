// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createAgent } from '@ui-sdk/react/agent'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { QueuePagination } from '../components/federation/QueuePagination'

declare global {
  var __UI_SDK_STRICT__: boolean | undefined
}
globalThis.__UI_SDK_STRICT__ = true

HTMLElement.prototype.showPopover = function () {}
HTMLElement.prototype.hidePopover = function () {}
Element.prototype.getAnimations = () => []
Element.prototype.scrollIntoView = function () {}
Element.prototype.checkVisibility = () => true
Element.prototype.getClientRects = () => [] as unknown as DOMRectList
document.elementFromPoint = () => null
document.elementsFromPoint = () => []
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
document.head.append(
  Object.assign(document.createElement('style'), {
    textContent: '[popover] { display: block !important }',
  }),
)

afterEach(cleanup)

const agent = createAgent()

describe('QueuePagination', () => {
  test('renders accessible ui-sdk pagination and rows select controls', () => {
    const onPageChange = vi.fn()
    const onLimitChange = vi.fn()

    render(
      <QueuePagination
        page={1}
        limit={25}
        total={14}
        totalPages={1}
        onPageChange={onPageChange}
        onLimitChange={onLimitChange}
      />,
    )

    expect(screen.getByRole('navigation', { name: 'Outbox pagination' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Previous page' }).getAttribute('aria-disabled')).toBe(
      'true',
    )
    expect(screen.getByRole('button', { name: 'Next page' }).getAttribute('aria-disabled')).toBe(
      'true',
    )
    expect(screen.getByRole('button', { name: '1' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('combobox', { name: 'Rows' })).toBeTruthy()
  })

  test('navigates pages via button press and changes row limit via ui-sdk agent', async () => {
    const onPageChange = vi.fn()
    const onLimitChange = vi.fn()

    render(
      <QueuePagination
        page={2}
        limit={25}
        total={140}
        totalPages={6}
        onPageChange={onPageChange}
        onLimitChange={onLimitChange}
      />,
    )

    const entries = agent
      .snapshot()
      .filter((entry) => !entry.offPage && entry.component !== 'more')
    for (const entry of entries) {
      expect(entry.label, `${entry.component} ${entry.ref} has no accessible name`).toBeTruthy()
    }
    const labels = entries.map((entry) => entry.label)
    expect(labels).toContain('Rows')
    expect(labels).toContain('Outbox pagination')

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPageChange).toHaveBeenCalledWith(3)

    const result = await agent.act({
      steps: [{ ref: 'Rows', action: 'setValue', args: ['50'] }],
    })
    expect(result.ok, result.error?.message).toBe(true)
    expect(onLimitChange).toHaveBeenCalledWith(50)
  })
})
