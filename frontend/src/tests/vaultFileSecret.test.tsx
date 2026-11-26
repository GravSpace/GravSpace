// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useState } from 'react'
import { VaultFilterBar } from '../components/vault/VaultFilterBar'
import { SecretFileField } from '../components/vault/SecretFileField'
import { SecretFileOverview } from '../components/vault/SecretFileOverview'
import { SecretsTable } from '../components/vault/SecretsTable'
import {
  detectSecretFileExt,
  downloadSecretFile,
  formatSecretFileSize,
} from '../components/vault/vaultDownload'
import type { VaultSecret } from '../components/vault/vaultTypes'

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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function FileFieldHarness({ initialFile = 'config.json', initialValue = '{"b":1}' }) {
  const [fileName, setFileName] = useState(initialFile)
  const [value, setValue] = useState(initialValue)
  const [encoding, setEncoding] = useState<'utf8' | 'base64'>('utf8')
  return (
    <div>
      <span data-testid="harness-name">{fileName}</span>
      <SecretFileField
        fileName={fileName}
        value={value}
        encoding={encoding}
        onChange={({ value: nextVal, encoding: nextEnc, fileName: nextName }) => {
          setValue(nextVal)
          setEncoding(nextEnc)
          if (nextName) setFileName(nextName)
        }}
      />
    </div>
  )
}

describe('Vault Secret Files UI & Helpers', () => {
  test('VaultFilterBar switches to Secret File tab and updates search query', () => {
    const onSearchChange = vi.fn()
    const onSelectType = vi.fn()
    render(
      <VaultFilterBar
        searchQuery=""
        onSearchChange={onSearchChange}
        selectedType="all"
        onSelectType={onSelectType}
      />,
    )

    const fileTab = screen.getByRole('tab', { name: 'Secret File' })
    fireEvent.click(fileTab)
    expect(onSelectType).toHaveBeenCalledWith('file')

    const searchInput = screen.getByLabelText('Search secrets')
    fireEvent.change(searchInput, { target: { value: '.json' } })
    expect(onSearchChange).toHaveBeenCalledWith('.json')
  })

  test('SecretFileField validates JSON, formats JSON, and supports .md template', () => {
    render(<FileFieldHarness initialFile="service.json" initialValue='{"k":"v"}' />)

    expect(screen.getByText('Valid JSON syntax')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Format JSON/i }))

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('{\n  "k": "v"\n}\n')

    fireEvent.change(textarea, { target: { value: '{broken' } })
    expect(screen.getByText(/JSON note:/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '.md' }))
    expect(textarea.value).toContain('# Security Recovery Notes')
  })

  test('SecretFileOverview shows file stats, SHA-256 pill, and Pretty/Raw JSON toggle', () => {
    const secret: VaultSecret = {
      id: 'sec-file-1',
      project_id: 'default',
      name: 'google-sa.json',
      environment: 'production',
      secret_type: 'file',
      tags: ['gcp'],
      has_value: true,
      current_version: 2,
      metadata: {
        file_name: 'google-sa.json',
        file_ext: 'json',
        file_category: 'structured',
        encoding: 'utf8',
        size_bytes: 18,
        line_count: 1,
        json_valid: true,
        sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      },
      requires_approval: false,
      created_at: '2026-11-26T00:00:00Z',
      updated_at: '2026-11-26T00:00:00Z',
    }

    render(
      <SecretFileOverview
        secret={secret}
        revealedValue='{"env":"prod"}'
        revealing={false}
        onReveal={vi.fn()}
      />,
    )

    expect(screen.getByText('.json')).toBeTruthy()
    expect(screen.getByText('Valid JSON')).toBeTruthy()
    expect(screen.getByText(/sha256:abcdef123456/i)).toBeTruthy()
    expect(screen.getByText(/"env": "prod"/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Raw/i }))
    expect(screen.getByText('{"env":"prod"}')).toBeTruthy()
  })

  test('vaultDownload helpers format sizes, detect extensions, and export UTF-8 vs Base64', async () => {
    expect(detectSecretFileExt('NOTES.MD')).toBe('md')
    expect(detectSecretFileExt('id_ed25519')).toBe('key')
    expect(formatSecretFileSize(2048)).toBe('2.0 KB')

    const capturedBlobs: Blob[] = []
    const createObjectURL = vi.fn((blob: Blob) => {
      capturedBlobs.push(blob)
      return 'blob:mock-url'
    })
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const utf8Secret: VaultSecret = {
      id: '1',
      project_id: 'default',
      name: 'RECOVERY.md',
      environment: 'production',
      secret_type: 'file',
      tags: [],
      has_value: true,
      current_version: 1,
      metadata: { encoding: 'utf8', file_name: 'RECOVERY.md' },
      requires_approval: false,
      created_at: '2026-11-26T00:00:00Z',
      updated_at: '2026-11-26T00:00:00Z',
    }
    downloadSecretFile(utf8Secret, '# Title\nsecret')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(await capturedBlobs[0].text()).toBe('# Title\nsecret')

    const b64Secret: VaultSecret = {
      ...utf8Secret,
      id: '2',
      name: 'cert.der',
      metadata: { encoding: 'base64', file_name: 'cert.der' },
    }
    downloadSecretFile(b64Secret, btoa('BIN'))
    const buf = new Uint8Array(await capturedBlobs[1].arrayBuffer())
    expect(Array.from(buf)).toEqual([66, 73, 78])
  })

  test('SecretsTable renders compact single-line type badge and accessible actions for long filenames', () => {
    const longName = 'client_secret_278250689440-04tem6fn4tg7jc7g72pmn5aroknfa3r2.apps.googleusercontent.com.json'
    const secret: VaultSecret = {
      id: 'sec-long-1',
      project_id: 'default',
      name: longName,
      environment: 'development',
      secret_type: 'file',
      tags: ['google service'],
      has_value: true,
      current_version: 1,
      metadata: { file_ext: 'json', size_bytes: 308 },
      requires_approval: false,
      created_at: '2026-11-26T00:00:00Z',
      updated_at: '2026-11-26T00:00:00Z',
    }
    const onToggleReveal = vi.fn()
    render(
      <SecretsTable
        secrets={[secret]}
        revealedMap={{}}
        revealingId={null}
        currentEnv="development"
        envLabel="Development"
        onToggleReveal={onToggleReveal}
        onCopy={vi.fn()}
        onDownload={vi.fn()}
        onSelectDetail={vi.fn()}
        onDelete={vi.fn()}
        onOpenCreate={vi.fn()}
        onOpenImport={vi.fn()}
      />,
    )

    expect(screen.getByText('Secret File')).toBeTruthy()
    expect(screen.getByText('.json · 308 B')).toBeTruthy()
    expect(screen.getByText('#google service')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: `Reveal ${longName}` }))
    expect(onToggleReveal).toHaveBeenCalledWith(secret)
  })
})
