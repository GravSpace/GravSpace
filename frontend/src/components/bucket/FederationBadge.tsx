import { ArrowSwapHorizontal, Transmit, ArrowRight2, Driver2, FolderConnection } from '#/lib/iconsax-adapter'
import { Badge } from '../ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip'
import type { CrossServerShare } from '../federation/federationTypes'

export function BucketFederationBadge({
  bucket,
  shares = [],
}: {
  bucket: string
  shares?: CrossServerShare[]
}) {
  const enabledShares = shares.filter((s) => s.enabled)

  const twoWay = enabledShares.filter(
    (s) => s.source_bucket === bucket && s.sync_mode === 'two_way',
  )

  const outboundOneWay = enabledShares.filter(
    (s) => s.source_bucket === bucket && s.sync_mode !== 'two_way',
  )

  if (twoWay.length === 0 && outboundOneWay.length === 0) {
    return null
  }

  // Priority 1: Two-Way Sync
  if (twoWay.length > 0) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              onClick={(e) => e.stopPropagation()}
              className="text-[9px] h-4.5 py-0 px-2 rounded-full font-medium border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 shrink-0 gap-1.5 flex items-center cursor-default outline-none select-none shadow-2xs hover:bg-indigo-500/15 transition-all"
            >
              <ArrowSwapHorizontal size={12} variant="Linear" color="currentColor" className="shrink-0" />
              <span>2-Way Sync</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6} className="p-3 bg-zinc-950/95 border border-border/80 shadow-2xl rounded-xl min-w-[270px] max-w-sm space-y-2 select-none">
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <div className="flex items-center gap-1.5 font-semibold text-[11px] text-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                <span>Bidirectional Cluster Sync</span>
              </div>
              <span className="text-[9.5px] font-medium px-1.5 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
                Continuous
              </span>
            </div>
            <div className="space-y-1.5">
              {twoWay.map((s) => {
                const partnerBucket = s.source_bucket === bucket ? s.target_bucket : s.source_bucket
                return (
                  <div key={s.id} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-muted/40 border border-border/50 text-[10.5px] font-mono">
                    <span className="text-foreground font-semibold truncate max-w-[120px]">
                      {s.remote_server_name || 'Remote Peer'}
                    </span>
                    <span className="text-muted-foreground text-[10px]">
                      ({partnerBucket})
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] text-muted-foreground pt-0.5">
              Real-time two-way synchronization active with connected clusters.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Priority 2: One-Way Outbound Source
  const isFullBucket = outboundOneWay.some((s) => !s.source_prefix || s.source_prefix === '/')

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          {isFullBucket ? (
            <Badge
              variant="outline"
              onClick={(e) => e.stopPropagation()}
              className="text-[9px] h-4.5 py-0 px-2 rounded-full font-medium border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/10 shrink-0 gap-1.5 flex items-center cursor-default outline-none select-none shadow-2xs hover:bg-sky-500/15 transition-all"
            >
              <Transmit size={12} variant="Linear" color="currentColor" className="shrink-0" />
              <span>1-Way Outbound</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              onClick={(e) => e.stopPropagation()}
              className="text-[9px] h-4.5 py-0 px-2 rounded-full font-medium border-cyan-500/30 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 shrink-0 gap-1.5 flex items-center cursor-default outline-none select-none shadow-2xs hover:bg-cyan-500/15 transition-all"
            >
              <FolderConnection size={12} variant="Linear" color="currentColor" className="shrink-0" />
              <span>{outboundOneWay.length} {outboundOneWay.length === 1 ? 'Prefix' : 'Prefixes'}</span>
            </Badge>
          )}
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="p-3 bg-zinc-950/95 border border-border/80 shadow-2xl rounded-xl min-w-[280px] max-w-sm space-y-2 select-none">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <div className="flex items-center gap-1.5 font-semibold text-[11px] text-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>{isFullBucket ? 'Outbound Mirror Rule' : 'Replication Prefix Rules'}</span>
            </div>
            <span className="text-[9.5px] font-medium px-1.5 py-0.5 rounded border border-sky-500/30 bg-sky-500/10 text-sky-400">
              1-Way Push
            </span>
          </div>
          <div className="space-y-1.5">
            {outboundOneWay.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-muted/40 border border-border/50 text-[10.5px] font-mono">
                <span className="text-foreground font-semibold truncate max-w-[100px]">
                  {s.source_prefix || '/'}
                </span>
                <ArrowRight2 size={12} variant="Linear" className="text-sky-400 shrink-0" />
                <span className="text-muted-foreground truncate max-w-[130px] text-right">
                  {s.remote_server_name || 'Remote'}: <span className="text-sky-400">{s.target_bucket}</span>
                </span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function BucketHeaderFederationBadge({
  bucketName,
  shares = [],
}: {
  bucketName: string
  shares?: CrossServerShare[]
}) {
  const enabledShares = shares.filter((s) => s.enabled)

  const twoWay = enabledShares.find(
    (s) => s.source_bucket === bucketName && s.sync_mode === 'two_way',
  )
  if (twoWay) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="text-[10px] h-5 py-0 px-2.5 rounded-full font-medium border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 gap-1.5 flex items-center cursor-default shrink-0 outline-none select-none shadow-2xs hover:bg-indigo-500/15 transition-all"
            >
              <ArrowSwapHorizontal size={12} variant="Linear" color="currentColor" className="shrink-0" />
              <span>2-Way Sync</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6} className="p-3 bg-zinc-950/95 border border-border/80 shadow-2xl rounded-xl min-w-[270px] max-w-sm space-y-1.5 select-none">
            <div className="font-semibold text-indigo-400 text-xs">Two-Way Continuous Sync</div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Bidirectional real-time replication with <span className="text-foreground font-semibold">{twoWay.remote_server_name || 'remote cluster'}</span>.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const matchingOutbound = enabledShares.filter(
    (s) => s.source_bucket === bucketName && s.sync_mode !== 'two_way',
  )
  if (matchingOutbound.length === 0) return null

  const isFull = matchingOutbound.some((s) => !s.source_prefix || s.source_prefix === '/')

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="text-[10px] h-5 py-0 px-2.5 rounded-full font-medium border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/10 gap-1.5 flex items-center cursor-default shrink-0 outline-none select-none shadow-2xs hover:bg-sky-500/15 transition-all"
          >
            <Transmit size={12} variant="Linear" color="currentColor" className="shrink-0" />
            <span>{isFull ? '1-Way Outbound' : `${matchingOutbound.length} Shared`}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className="p-3 bg-zinc-950/95 border border-border/80 shadow-2xl rounded-xl min-w-[270px] max-w-sm space-y-1.5 select-none">
          <div className="font-semibold text-sky-400 text-xs">Cross-Server Share Active</div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            This bucket continuously pushes data to remote GravSpace clusters in real-time.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function FolderFederationBadge({
  currentBucket,
  folderPrefix,
  shares = [],
}: {
  currentBucket: string
  folderPrefix: string
  shares?: CrossServerShare[]
}) {
  const cleanFolder = folderPrefix.replace(/\/$/, '')
  const matching = shares.find((s) => {
    if (s.source_bucket !== currentBucket || !s.enabled) return false
    const sPrefix = (s.source_prefix || '').replace(/\/$/, '')
    if (!sPrefix) return false
    return sPrefix === cleanFolder || cleanFolder.startsWith(sPrefix)
  })

  if (!matching) return null

  const isTwoWay = matching.sync_mode === 'two_way'

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`text-[9.5px] h-5 px-2 py-0 gap-1.5 font-medium cursor-default shrink-0 outline-none select-none rounded-full transition-all shadow-2xs ${isTwoWay
              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/15'
              : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30 hover:bg-sky-500/15'
              }`}
            onClick={(e) => e.stopPropagation()}
          >
            {isTwoWay ? (
              <ArrowSwapHorizontal size={12} variant="Linear" color="currentColor" className="shrink-0" />
            ) : (
              <FolderConnection size={12} variant="Linear" color="currentColor" className="shrink-0" />
            )}
            <span>{isTwoWay ? `2-Way: ${matching.remote_server_name || 'Peer'}` : `Sync: ${matching.remote_server_name || 'Peer'}`}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="p-3 bg-zinc-950/95 border border-border/80 text-foreground shadow-2xl rounded-xl min-w-[270px] max-w-sm space-y-2.5 pointer-events-none select-none"
        >
          {/* Header Row */}
          <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
            <div className="flex items-center gap-1.5 font-semibold text-[11px] text-foreground">
              <span className={`w-1.5 h-1.5 rounded-full ${isTwoWay ? 'bg-indigo-400 animate-pulse' : 'bg-sky-400'}`} />
              <span>{isTwoWay ? 'Bidirectional Sync' : 'Replication Pipeline'}</span>
            </div>
            <span
              className={`text-[9.5px] font-medium px-1.5 py-0.5 rounded-md border ${isTwoWay
                ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400'
                : 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                }`}
            >
              {isTwoWay ? 'Continuous 2-Way' : '1-Way Outbound'}
            </span>
          </div>

          {/* Pipeline Routing Track */}
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/40 border border-border/50 text-[10.5px] font-mono">
            <div className="flex items-center gap-1.5 min-w-0">
              <FolderConnection size={12} variant="Linear" color="currentColor" className="text-sky-400 shrink-0" />
              <span className="text-foreground font-semibold truncate max-w-[90px]" title={folderPrefix}>
                {folderPrefix}
              </span>
            </div>

            <div className="shrink-0 text-muted-foreground/60 px-1">
              {isTwoWay ? (
                <ArrowSwapHorizontal size={12} variant="Linear" className="text-indigo-400" />
              ) : (
                <ArrowRight2 size={12} variant="Linear" className="text-sky-400" />
              )}
            </div>

            <div className="flex items-center gap-1.5 min-w-0 justify-end text-right">
              <Driver2 size={12} variant="Linear" className="text-sky-400 shrink-0" />
              <span className="text-muted-foreground truncate max-w-[120px]" title={`${matching.remote_server_name || 'Remote'}: ${matching.target_bucket}/${matching.target_prefix || ''}`}>
                <span className="text-foreground font-medium">{matching.remote_server_name || 'Remote'}</span>
                <span className="opacity-60">:</span>
                <span className="text-sky-400/90">{matching.target_bucket}/{matching.target_prefix || ''}</span>
              </span>
            </div>
          </div>

          {/* Quick status caption */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Target Cluster</span>
            <span className="font-mono text-foreground/80">{matching.remote_server_name || 'Remote'} ({matching.target_bucket})</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
