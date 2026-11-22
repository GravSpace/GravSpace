import {
  ChevronLeft,
  Database,
  Search,
  FolderPlus,
  Upload,
  ChevronDown,
  Settings,
  Loader2,
  RefreshCw,
  Clock,
  History,
} from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '../ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import type { BucketInfo } from '../../routes/admin/buckets/$bucket'
import { BucketHeaderFederationBadge } from './FederationBadge'
import type { CrossServerShare } from '../federation/federationTypes'

interface Props {
  bucketName: string
  currentPrefix: string
  prefixParts: string[]
  bucketInfo: BucketInfo | null
  shares?: CrossServerShare[]
  searchQuery: string
  onSearchChange: (q: string) => void
  onNavigate: (prefix: string) => void
  onBack: () => void
  onNewFolder: () => void
  onUploadFilesClick: () => void
  onUploadFolderClick: () => void
  onSync: () => void
  onOpenSettings: () => void
  loading: boolean
  syncing: boolean
  activeTransfersCount: number
  showVersions?: boolean
  onToggleShowVersions?: () => void
}

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function BucketHeader({
  bucketName,
  prefixParts,
  bucketInfo,
  shares,
  searchQuery,
  onSearchChange,
  onNavigate,
  onBack,
  onNewFolder,
  onUploadFilesClick,
  onUploadFolderClick,
  onSync,
  onOpenSettings,
  loading,
  syncing,
  activeTransfersCount,
  showVersions = false,
  onToggleShowVersions,
}: Props) {
  const usagePercentage = bucketInfo?.QuotaBytes
    ? Math.min(100, Math.round(((bucketInfo.CurrentSize || 0) / bucketInfo.QuotaBytes) * 100))
    : 0

  return (
    <header className="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-3 overflow-hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8 shrink-0 border border-slate-200 dark:border-slate-800"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2 overflow-hidden">
          <Database className="w-4 h-4 text-primary shrink-0" />
          <Breadcrumb className="overflow-hidden">
            <BreadcrumbList className="flex-nowrap">
              <BreadcrumbItem>
                <BreadcrumbLink
                  onClick={() => onNavigate('')}
                  className="cursor-pointer max-w-[120px] truncate font-semibold italic"
                >
                  {bucketName}
                </BreadcrumbLink>
              </BreadcrumbItem>
              {prefixParts.map((part, i) => (
                <div key={part} className="flex items-center gap-1.5">
                  <BreadcrumbSeparator className="shrink-0" />
                  <BreadcrumbItem>
                    <BreadcrumbLink
                      onClick={() => onNavigate(prefixParts.slice(0, i + 1).join('/') + '/')}
                      className="cursor-pointer max-w-[150px] truncate"
                    >
                      {part}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </div>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <BucketHeaderFederationBadge bucketName={bucketName} shares={shares} />
        {bucketInfo?.VersioningEnabled && (
          <Badge
            variant="outline"
            className="text-[9px] h-5 py-0 px-1.5 uppercase tracking-wider font-extrabold border-violet-500/30 text-violet-500 shrink-0 gap-1 flex items-center"
          >
            <Clock className="w-2.5 h-2.5" /> Versioned
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3" suppressHydrationWarning>
        {!!(bucketInfo?.QuotaBytes && bucketInfo.QuotaBytes > 0) && (
          <div className="hidden md:flex flex-col gap-1 w-48 mr-2">
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
              <span className="text-slate-500">Usage</span>
              <span className={usagePercentage > 90 ? 'text-rose-500' : 'text-slate-600'}>
                {formatSize(bucketInfo.CurrentSize || 0)} / {formatSize(bucketInfo.QuotaBytes)}
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-200/50 dark:bg-slate-800/50 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  usagePercentage > 90 ? 'bg-rose-500' : usagePercentage > 75 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${usagePercentage}%` }}
              />
            </div>
          </div>
        )}

        <div className="relative w-64 group" suppressHydrationWarning>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search objects..."
            autoComplete="off"
            data-protonpass-ignore="true"
            data-1p-ignore="true"
            suppressHydrationWarning
            className="h-9 pl-9 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>

        {bucketInfo?.VersioningEnabled && onToggleShowVersions && (
          <Button
            variant={showVersions ? 'secondary' : 'outline'}
            size="sm"
            onClick={onToggleShowVersions}
            className={`h-9 border-slate-200 dark:border-slate-800 text-xs gap-1.5 ${
              showVersions ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30' : ''
            }`}
            title={showVersions ? 'Hide older object versions' : 'Show all object versions'}
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Versions</span>
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onNewFolder}
          className="h-9 border-slate-200 dark:border-slate-800"
        >
          <FolderPlus className="w-3.5 h-3.5 mr-2" /> New Folder
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              disabled={activeTransfersCount > 0}
              className="h-9 bg-primary hover:bg-primary/90 shadow-xs transition-all duration-200 active:scale-95"
            >
              {activeTransfersCount > 0 ? (
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5 mr-2" />
              )}
              {activeTransfersCount > 0 ? 'Transferring...' : 'Upload'}
              <ChevronDown className="w-3 h-3 ml-2 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onUploadFilesClick}>Upload Files</DropdownMenuItem>
            <DropdownMenuItem onClick={onUploadFolderClick}>Upload Folder</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          onClick={onSync}
          disabled={loading || syncing}
          className="h-9 border-slate-200 dark:border-slate-800"
          title="Scan filesystem and synchronize database"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading || syncing ? 'animate-spin' : ''}`} />
          Sync
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={onOpenSettings}
          className="h-9 w-9 border-slate-200 dark:border-slate-800"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </header>
  )
}
