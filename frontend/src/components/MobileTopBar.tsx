import { Search, UploadCloud } from 'lucide-react'
import { useRouterState } from '@tanstack/react-router'
import { SidebarTrigger } from './ui/sidebar'
import { Button } from './ui/button'
import { useTransfers } from '../hooks/useTransfers'

const ROUTE_TITLES: ReadonlyArray<[string, string]> = [
  ['/admin/dashboard', 'Dashboard'],
  ['/admin/buckets/', 'Bucket Explorer'],
  ['/admin/buckets', 'Buckets'],
  ['/admin/federation', 'Federation & Sync'],
  ['/admin/vault', 'Vault & Secrets'],
  ['/admin/presigns', 'Presigned Links'],
  ['/admin/explorer', 'S3 API Explorer'],
  ['/admin/users', 'IAM Engine'],
  ['/admin/policies', 'Security Policies'],
  ['/admin/audit', 'Audit Logs'],
  ['/admin/trash', 'Recycle Bin'],
  ['/admin/settings', 'Settings'],
]

function resolveRouteTitle(pathname: string): string {
  const match = ROUTE_TITLES.find(([prefix]) => pathname.startsWith(prefix))
  return match ? match[1] : 'GravSpace'
}

export function MobileTopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { activeTransfersCount, setShowTransferManager, showTransferManager } =
    useTransfers()
  const title = resolveRouteTitle(pathname)

  function openGlobalSearch() {
    window.dispatchEvent(new CustomEvent('gravspace:open-search'))
  }

  return (
    <div className="md:hidden sticky top-0 z-20 flex h-13 shrink-0 items-center justify-between gap-2 border-b bg-card/90 backdrop-blur-md px-3">
      <div className="flex items-center gap-2 min-w-0">
        <SidebarTrigger
          className="h-9 w-9 shrink-0 rounded-lg border border-border/60 bg-background/70"
          aria-label="Open navigation menu"
        />
        <div className="flex items-center gap-2 min-w-0">
          <img
            src="/logo.png"
            alt="GravSpace"
            className="h-6 w-6 rounded-md object-cover shrink-0 ring-1 ring-border/50"
          />
          <span className="text-xs font-bold tracking-tight truncate text-foreground">
            {title}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {activeTransfersCount > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowTransferManager(!showTransferManager)}
            aria-label="Toggle active transfers"
            className="h-9 px-2.5 gap-1.5 text-xs border-primary/30 text-primary bg-primary/10"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span className="font-mono font-bold">{activeTransfersCount}</span>
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={openGlobalSearch}
          aria-label="Search objects"
          className="h-9 w-9 border-border/60 bg-background/70"
        >
          <Search className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  )
}
