import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  HardDrive,
  RotateCw,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react'
import {
  formatBytes,
  formatTimeAgo,
  type QueueStatusFilter,
  type SyncQueueItem,
} from './federationTypes'

interface QueueTableProps {
  queue: SyncQueueItem[]
  searchQuery: string
  onRetryAll: () => void
  onClearCompleted: () => void
}

export function QueueTable({
  queue,
  searchQuery,
  onRetryAll,
  onClearCompleted,
}: QueueTableProps) {
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>('all')

  const counts = useMemo(() => {
    return {
      all: queue.length,
      pending: queue.filter((q) => q.status === 'pending' && q.attempts === 0).length,
      failed: queue.filter((q) => q.status === 'pending' && q.attempts > 0).length,
      syncing: queue.filter((q) => q.status === 'syncing').length,
      completed: queue.filter((q) => q.status === 'completed').length,
    }
  }, [queue])

  const pendingBytes = useMemo(() => {
    return queue
      .filter((q) => q.status === 'pending' || q.status === 'syncing')
      .reduce((acc, it) => acc + (it.size_bytes || 0), 0)
  }, [queue])

  const filtered = useMemo(() => {
    let list = queue
    if (statusFilter === 'pending') {
      list = list.filter((q) => q.status === 'pending' && q.attempts === 0)
    } else if (statusFilter === 'failed') {
      list = list.filter((q) => q.status === 'pending' && q.attempts > 0)
    } else if (statusFilter === 'syncing') {
      list = list.filter((q) => q.status === 'syncing')
    } else if (statusFilter === 'completed') {
      list = list.filter((q) => q.status === 'completed')
    }

    const q = searchQuery.trim().toLowerCase()
    if (!q) return list

    return list.filter(
      (item) =>
        item.source_key.toLowerCase().includes(q) ||
        item.source_bucket.toLowerCase().includes(q) ||
        item.target_key.toLowerCase().includes(q) ||
        item.target_bucket.toLowerCase().includes(q) ||
        item.action.toLowerCase().includes(q) ||
        (item.last_error && item.last_error.toLowerCase().includes(q)),
    )
  }, [queue, statusFilter, searchQuery])

  return (
    <div className="space-y-3">
      {/* Top Monitor Banner */}
      <div className="p-3.5 rounded-xl border bg-card/80 backdrop-blur-xs shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
              <span>Fault-Tolerant Outbox & RTO Health</span>
              {counts.failed > 0 && (
                <Badge variant="destructive" className="text-[10px] h-4 px-1.5 py-0 font-mono">
                  {counts.failed} in retry loop
                </Badge>
              )}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Tasks survive reboots and network partitions. Reconnection triggers auto-drain with zero data loss.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/40 border border-border/40 font-mono text-[11px] text-muted-foreground mr-1">
            <HardDrive className="w-3.5 h-3.5 text-primary" />
            <span>Backlog: <strong className="text-foreground">{formatBytes(pendingBytes)}</strong></span>
          </div>

          <Button variant="outline" size="sm" onClick={onRetryAll} className="h-8 text-xs">
            <RotateCw className="w-3.5 h-3.5 mr-1.5" /> Retry All Pending
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearCompleted} className="h-8 text-xs text-muted-foreground hover:text-foreground">
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Prune Done
          </Button>
        </div>
      </div>

      {/* Filter Status Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
            statusFilter === 'all'
              ? 'bg-foreground text-background font-semibold'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          All ({counts.all})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('pending')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
            statusFilter === 'pending'
              ? 'bg-foreground text-background font-semibold'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <span>Pending</span>
          <span className="font-mono text-[10px]">({counts.pending})</span>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('failed')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
            statusFilter === 'failed'
              ? 'bg-rose-500 text-white font-semibold'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'
          }`}
        >
          <AlertTriangle className="w-3 h-3" />
          <span>Retrying / Backoff</span>
          <span className="font-mono text-[10px]">({counts.failed})</span>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('syncing')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
            statusFilter === 'syncing'
              ? 'bg-sky-500 text-white font-semibold'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <span>In Flight</span>
          <span className="font-mono text-[10px]">({counts.syncing})</span>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('completed')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
            statusFilter === 'completed'
              ? 'bg-emerald-500 text-white font-semibold'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <CheckCircle2 className="w-3 h-3" />
          <span>Completed</span>
          <span className="font-mono text-[10px]">({counts.completed})</span>
        </button>
      </div>

      {/* Outbox Tasks Table */}
      <div className="rounded-xl border bg-card/80 backdrop-blur-xs shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                  Task & Op
                </th>
                <th className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                  Source Object
                </th>
                <th className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                  Remote Target
                </th>
                <th className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                  Size
                </th>
                <th className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                  State & Attempts
                </th>
                <th className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                  Error Diagnostics / Backoff
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {queue.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/60 mb-2" />
                    <p className="font-semibold text-xs text-foreground">Outbox is completely clear</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      All cross-server replication tasks are synchronized with zero pending backlog.
                    </p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-muted-foreground">
                    <XCircle className="w-6 h-6 mx-auto text-muted-foreground/40 mb-1" />
                    <p className="font-medium text-xs">No tasks match current filter</p>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    {/* Task ID & Operation */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="text-muted-foreground text-[11px]">#{item.id}</span>
                        <Badge
                          className={`text-[9px] font-mono px-1.5 py-0 h-4 border-0 font-bold ${
                            item.action === 'PUT'
                              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {item.action}
                        </Badge>
                      </div>
                    </td>

                    {/* Source Key */}
                    <td className="px-3 py-2 font-mono truncate max-w-[220px]" title={`${item.source_bucket}/${item.source_key}`}>
                      <span className="text-muted-foreground text-[11px]">{item.source_bucket}/</span>
                      <span className="font-semibold text-foreground text-[11px]">{item.source_key}</span>
                    </td>

                    {/* Target Key */}
                    <td className="px-3 py-2 font-mono truncate max-w-[220px]" title={`${item.target_bucket}/${item.target_key}`}>
                      <div className="flex items-center gap-1">
                        <ArrowRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                        <span className="text-muted-foreground text-[11px]">{item.target_bucket}/</span>
                        <span className="font-semibold text-foreground text-[11px]">{item.target_key}</span>
                      </div>
                    </td>

                    {/* Size */}
                    <td className="px-3 py-2 font-mono text-muted-foreground text-[11px]">
                      {formatBytes(item.size_bytes)}
                    </td>

                    {/* Status / Retries */}
                    <td className="px-3 py-2">
                      {item.status === 'completed' && (
                        <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Done
                        </Badge>
                      )}
                      {item.status === 'syncing' && (
                        <Badge className="text-[10px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border-0 flex items-center gap-1 w-fit animate-pulse">
                          <RotateCw className="w-3 h-3 animate-spin" /> In Flight
                        </Badge>
                      )}
                      {item.status === 'pending' && item.attempts === 0 && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground flex items-center gap-1 w-fit font-mono">
                          <Clock className="w-3 h-3" /> Queued
                        </Badge>
                      )}
                      {item.status === 'pending' && item.attempts > 0 && (
                        <Badge className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1 w-fit font-mono">
                          <AlertTriangle className="w-3 h-3 text-amber-500" /> Retry {item.attempts}/{item.max_attempts}
                        </Badge>
                      )}
                    </td>

                    {/* Diagnostics / Backoff */}
                    <td className="px-3 py-2">
                      {item.last_error ? (
                        <div className="flex flex-col gap-0.5">
                          <span
                            className="font-mono text-[10px] text-rose-500 max-w-[260px] truncate block hover:whitespace-normal cursor-help"
                            title={item.last_error}
                          >
                            {item.last_error}
                          </span>
                          {item.next_retry_at && (
                            <span className="text-[9px] text-muted-foreground font-mono">
                              Next attempt: {formatTimeAgo(item.next_retry_at)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[10px] font-mono">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
