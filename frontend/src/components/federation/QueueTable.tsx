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
  type QueueCounts,
  type QueueStatusFilter,
  type SyncQueueItem,
} from './federationTypes'
import { QueuePagination } from './QueuePagination'

interface QueueTableProps {
  queue: SyncQueueItem[]
  counts: QueueCounts
  pendingBytes: number
  total: number
  page: number
  limit: number
  totalPages: number
  statusFilter: QueueStatusFilter
  onStatusFilterChange: (status: QueueStatusFilter) => void
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
  onRetryAll: () => void
  onClearCompleted: () => void
}

export function QueueTable({
  queue,
  counts,
  pendingBytes,
  total,
  page,
  limit,
  totalPages,
  statusFilter,
  onStatusFilterChange,
  onPageChange,
  onLimitChange,
  onRetryAll,
  onClearCompleted,
}: QueueTableProps) {
  const filterTabs: Array<{
    key: QueueStatusFilter
    label: string
    count: number
    accent?: string
  }> = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'failed', label: 'Retrying / Failed', count: counts.failed, accent: 'text-rose-500' },
    { key: 'syncing', label: 'In Flight', count: counts.syncing, accent: 'text-sky-500' },
    { key: 'completed', label: 'Completed', count: counts.completed, accent: 'text-emerald-500' },
  ]

  return (
    <div className="space-y-2.5">
      <div className="px-3.5 py-2.5 rounded-xl border border-border/70 bg-card/80 backdrop-blur-xs shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
              <span>Fault-Tolerant Outbox & RTO Monitor</span>
              {counts.failed > 0 && (
                <Badge variant="destructive" className="text-[10px] h-4 px-1.5 py-0 font-mono tabular-nums">
                  {counts.failed} retrying / failed
                </Badge>
              )}
            </h3>
            <p className="text-[11px] text-muted-foreground truncate">
              Outbox survives restarts and partitions; peer recovery auto-drains pending items.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 h-7 rounded-md bg-muted/40 border border-border/60 font-mono text-[11px] tabular-nums text-muted-foreground">
            <HardDrive className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>
              Backlog <strong className="text-foreground">{formatBytes(pendingBytes)}</strong>
            </span>
          </div>

          <Button variant="outline" size="sm" onClick={onRetryAll} className="h-7 px-2.5 text-[11px]">
            <RotateCw className="w-3 h-3 mr-1" /> Retry Pending
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearCompleted}
            className="h-7 px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="w-3 h-3 mr-1" /> Prune Done
          </Button>
        </div>
      </div>

      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border/60 max-w-full overflow-x-auto text-[11px]">
        {filterTabs.map((tab) => {
          const active = statusFilter === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onStatusFilterChange(tab.key)}
              className={`h-6.5 px-2.5 rounded-md font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-background text-foreground font-semibold shadow-2xs border border-border/60'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'
              }`}
            >
              {!active && tab.accent && tab.count > 0 && (
                <span className={`w-1.5 h-1.5 rounded-full bg-current ${tab.accent}`} aria-hidden="true" />
              )}
              <span>{tab.label}</span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="rounded-xl border border-border/70 bg-card/80 backdrop-blur-xs shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/35 border-b border-border/60">
              <tr>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                  Task & Op
                </th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                  Source Object
                </th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                  Remote Target
                </th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                  Size
                </th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                  State & Attempts
                </th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
                  Error Diagnostics / Backoff
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {counts.all === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-muted-foreground">
                    <CheckCircle2 className="w-7 h-7 mx-auto text-emerald-500/60 mb-1.5" />
                    <p className="font-semibold text-xs text-foreground">Outbox is clear</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      All cross-server replication tasks are synchronized with zero pending backlog.
                    </p>
                  </td>
                </tr>
              ) : queue.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">
                    <XCircle className="w-5 h-5 mx-auto text-muted-foreground/40 mb-1" />
                    <p className="font-medium text-xs">No tasks match current filter</p>
                  </td>
                </tr>
              ) : (
                queue.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/25 transition-colors">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 font-mono tabular-nums">
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

                    <td
                      className="px-3 py-2 font-mono truncate max-w-[220px]"
                      title={`${item.source_bucket}/${item.source_key}`}
                    >
                      <span className="text-muted-foreground text-[11px]">{item.source_bucket}/</span>
                      <span className="font-medium text-foreground text-[11px]">{item.source_key}</span>
                    </td>

                    <td
                      className="px-3 py-2 font-mono truncate max-w-[220px]"
                      title={`${item.target_bucket}/${item.target_key}`}
                    >
                      <div className="flex items-center gap-1">
                        <ArrowRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                        <span className="text-muted-foreground text-[11px]">{item.target_bucket}/</span>
                        <span className="font-medium text-foreground text-[11px]">{item.target_key}</span>
                      </div>
                    </td>

                    <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground text-[11px]">
                      {formatBytes(item.size_bytes)}
                    </td>

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
                        <Badge
                          variant="outline"
                          className="text-[10px] text-muted-foreground flex items-center gap-1 w-fit font-mono"
                        >
                          <Clock className="w-3 h-3" /> Queued
                        </Badge>
                      )}
                      {item.status === 'pending' && item.attempts > 0 && (
                        <Badge className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1 w-fit font-mono tabular-nums">
                          <AlertTriangle className="w-3 h-3 text-amber-500" /> Retry {item.attempts}/
                          {item.max_attempts}
                        </Badge>
                      )}
                      {item.status === 'failed' && (
                        <Badge
                          variant="destructive"
                          className="text-[10px] flex items-center gap-1 w-fit font-mono tabular-nums"
                        >
                          <XCircle className="w-3 h-3" /> Failed ({item.attempts}/{item.max_attempts})
                        </Badge>
                      )}
                    </td>

                    <td className="px-3 py-2">
                      {item.last_error ? (
                        <div className="flex flex-col gap-0.5">
                          <span
                            className="font-mono text-[10px] text-rose-500 max-w-[260px] truncate block hover:whitespace-normal cursor-help"
                            title={item.last_error}
                          >
                            {item.last_error}
                          </span>
                          {item.next_retry_at && item.status === 'pending' && (
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

        <QueuePagination
          page={page}
          limit={limit}
          total={total}
          totalPages={totalPages}
          onPageChange={onPageChange}
          onLimitChange={onLimitChange}
        />
      </div>
    </div>
  )
}
