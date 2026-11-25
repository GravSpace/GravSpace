import { useState, useMemo } from 'react'
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { toast } from 'sonner'
import { type AccessRequest, type RequestStatus, getEnvTheme } from './vaultTypes'

interface Props {
  requests: AccessRequest[]
  loading: boolean
  apiBase: string
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  onRefresh: () => void
  onReviewed?: () => void
}

export function AccessRequestsTable({
  requests,
  loading,
  apiBase,
  authFetch,
  onRefresh,
  onReviewed,
}: Props) {
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (filterStatus === 'all') return true
      return r.status === filterStatus
    })
  }, [requests, filterStatus])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginatedRequests = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  async function handleApprove(id: string, durationMinutes: number) {
    setProcessingId(id)
    try {
      const res = await authFetch(`${apiBase}/admin/vault/access-requests/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_minutes: durationMinutes }),
      })
      if (!res.ok) throw new Error('Failed to approve request')
      toast.success('Access request approved. Grant is now active.')
      if (onReviewed) onReviewed()
      else onRefresh()
    } catch (err: any) {
      toast.error(err.message || 'Error approving request.')
    } finally {
      setProcessingId(null)
    }
  }

  async function handleReject(id: string) {
    const reason = window.prompt('Alasan penolakan (opsional):', 'Policy violation or insufficient justification')
    if (reason === null) return

    setProcessingId(id)
    try {
      const res = await authFetch(`${apiBase}/admin/vault/access-requests/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: reason }),
      })
      if (!res.ok) throw new Error('Failed to reject request')
      toast.info('Access request rejected.')
      if (onReviewed) onReviewed()
      else onRefresh()
    } catch (err: any) {
      toast.error(err.message || 'Error rejecting request.')
    } finally {
      setProcessingId(null)
    }
  }

  function renderStatusBadge(status: RequestStatus, grantedUntil?: string) {
    if (status === 'approved') {
      const isExpired = grantedUntil ? new Date(grantedUntil).getTime() < Date.now() : false
      if (isExpired) {
        return (
          <Badge variant="outline" className="text-[10px] bg-slate-500/10 text-slate-500 border-slate-500/20">
            Expired
          </Badge>
        )
      }
      return (
        <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1 font-semibold">
          <CheckCircle2 className="w-3 h-3" /> Approved
        </Badge>
      )
    }
    if (status === 'pending') {
      return (
        <Badge className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1 font-semibold animate-pulse">
          <Clock className="w-3 h-3" /> Pending Review
        </Badge>
      )
    }
    if (status === 'rejected') {
      return (
        <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 gap-1">
          <XCircle className="w-3 h-3" /> Rejected
        </Badge>
      )
    }
    return <Badge variant="outline" className="text-[10px]">{status}</Badge>
  }

  return (
    <div className="space-y-3">
      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-card p-3 rounded-xl border border-border/60 shadow-xs">
        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
          {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(s)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                filterStatus === s
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {s === 'all' ? 'All Requests' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading} className="h-7 text-xs gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground font-medium">
              <tr>
                <th className="py-2.5 px-4">Requester</th>
                <th className="py-2.5 px-4">Target Resource</th>
                <th className="py-2.5 px-4">Environment</th>
                <th className="py-2.5 px-4">Duration & Justification</th>
                <th className="py-2.5 px-4">Status & Validity</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <ShieldAlert className="w-7 h-7 mx-auto opacity-30 mb-2" />
                    <p className="text-xs font-medium">No access requests found</p>
                    <p className="text-[11px] opacity-60">Pending requests for protected secrets will appear here.</p>
                  </td>
                </tr>
              ) : (
                paginatedRequests.map((r) => {
                  const envTheme = getEnvTheme(r.environment)
                  const isPending = r.status === 'pending'
                  const isBusy = processingId === r.id

                  return (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[11px]">
                            {r.requester.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-foreground block">{r.requester}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{r.created_at.slice(0, 16)}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono font-medium text-foreground">
                        {r.secret_name ? (
                          <span className="text-primary font-bold">{r.secret_name}</span>
                        ) : (
                          <span className="text-muted-foreground italic">Environment Wide</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <Badge variant="outline" className={`text-[10px] font-medium ${envTheme.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${envTheme.dot} mr-1 inline-block`} />
                          {r.environment}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <span className="font-semibold text-[11px] text-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          {r.requested_duration_minutes} Minutes
                        </span>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={r.justification}>
                          {r.justification}
                        </p>
                      </td>

                      <td className="py-3 px-4">
                        {renderStatusBadge(r.status, r.access_granted_until)}
                        {r.access_granted_until && (
                          <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">
                            Until: {r.access_granted_until.slice(11, 16)} UTC
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReject(r.id)}
                              disabled={isBusy}
                              className="h-7 text-[11px] text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border-rose-500/20"
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleApprove(r.id, r.requested_duration_minutes)}
                              disabled={isBusy}
                              className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                            >
                              <ShieldCheck className="w-3 h-3" /> Approve
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">Reviewed</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-border/50 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>
                Showing <strong className="text-foreground">{Math.min(filtered.length, (page - 1) * pageSize + 1)}</strong>–
                <strong className="text-foreground">{Math.min(filtered.length, page * pageSize)}</strong> of{' '}
                <strong className="text-foreground">{filtered.length}</strong> requests
              </span>
              <div className="h-3 w-[1px] bg-border/60 mx-1 hidden sm:block" />
              <div className="flex items-center gap-1.5 hidden sm:flex">
                <span className="text-[11px]">Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                  className="h-6 px-1.5 rounded-md border border-border/60 bg-background text-foreground text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  {[5, 10, 20, 50].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage(1)}
                  disabled={page <= 1}
                  className="h-7 w-7 text-xs disabled:opacity-40"
                  title="First Page"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-7 w-7 text-xs disabled:opacity-40"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>

                <span className="px-2 text-[11px] font-medium text-foreground">
                  {page} / {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-7 w-7 text-xs disabled:opacity-40"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages}
                  className="h-7 w-7 text-xs disabled:opacity-40"
                  title="Last Page"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
