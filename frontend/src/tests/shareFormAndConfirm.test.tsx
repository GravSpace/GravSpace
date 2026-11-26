// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createAgent } from '@ui-sdk/react/agent'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ConfirmActionDialog } from '../components/federation/ConfirmActionDialog'
import { ShareFormDialog } from '../components/federation/ShareFormDialog'
import type { CrossServerShare, RemoteServer } from '../components/federation/federationTypes'

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

let allowConfirm = false
const agent = createAgent({
  allow: (step) => (!step.confirm ? true : allowConfirm),
})

const peers: RemoteServer[] = [
  {
    id: 3,
    name: 'SG DR',
    endpoint: 'http://10.0.0.3:8080',
    access_key: 'ak',
    has_secret: true,
    status: 'healthy',
    latency_ms: 12,
    created_at: new Date().toISOString(),
  },
]

const sampleShare: CrossServerShare = {
  id: 9,
  name: 'Media Sync',
  source_bucket: 'edge',
  source_prefix: 'media/',
  remote_server_id: 3,
  remote_server_name: 'SG DR',
  remote_endpoint: 'http://10.0.0.3:8080',
  target_bucket: 'edge-dr',
  target_prefix: 'backup/',
  sync_mode: 'two_way',
  enabled: true,
  status: 'in_sync',
  created_at: new Date().toISOString(),
}

describe('ShareFormDialog & ConfirmActionDialog', () => {
  test('edits share rule with @ui-sdk controls and submits PUT', async () => {
    const authFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 9, success: true }),
      text: async () => 'ok',
    } as Response)

    render(
      <ShareFormDialog
        open
        share={sampleShare}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        localBuckets={['edge', 'logs']}
        peers={peers}
        authFetch={authFetch}
        apiBase="/api"
      />,
    )

    expect((screen.getByLabelText('Rule Identifier Name') as HTMLInputElement).value).toBe(
      'Media Sync',
    )

    const entries = agent
      .snapshot()
      .filter((entry) => !entry.offPage && entry.component !== 'more')
    for (const entry of entries) {
      expect(entry.label, `${entry.component} ${entry.ref} has no accessible name`).toBeTruthy()
    }

    const res = await agent.act({
      steps: [
        { ref: 'Rule Identifier Name', action: 'setValue', args: ['Media Mirror Updated'] },
        { ref: 'Save Share', action: 'press' },
      ],
    })
    expect(res.ok, res.error?.message).toBe(true)

    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(1))
    expect(authFetch.mock.calls[0][0]).toBe('/api/admin/federation/shares/9')
    expect(authFetch.mock.calls[0][1]?.method).toBe('PUT')
  })

  test('gates destructive confirm behind allow callback', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    allowConfirm = false

    render(
      <ConfirmActionDialog
        open
        title='Remove peer "SG DR"?'
        description="Permanently deletes peer and share rules."
        confirmLabel="Remove peer permanently"
        confirmAgentHint="Removes the remote peer permanently"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    const confirmStep = {
      steps: [
        {
          ref: 'Remove peer "SG DR"?',
          action: 'press',
          args: ['Remove peer permanently'],
        },
      ],
    }

    const denied = await agent.act(confirmStep)
    expect(denied.ok).toBe(false)
    expect(onConfirm).not.toHaveBeenCalled()

    allowConfirm = true
    const allowed = await agent.act(confirmStep)
    expect(allowed.ok, allowed.error?.message).toBe(true)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
