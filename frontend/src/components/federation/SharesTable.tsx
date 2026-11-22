import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowRight,
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
          <thead className="bg-muted/40 border-b">
            <tr>
              <th className="px-3.5 py-2.5 text-left font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                Rule & Mode
              </th>
              <th className="px-3.5 py-2.5 text-left font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                Replication Routing Path
              </th>
              <th className="px-3.5 py-2.5 text-left font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                Sync State
              </th>
              <th className="px-3.5 py-2.5 text-left font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                Last Synchronized
              </th>
              <th className="px-3.5 py-2.5 text-right font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {shares.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-muted-foreground">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto mb-2">
                    <FolderSync className="w-5 h-5" />
                  </div>
                  <p className="font-semibold text-xs text-foreground">No active cross-server shares</p>
                  <p className="text-[11px] mt-0.5 max-w-sm mx-auto text-muted-foreground">
                    Create a replication rule to continuously mirror an entire bucket or specific folder to another GravSpace cluster.
                  </p>
                  {onCreateNew && (
                    <Button size="sm" onClick={onCreateNew} className="mt-3 h-8 text-xs">
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
                  <td className="px-3.5 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold text-foreground text-xs">{share.name}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 h-4">
                          {share.sync_mode === 'one_way' ? 'One-Way Push' : 'Two-Way Sync'}
                        </Badge>
                      </div>
                    </div>
                  </td>

                  {/* Replication Routing Path */}
                  <td className="px-3.5 py-2.5">
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      {/* Source */}
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50 border border-border/40">
                        <Database className="w-3 h-3 text-primary shrink-0" />
                        <span className="font-bold text-foreground">{share.source_bucket}</span>
                        {share.source_prefix ? (
                          <span className="text-muted-foreground flex items-center gap-0.5">
                            <Folder className="w-2.5 h-2.5" />
                            {share.source_prefix}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60 text-[10px] font-sans italic">/*</span>
                        )}
                      </div>

                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

                      {/* Destination Target */}
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/5 border border-primary/20">
                        <Server className="w-3 h-3 text-primary shrink-0" />
                        <span className="text-[10px] text-muted-foreground font-sans font-medium">
                          {share.remote_server_name || 'Remote'}
                        </span>
                        <span className="text-muted-foreground font-sans">:</span>
                        <span className="font-bold text-foreground">{share.target_bucket}</span>
                        {share.target_prefix && (
                          <span className="text-muted-foreground flex items-center gap-0.5">
                            <Folder className="w-2.5 h-2.5" />
                            {share.target_prefix}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Status State */}
                  <td className="px-3.5 py-2.5">
                    {share.status === 'in_sync' && (
                      <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 flex items-center gap-1.5 w-fit">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>In Sync (100%)</span>
                      </Badge>
                    )}
                    {share.status === 'syncing' && (
                      <Badge className="text-[10px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border-0 flex items-center gap-1.5 w-fit">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
                        <span>Syncing...</span>
                      </Badge>
                    )}
                    {share.status === 'pending_retry' && (
                      <Badge className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-0 flex items-center gap-1.5 w-fit">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span>Pending Retry</span>
                      </Badge>
                    )}
                  </td>

                  {/* Last Synced */}
                  <td className="px-3.5 py-2.5 text-muted-foreground font-mono text-[11px]">
                    {formatTimeAgo(share.last_synced_at)}
                  </td>

                  {/* Actions */}
                  <td className="px-3.5 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs hover:bg-primary/10 hover:text-primary transition-colors"
                        title="Reconcile and sync missing files"
                        onClick={() => onReconcile(share.id, share.name)}
                        disabled={reconcilingId === share.id}
                      >
                        {reconcilingId === share.id ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                        ) : (
                          <RotateCw className="w-3.5 h-3.5 mr-1" />
                        )}
                        <span>Reconcile</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
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
