// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SidebarProvider, useSidebar } from '../components/ui/sidebar'
import { MobileTopBar } from '../components/MobileTopBar'
import { VaultHeader } from '../components/vault/VaultHeader'
import { BucketHeader } from '../components/bucket/BucketHeader'

vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: '/admin/vault' } }),
}))

vi.mock('../hooks/useTransfers', () => ({
  useTransfers: () => ({
    activeTransfersCount: 2,
    showTransferManager: false,
    setShowTransferManager: vi.fn(),
  }),
}))

function installMobileViewportMock() {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 })
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function SidebarStateSpy() {
  const { isMobile, openMobile } = useSidebar()
  return <div data-testid="sidebar-state" data-mobile={String(isMobile)} data-open-mobile={String(openMobile)} />
}

beforeEach(() => {
  installMobileViewportMock()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Mobile responsive layout & navigation controls', () => {
  test('MobileTopBar displays active route, toggles mobile sidebar sheet, and dispatches global search event', () => {
    const searchListener = vi.fn()
    window.addEventListener('gravspace:open-search', searchListener)

    render(
      <SidebarProvider>
        <MobileTopBar />
        <SidebarStateSpy />
      </SidebarProvider>,
    )

    expect(screen.getByText('Vault & Secrets')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()

    const stateEl = screen.getByTestId('sidebar-state')
    expect(stateEl.getAttribute('data-mobile')).toBe('true')
    expect(stateEl.getAttribute('data-open-mobile')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    expect(stateEl.getAttribute('data-open-mobile')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Search objects' }))
    expect(searchListener).toHaveBeenCalledTimes(1)

    window.removeEventListener('gravspace:open-search', searchListener)
  })

  test('VaultHeader and BucketHeader expose accessible action buttons on mobile viewports', () => {
    const onTabChange = vi.fn()
    render(
      <>
        <VaultHeader
          activeTab="secrets"
          onTabChange={onTabChange}
          totalSecrets={12}
          pamGuardedCount={3}
          pendingRequestsCount={1}
          onOpenCreate={vi.fn()}
          onOpenImport={vi.fn()}
          onOpenExport={vi.fn()}
          onRefresh={vi.fn()}
        />
        <BucketHeader
          bucketName="assets-prod"
          currentPrefix="mobile/icons/"
          prefixParts={['mobile', 'icons']}
          bucketInfo={null}
          searchQuery=""
          onSearchChange={vi.fn()}
          onNavigate={vi.fn()}
          onBack={vi.fn()}
          onNewFolder={vi.fn()}
          onUploadFilesClick={vi.fn()}
          onUploadFolderClick={vi.fn()}
          onSync={vi.fn()}
          onOpenSettings={vi.fn()}
          loading={false}
          syncing={false}
          activeTransfersCount={0}
        />
      </>,
    )

    expect(screen.getByRole('button', { name: /New Secret/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to buckets' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New Folder' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sync bucket' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bucket settings' })).toBeTruthy()
  })
})
