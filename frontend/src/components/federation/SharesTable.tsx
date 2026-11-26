import { useMemo } from 'react'
import { Button } from '@ui-sdk/react/button'
import { Switch, SwitchThumb } from '@ui-sdk/react/switch'
import {
  AlertCircle,
  ArrowRight,
  Clock,
  Database,
  Edit2,
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
  onEdit: (share: CrossServerShare) => void
  onToggle: (id: number, enabled: boolean) => void
  onDelete: (id: number, name: string) => void
  onCreateNew?: () => void
}

export function SharesTable({
  shares,
  searchQuery,
  reconcilingId,
  onReconcile,
  onEdit,
  onToggle,
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
    <div className="rounded-xl border border-border/70 bg-card/80 backdrop-blur-xs shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/35 border-b border-border/60">
            <tr>
              <th className="px-3.5 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                Rule & Mode
              </th>
              <th className="px-3.5 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                Replication Path
              </th>
              <th className="px-3.5 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                Active
              </th>
              <th className="px-3.5 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                Sync State
              </th>
              <th className="px-3.5 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                Last Sync
              </th>
              <th className="px-3.5 py-2.5 text-right font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {shares.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-2">
                    <FolderSync className="w-5 h-5" />
                  </div>
                  <p className="font-semibold text-xs text-foreground">No active cross-server shares</p>
                  <p className="text-[11px] mt-0.5 max-w-sm mx-auto text-muted-foreground">
                    Create a replication rule to mirror a bucket or folder prefix to another GravSpace cluster.
                  </p>
                  {onCreateNew && (
                    <Button
                      onClick={onCreateNew}
                      className="mt-3 h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FolderSync className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Create First Share Rule</span>
                    </Button>
                  )}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-muted-foreground">
                  <XCircle className="w-5 h-5 mx-auto text-muted-foreground/40 mb-1" />
                  <p className="font-medium text-xs">No share rules match &quot;{searchQuery}&quot;</p>
                </td>
              </tr>
            ) : (
              filtered.map((share) => (
                <tr key={share.id} className={`hover:bg-muted/25 transition-colors ${!share.enabled ? 'opacity-65' : ''}`}>
                  <td className="px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                        <FolderSync className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-semibold text-foreground text-xs truncate max-w-[180px]" title={share.name}>
                          {share.name}
                        </span>
                        <span
                          className={`w-fit inline-flex items-center px-1.5 py-0.2 rounded text-[9.5px] font-medium border ${
                            share.sync_mode === 'one_way'
                              ? 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                              : 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400'
                          }`}
                        >
                          {share.sync_mode === 'one_way' ? '↗ One-Way Push' : '⇄ Two-Way Sync'}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="px-3.5 py-2.5">
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/40 border border-border/60">
                        <Database className="w-3 h-3 text-primary shrink-0" />
                        <span className="font-semibold text-foreground text-[11px]">{share.source_bucket}</span>
                        {share.source_prefix ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                            <Folder className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate max-w-[110px]" title={share.source_prefix}>{share.source_prefix}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 text-[10px] font-mono">/*</span>
                        )}
                      </div>

                      <ArrowRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />

                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-sky-500/5 border border-sky-500/20">
                        <Server className="w-3 h-3 text-sky-500 shrink-0" />
                        <span className="text-[10px] text-sky-600 dark:text-sky-400 font-medium truncate max-w-[90px]" title={share.remote_server_name || 'Remote'}>
                          {share.remote_server_name || 'Remote'}
                        </span>
                        <span className="text-muted-foreground/40 font-mono">:</span>
                        <span className="font-semibold text-foreground text-[11px]">{share.target_bucket}</span>
                        {share.target_prefix && (
                          <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[100px]" title={share.target_prefix}>
                            /{share.target_prefix}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-3.5 py-2.5">
                    <Switch
                      checked={share.enabled}
                      aria-label={`Toggle ${share.name}`}
                      onCheckedChange={(checked) => onToggle(share.id, checked)}
                      className="cursor-pointer"
                    >
                      <SwitchThumb />
                    </Switch>
                  </td>

                  <td className="px-3.5 py-2.5">
                    {!share.enabled ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-muted text-muted-foreground border border-border/60">
                        Paused
                      </span>
                    ) : share.status === 'in_sync' ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>In Sync</span>
                      </span>
                    ) : share.status === 'syncing' ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                        <Loader2 className="w-3 h-3 animate-spin text-sky-500" />
                        <span>Syncing</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <AlertCircle className="w-3 h-3 text-amber-500" />
                        <span>Retrying</span>
                      </span>
                    )}
                  </td>

                  <td className="px-3.5 py-2.5">
                    <div className="flex items-center gap-1 text-muted-foreground font-mono tabular-nums text-[11px]" title={share.last_synced_at || undefined}>
                      <Clock className="w-3 h-3 opacity-60 shrink-0" />
                      <span>{formatTimeAgo(share.last_synced_at)}</span>
                    </div>
                  </td>

                  <td className="px-3.5 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        aria-label={`Reconcile ${share.name}`}
                        onClick={() => onReconcile(share.id, share.name)}
                        disabled={reconcilingId === share.id}
                        className="h-7 px-2 rounded-md border border-border/70 bg-background/90 hover:bg-primary/10 hover:text-primary text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RotateCw className={`w-3 h-3 ${reconcilingId === share.id ? 'animate-spin text-primary' : ''}`} aria-hidden="true" />
                        <span>Reconcile</span>
                      </Button>

                      <Button
                        aria-label={`Edit share ${share.name}`}
                        onClick={() => onEdit(share)}
                        className="h-7 px-2 rounded-md border border-border/60 bg-background/80 hover:bg-muted text-foreground text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                        <span>Edit</span>
                      </Button>

                      <Button
                        aria-label={`Delete share ${share.name}`}
                        onClick={() => onDelete(share.id, share.name)}
                        className="h-7 w-7 p-0 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 inline-flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
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
