import { FolderSync, ArrowRight, ArrowLeftRight, ArrowUpRight } from 'lucide-react'
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

  // 1. Two-Way Continuous Sync (originating from this cluster)
  const twoWay = enabledShares.filter(
    (s) => s.source_bucket === bucket && s.sync_mode === 'two_way',
  )

  // 2. One-Way Outbound (sending source from this cluster)
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
              className="text-[8px] h-4 py-0 px-1.5 uppercase tracking-widest font-extrabold border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 shrink-0 gap-1 flex items-center cursor-default outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 select-none"
            >
              <ArrowLeftRight className="w-2.5 h-2.5" /> 2-Way Sync
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs p-3 space-y-1.5 max-w-xs bg-slate-900 border border-slate-800 text-slate-100 shadow-xl">
            <div className="font-semibold text-[11px] text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowLeftRight className="w-3 h-3" /> Two-Way Continuous Sync
            </div>
            <div className="space-y-1">
              {twoWay.map((s) => {
                const partnerBucket = s.source_bucket === bucket ? s.target_bucket : s.source_bucket
                return (
                  <div key={s.id} className="text-[11px] flex items-center gap-1.5 text-slate-300 font-mono">
                    <span className="text-indigo-300 font-semibold truncate max-w-[110px]">
                      {s.remote_server_name || 'Remote Peer'}
                    </span>
                    <span className="text-slate-400 text-[10px] shrink-0">
                      ({partnerBucket})
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] text-slate-400 pt-0.5 border-t border-slate-800">
              Bidirectional sync active between local and remote clusters.
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
              className="text-[8px] h-4 py-0 px-1.5 uppercase tracking-widest font-extrabold border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/10 shrink-0 gap-1 flex items-center cursor-default outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 select-none"
            >
              <ArrowUpRight className="w-2.5 h-2.5" /> 1-Way Outbound
            </Badge>
          ) : (
            <Badge
              variant="outline"
              onClick={(e) => e.stopPropagation()}
              className="text-[8px] h-4 py-0 px-1.5 uppercase tracking-widest font-extrabold border-cyan-500/30 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 shrink-0 gap-1 flex items-center cursor-default outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 select-none"
            >
              <FolderSync className="w-2.5 h-2.5" />
              {outboundOneWay.length} {outboundOneWay.length === 1 ? 'Prefix' : 'Prefixes'}
            </Badge>
          )}
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs p-3 space-y-1.5 max-w-xs bg-slate-900 border border-slate-800 text-slate-100 shadow-xl">
          <div className="font-semibold text-[11px] text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
            <ArrowUpRight className="w-3 h-3" />
            {isFullBucket ? 'One-Way Outbound Mirror' : 'Folder Replication Rules'}
          </div>
          <div className="space-y-1">
            {outboundOneWay.map((s) => (
              <div key={s.id} className="text-[11px] flex items-center gap-1.5 text-slate-300 font-mono">
                <span className="text-slate-400 truncate max-w-[90px]">
                  {s.source_prefix || '/'}
                </span>
                <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="text-slate-200 font-semibold truncate max-w-[100px]">
                  {s.remote_server_name || 'Remote'}
                </span>
                <span className="text-slate-500 text-[10px] shrink-0">
                  ({s.target_bucket})
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
              className="text-[10px] h-5 py-0 px-2 uppercase tracking-wider font-bold border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 gap-1.5 flex items-center cursor-default shrink-0 outline-none select-none"
            >
              <ArrowLeftRight className="w-3 h-3" />
              2-Way Sync
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs p-3 space-y-1 max-w-sm bg-slate-900 border border-slate-800 text-slate-100 shadow-xl">
            <div className="font-semibold text-indigo-400">Two-Way Continuous Sync</div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Bidirectional real-time replication with {twoWay.remote_server_name || 'remote cluster'}.
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
            className="text-[10px] h-5 py-0 px-2 uppercase tracking-wider font-bold border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/10 gap-1.5 flex items-center cursor-default shrink-0 outline-none select-none"
          >
            <ArrowUpRight className="w-3 h-3" />
            {isFull ? '1-Way Outbound' : `${matchingOutbound.length} Shared`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs p-3 space-y-1 max-w-sm bg-slate-900 border border-slate-800 text-slate-100 shadow-xl">
          <div className="font-semibold text-sky-400">Cross-Server Share Active</div>
          <p className="text-[11px] text-slate-400 leading-normal">
            This bucket replicates data to remote GravSpace clusters in real-time.
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
            className={`text-[9px] h-4.5 px-1.5 py-0 gap-1 font-medium cursor-default shrink-0 outline-none select-none ${
              isTwoWay
                ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/15'
                : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30 hover:bg-sky-500/15'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {isTwoWay ? <ArrowLeftRight className="w-2.5 h-2.5" /> : <Network className="w-2.5 h-2.5" />}
            {isTwoWay ? `2-Way: ${matching.remote_server_name || 'Peer'}` : `Sync: ${matching.remote_server_name || 'Peer'}`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs p-2.5 bg-slate-900 border border-slate-800 text-slate-100 shadow-xl">
          <div className="font-semibold text-sky-400 text-[11px]">
            {isTwoWay ? 'Two-Way Synchronized Folder' : 'Replicated Folder'}
          </div>
          <div className="text-[11px] text-slate-300 mt-1 font-mono">
            {folderPrefix} {isTwoWay ? '⇄' : '→'} {matching.remote_server_name || 'Remote'}: {matching.target_bucket}/{matching.target_prefix || ''}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
