import { ArrowSwapHorizontal, ArrowRight2, Driver2, FolderConnection } from '#/lib/iconsax-adapter'
import { ArrowDown, X } from 'lucide-react'
import { Badge } from '../ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip'
import type { CrossServerShare } from '../federation/federationTypes'
import { formatTimeAgo } from '../federation/federationTypes'
import {
  collectInboundForBucket,
  matchInboundForFolder,
  type InboundBadgeItem,
  type InboundFederationBinding,
} from './federationBadgeTypes'

function InboundBadgeTooltipRows({
  items,
  onDismissInbound,
}: {
  items: InboundBadgeItem[]
  onDismissInbound?: (id: number) => void
}) {
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div
          key={item.key}
          className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-muted/40 border border-border/50 text-[10.5px] font-mono"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <Driver2 size={12} variant="Linear" className="text-emerald-400 shrink-0" />
              <span className="text-foreground font-semibold truncate">{item.sourceLabel}</span>
              <ArrowRight2 size={11} variant="Linear" className="text-emerald-400 shrink-0" />
              <span className="text-emerald-400 truncate">
                /{item.targetPrefix || ''}
              </span>
            </div>
            <div className="text-[9.5px] text-muted-foreground truncate mt-0.5">
              From {item.sourceBucket}/{item.sourcePrefix || ''}
              {item.lastSyncedAt ? ` · ${formatTimeAgo(item.lastSyncedAt)}` : ''}
            </div>
          </div>
          {item.remoteId !== undefined && onDismissInbound && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDismissInbound(item.remoteId!)
              }}
              title="Dismiss stale inbound marker"
              aria-label={`Dismiss inbound marker from ${item.sourceLabel}`}
              className="p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-rose-400 shrink-0 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export function InboundBucketBadge({
  bucket,
  shares = [],
  inboundShares = [],
  onDismissInbound,
}: {
  bucket: string
  shares?: CrossServerShare[]
  inboundShares?: InboundFederationBinding[]
  onDismissInbound?: (id: number) => void
}) {
  const items = collectInboundForBucket(bucket, shares, inboundShares)
  if (items.length === 0) return null

  const hasTwoWay = items.some((i) => i.syncMode === 'two_way')
  const isFullBucket = items.some((i) => !i.targetPrefix || i.targetPrefix === '/')
  const label = hasTwoWay
    ? '2-Way Target'
    : isFullBucket
      ? '1-Way Inbound'
      : `${items.length} Inbound`

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            onClick={(e) => e.stopPropagation()}
            className={`text-[9px] h-4.5 py-0 px-2 rounded-full font-medium shrink-0 gap-1 flex items-center cursor-default outline-none select-none shadow-2xs transition-all ${
              hasTwoWay
                ? 'border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/15'
                : 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15'
            }`}
          >
            {hasTwoWay ? (
              <ArrowSwapHorizontal size={11} variant="Linear" color="currentColor" className="shrink-0" />
            ) : (
              <ArrowDown className="w-3 h-3 shrink-0" />
            )}
            <span>{label}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="p-3 bg-zinc-950/95 border border-border/80 text-foreground shadow-2xl rounded-xl min-w-[270px] max-w-sm space-y-2 select-none"
        >
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <div className="flex items-center gap-1.5 font-semibold text-[11px] text-foreground">
              <span className={`w-1.5 h-1.5 rounded-full ${hasTwoWay ? 'bg-indigo-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span>{hasTwoWay ? 'Bidirectional Target' : 'Inbound Federation Target'}</span>
            </div>
            <span
              className={`text-[9.5px] font-medium px-1.5 py-0.5 rounded border ${
                hasTwoWay
                  ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              }`}
            >
              {hasTwoWay ? '2-Way Sync' : 'Receiving Sync'}
            </span>
          </div>
          <InboundBadgeTooltipRows items={items} onDismissInbound={onDismissInbound} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function InboundHeaderBadge({
  bucketName,
  shares = [],
  inboundShares = [],
  onDismissInbound,
}: {
  bucketName: string
  shares?: CrossServerShare[]
  inboundShares?: InboundFederationBinding[]
  onDismissInbound?: (id: number) => void
}) {
  const items = collectInboundForBucket(bucketName, shares, inboundShares)
  if (items.length === 0) return null

  const hasTwoWay = items.some((i) => i.syncMode === 'two_way')
  const isFullBucket = items.some((i) => !i.targetPrefix || i.targetPrefix === '/')
  const label = hasTwoWay
    ? '2-Way Target'
    : isFullBucket
      ? '1-Way Inbound'
      : `${items.length} Inbound`

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`text-[10px] h-5 py-0 px-2.5 rounded-full font-medium gap-1.5 flex items-center cursor-default shrink-0 outline-none select-none shadow-2xs transition-all ${
              hasTwoWay
                ? 'border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/15'
                : 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15'
            }`}
          >
            {hasTwoWay ? (
              <ArrowSwapHorizontal size={12} variant="Linear" color="currentColor" className="shrink-0" />
            ) : (
              <ArrowDown className="w-3 h-3 shrink-0" />
            )}
            <span>{label}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          sideOffset={6}
          className="p-3 bg-zinc-950/95 border border-border/80 text-foreground shadow-2xl rounded-xl min-w-[270px] max-w-sm space-y-2 select-none"
        >
          <div className="font-semibold text-emerald-400 text-xs">
            {hasTwoWay ? 'Two-Way Federation Target' : 'Inbound Replication Target'}
          </div>
          <InboundBadgeTooltipRows items={items} onDismissInbound={onDismissInbound} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function InboundFolderBadge({
  currentBucket,
  folderPrefix,
  shares = [],
  inboundShares = [],
  onDismissInbound,
}: {
  currentBucket: string
  folderPrefix: string
  shares?: CrossServerShare[]
  inboundShares?: InboundFederationBinding[]
  onDismissInbound?: (id: number) => void
}) {
  const match = matchInboundForFolder(currentBucket, folderPrefix, shares, inboundShares)
  if (!match) return null

  const isTwoWay = match.syncMode === 'two_way'

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            onClick={(e) => e.stopPropagation()}
            className={`text-[9.5px] h-5 px-2 py-0 gap-1.5 font-medium cursor-default shrink-0 outline-none select-none rounded-full transition-all shadow-2xs ${
              isTwoWay
                ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/15'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15'
            }`}
          >
            {isTwoWay ? (
              <ArrowSwapHorizontal size={12} variant="Linear" color="currentColor" className="shrink-0" />
            ) : (
              <FolderConnection size={12} variant="Linear" color="currentColor" className="shrink-0" />
            )}
            <span>{isTwoWay ? `2-Way: ${match.sourceLabel}` : `Inbound: ${match.sourceLabel}`}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="p-3 bg-zinc-950/95 border border-border/80 text-foreground shadow-2xl rounded-xl min-w-[270px] max-w-sm space-y-2 select-none"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
            <div className="flex items-center gap-1.5 font-semibold text-[11px] text-foreground">
              <span className={`w-1.5 h-1.5 rounded-full ${isTwoWay ? 'bg-indigo-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span>{isTwoWay ? 'Bidirectional Folder Target' : 'Inbound Folder Sync'}</span>
            </div>
            <span
              className={`text-[9.5px] font-medium px-1.5 py-0.5 rounded-md border ${
                isTwoWay
                  ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              }`}
            >
              {isTwoWay ? 'Continuous 2-Way' : 'Target Folder'}
            </span>
          </div>
          <InboundBadgeTooltipRows items={[match]} onDismissInbound={onDismissInbound} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
