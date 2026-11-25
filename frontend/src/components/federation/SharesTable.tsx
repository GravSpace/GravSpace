import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertCircle,
  ArrowRight,
  Clock,
  Database,
  Folder,
  FolderSync,
  Loader2,
  RotateCw,
  Server,
  Trash2,
  XCircle,
} from 'lucide-react'
import { formatTimeAgo, type CrossServerShare } from './federationTypes'

interface SharesTableProps {
  shares: CrossServerShare[]
  searchQuery: string
  reconcilingId: number | null
  onReconcile: (id: number, name: string) => void
  onDelete: (id: number, name: string) => void
  onCreateNew?: () => void
}

export function SharesTable({
  shares,
  searchQuery,
  reconcilingId,
  onReconcile,
  onDelete,
  onCreateNew,
}: SharesTableProps) {
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return shares
    return shares.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.source_bucket.toLowerCase().includes(q) ||
        s.source_prefix.toLowerCase().includes(q) ||
        s.target_bucket.toLowerCase().includes(q) ||
        s.target_prefix.toLowerCase().includes(q) ||
        (s.remote_server_name && s.remote_server_name.toLowerCase().includes(q)),
    )
  }, [shares, searchQuery])

  return (
    <div className="rounded-xl border bg-card/80 backdrop-blur-xs shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 border-b border-border/60">
            <tr>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-muted-foreground/80 text-[10px]">
                Rule & Mode
              </th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-muted-foreground/80 text-[10px]">
                Replication Routing Path
              </th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-muted-foreground/80 text-[10px]">
                Sync State
              </th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-muted-foreground/80 text-[10px]">
                Last Sync
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-muted-foreground/80 text-[10px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {shares.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-14 text-muted-foreground">
                  <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-2.5 shadow-2xs">
                    <FolderSync className="w-5 h-5" />
                  </div>
                  <p className="font-semibold text-xs text-foreground">No active cross-server shares</p>
                  <p className="text-[11px] mt-0.5 max-w-sm mx-auto text-muted-foreground">
                    Create a replication rule to continuously mirror an entire bucket or specific folder to another GravSpace cluster.
                  </p>
                  {onCreateNew && (
                    <Button size="sm" onClick={onCreateNew} className="mt-3.5 h-8 text-xs font-semibold gap-1.5 shadow-2xs">
                      <FolderSync className="w-3.5 h-3.5" />
                      Create First Share Rule
                    </Button>
                  )}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-muted-foreground">
                  <XCircle className="w-6 h-6 mx-auto text-muted-foreground/40 mb-1" />
                  <p className="font-medium text-xs">No share rules match "{searchQuery}"</p>
                </td>
              </tr>
            ) : (
              filtered.map((share) => (
                <tr key={share.id} className="hover:bg-muted/30 transition-colors">
                  {/* Rule Name & Mode */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-2xs">
                        <FolderSync className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-semibold text-foreground text-xs truncate max-w-[200px]" title={share.name}>
                          {share.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[9.5px] font-medium border ${
                              share.sync_mode === 'one_way'
                                ? 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                                : 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400'
                            }`}
                          >
                            {share.sync_mode === 'one_way' ? '↗ One-Way Push' : '⇄ Two-Way Sync'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Replication Routing Path */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-xs">
                      {/* Source */}
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/40 border border-border/70 shadow-2xs">
                        <Database className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="font-bold text-foreground text-[11px] tracking-tight">{share.source_bucket}</span>
                        {share.source_prefix ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-background/80 border border-border/40 px-1.5 py-0.5 rounded text-muted-foreground">
                            <Folder className="w-2.5 h-2.5 text-primary/70 shrink-0" />
                            <span className="truncate max-w-[140px]" title={share.source_prefix}>{share.source_prefix}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 text-[10px] font-mono italic">/*</span>
                        )}
                      </div>

                      <div className="shrink-0 text-muted-foreground/50">
                        <ArrowRight className="w-3.5 h-3.5 text-primary/70" />
                      </div>

                      {/* Destination Target */}
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/5 border border-sky-500/20 shadow-2xs">
                        <span className="inline-flex items-center gap-1 text-[10px] text-sky-600 dark:text-sky-400 font-sans font-medium bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded">
                          <Server className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate max-w-[100px]" title={share.remote_server_name || 'Remote'}>
                            {share.remote_server_name || 'Remote'}
                          </span>
                        </span>
                        <span className="text-muted-foreground/40 font-mono">:</span>
                        <span className="font-bold text-foreground text-[11px] tracking-tight">{share.target_bucket}</span>
                        {share.target_prefix ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-background/80 border border-border/40 px-1.5 py-0.5 rounded text-muted-foreground">
                            <Folder className="w-2.5 h-2.5 text-sky-500/70 shrink-0" />
                            <span className="truncate max-w-[140px]" title={share.target_prefix}>{share.target_prefix}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 text-[10px] font-mono italic">/*</span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Status State */}
                  <td className="px-4 py-3">
                    {share.status === 'in_sync' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs w-fit">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                        </span>
                        <span>In Sync (100%)</span>
                      </span>
                    )}
                    {share.status === 'syncing' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 shadow-2xs w-fit">
                        <Loader2 className="w-3 h-3 animate-spin text-sky-500" />
                        <span>Syncing...</span>
                      </span>
                    )}
                    {share.status === 'pending_retry' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-2xs w-fit">
                        <AlertCircle className="w-3 h-3 text-amber-500 animate-pulse" />
                        <span>Pending Retry</span>
                      </span>
                    )}
                  </td>

                  {/* Last Synced */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]" title={share.last_synced_at || undefined}>
                      <Clock className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                      <span>{formatTimeAgo(share.last_synced_at)}</span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs font-medium gap-1.5 border-border/70 hover:border-primary/40 hover:bg-primary/5 hover:text-primary rounded-lg transition-all shadow-2xs"
                        title="Reconcile and sync missing files"
                        onClick={() => onReconcile(share.id, share.name)}
                        disabled={reconcilingId === share.id}
                      >
                        {reconcilingId === share.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        ) : (
                          <RotateCw className="w-3.5 h-3.5" />
                        )}
                        <span>Reconcile</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                        title="Delete share rule"
                        onClick={() => onDelete(share.id, share.name)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
