// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createAgent } from '@ui-sdk/react/agent'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { PeerFormDialog } from '../components/federation/PeerFormDialog'
import type { RemoteServer } from '../components/federation/federationTypes'

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

const samplePeer: RemoteServer = {
  id: 7,
  name: 'Singapore DR',
  endpoint: 'http://10.0.1.50:8080',
  s3_endpoint: 'http://10.0.1.50:9001',
  access_key: 'dr-ak',
  has_secret: true,
  status: 'healthy',
  latency_ms: 24,
  last_heartbeat: new Date().toISOString(),
  created_at: new Date().toISOString(),
}

describe('PeerFormDialog edit mode', () => {
  test('fetches stored secret on demand, copies it, and submits PUT without blank secret overwrite', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const authFetch = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/secret')) {
        return {
          ok: true,
          json: async () => ({ secret_key: 'super-secret-token-xyz' }),
          text: async () => 'ok',
        } as Response
      }
      return {
        ok: true,
        json: async () => ({ id: 7, success: true }),
        text: async () => 'ok',
      } as Response
    })
    const onSuccess = vi.fn()
    const onClose = vi.fn()

    render(
      <PeerFormDialog
        open
        peer={samplePeer}
        onClose={onClose}
        onSuccess={onSuccess}
        authFetch={authFetch}
        apiBase="/api"
      />,
    )

    expect(
      (screen.getByLabelText('Peer Server Identifier') as HTMLInputElement).value,
    ).toBe('Singapore DR')

    expect(screen.queryByText('super-secret-token-xyz')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show stored secret key' }))
    await waitFor(() => expect(screen.getByText('super-secret-token-xyz')).toBeTruthy())
    expect(authFetch).toHaveBeenCalledWith('/api/admin/federation/peers/7/secret')

    fireEvent.click(screen.getByRole('button', { name: 'Copy stored secret key' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('super-secret-token-xyz'))

    const entries = agent
      .snapshot()
      .filter((entry) => !entry.offPage && entry.component !== 'more')
    for (const entry of entries) {
      expect(entry.label, `${entry.component} ${entry.ref} has no accessible name`).toBeTruthy()
    }

    const actResult = await agent.act({
      steps: [
        { ref: 'Peer Server Identifier', action: 'setValue', args: ['Singapore DR Updated'] },
        { ref: 'Save Changes', action: 'press' },
      ],
    })
    expect(actResult.ok, actResult.error?.message).toBe(true)

    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(2))
    const [reqUrl, reqInit] = authFetch.mock.calls[1]
    expect(reqUrl).toBe('/api/admin/federation/peers/7')
    expect(reqInit?.method).toBe('PUT')
    expect(JSON.parse(String(reqInit?.body))).toEqual({
      name: 'Singapore DR Updated',
      endpoint: 'http://10.0.1.50:8080',
      s3_endpoint: 'http://10.0.1.50:9001',
      access_key: 'dr-ak',
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
