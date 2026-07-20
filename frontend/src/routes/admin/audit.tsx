import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  RefreshCw, Wifi, WifiOff, Search, ChevronLeft, ChevronRight,
  ShieldOff, CheckCircle2, XCircle, Filter, X,
} from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { useAuth } from '../../hooks/useAuth'
import { getAuditStreamWsUrl } from '../../lib/utils'

export const Route = createFileRoute('/admin/audit')({
  component: AuditPage,
  head: () => ({ meta: [{ title: 'Audit Logs | GravSpace' }] }),
})

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
// WebSocket must connect directly to the backend (SSR proxy does not support WS upgrade)
const WS_BASE = import.meta.env.VITE_WS_BASE ?? 'ws://localhost:8080'
const LIMIT = 50

// ─── Backend response shape (Go struct without json tags = PascalCase) ──────
interface AuditLogRecord {
  ID: number
  Timestamp: string
  Username: string
  Action: string
  Resource: string
  Result: string   // "success" | "denied"
  IP: string
  UserAgent: string
  Details: string  // JSON string
}

// ─── Real-time WebSocket shape (from audit.go Log()) ─────────────────────
interface AuditLogWS {
  timestamp: string
  user: string
  action: string
  resource: string
  result: string
  ip: string
  user_agent?: string
  details?: Record<string, string>
}

// Normalise both shapes to a common display format
interface NormalisedEntry {
  id: string
  timestamp: string
  username: string
  action: string
  resource: string
  result: string
  ip: string
  isLive?: boolean
}

function normaliseDB(r: AuditLogRecord): NormalisedEntry {
  return {
    id: String(r.ID),
    timestamp: r.Timestamp,
    username: r.Username || 'anonymous',
    action: r.Action,
    resource: r.Resource,
    result: r.Result,
    ip: r.IP,
  }
}

function normaliseWS(r: AuditLogWS): NormalisedEntry {
  return {
    id: `ws-${Date.now()}-${Math.random()}`,
    timestamp: r.timestamp,
    username: r.user || 'anonymous',
    action: r.action,
    resource: r.resource,
    result: r.result,
    ip: r.ip,
    isLive: true,
  }
}

// ─── Action colour map ────────────────────────────────────────────────────
function getActionStyle(action: string): string {
  const a = action.toLowerCase()
  if (a.includes('put') || a.includes('create') || a.includes('upload'))
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
  if (a.includes('get') || a.includes('list') || a.includes('head') || a.includes('download'))
    return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
  if (a.includes('delete') || a.includes('remove'))
    return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
  if (a.includes('copy'))
    return 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
  if (a.includes('login') || a.includes('auth'))
    return 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20'
  return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
}

function buildWsUrl(token: string): string {
  return getAuditStreamWsUrl(token)
}

function AuditPage() {
  const { authFetch, authState } = useAuth()
  const [logs, setLogs] = useState<NormalisedEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [search, setSearch] = useState('')
  const [filterResult, setFilterResult] = useState<'' | 'success' | 'denied'>('')
  const wsRef = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // ─── Fetch paginated audit logs ─────────────────────────────────────────
  const fetchLogs = useCallback(async (off = 0) => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/admin/audit-logs?limit=${LIMIT}&offset=${off}`)
      if (res.ok) {
        const data: AuditLogRecord[] = (await res.json()) || []
        const normalised = data.map(normaliseDB)
        setLogs(prev => off === 0 ? normalised : [...prev, ...normalised])
        setHasMore(data.length === LIMIT)
        setOffset(off)
      }
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  // ─── WebSocket for live streaming ───────────────────────────────────────
  useEffect(() => {
    fetchLogs(0)

    const token = (authState as any)?.token || ''
    const wsUrl = buildWsUrl(token)

    let ws: WebSocket
    let reconnectTimer: ReturnType<typeof setTimeout>

    function connect() {
      ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => setWsConnected(true)
      ws.onclose = () => {
        setWsConnected(false)
        // Auto-reconnect after 3 s
        reconnectTimer = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()
      ws.onmessage = (e) => {
        try {
          const entry: AuditLogWS = JSON.parse(e.data)
          setLogs(prev => [{ ...normaliseWS(entry) }, ...prev].slice(0, 500))
        } catch { /* ignore malformed */ }
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, [])

  // ─── Derived filtered list ──────────────────────────────────────────────
  const filtered = logs.filter(l => {
    const q = search.toLowerCase()
    const matchSearch = !q || [l.username, l.action, l.resource, l.ip]
      .some(v => v?.toLowerCase().includes(q))
    const matchResult = !filterResult || l.result === filterResult
    return matchSearch && matchResult
  })

  function formatTime(ts: string) {
    if (!ts) return '—'
    const d = new Date(ts)
    return isNaN(d.getTime()) ? ts : d.toLocaleString()
  }

  function prevPage() {
    const newOff = Math.max(0, offset - LIMIT)
    fetchLogs(newOff)
  }

  function nextPage() {
    fetchLogs(offset + LIMIT)
  }

  const hasActiveFilter = !!search || !!filterResult

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <header className="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Audit Logs</h1>
          <p className="text-xs text-muted-foreground">Compliance and security event history.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Live indicator */}
          <div className="flex items-center gap-1.5">
            {wsConnected ? (
              <><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <Wifi className="w-3.5 h-3.5 text-emerald-500" /></>
            ) : (
              <><div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <WifiOff className="w-3.5 h-3.5 text-rose-500" /></>
            )}
            <span className={`text-[9px] uppercase font-bold tracking-widest ${wsConnected ? 'text-emerald-500' : 'text-rose-500'}`}>
              {wsConnected ? 'Live' : 'Offline'}
            </span>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search user, action, resource..."
              className="h-8 w-52 pl-8 text-xs"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Result filter */}
          <div className="flex gap-1">
            <Button
              variant={filterResult === '' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 text-xs px-2.5"
              onClick={() => setFilterResult('')}
            >
              <Filter className="w-3 h-3 mr-1" /> All
            </Button>
            <Button
              variant={filterResult === 'success' ? 'default' : 'ghost'}
              size="sm"
              className={`h-8 text-xs px-2.5 ${filterResult === 'success' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
              onClick={() => setFilterResult(filterResult === 'success' ? '' : 'success')}
            >
              <CheckCircle2 className="w-3 h-3 mr-1" /> Success
            </Button>
            <Button
              variant={filterResult === 'denied' ? 'destructive' : 'ghost'}
              size="sm"
              className="h-8 text-xs px-2.5"
              onClick={() => setFilterResult(filterResult === 'denied' ? '' : 'denied')}
            >
              <XCircle className="w-3 h-3 mr-1" /> Denied
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={() => fetchLogs(0)} disabled={loading} className="h-8">
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </header>

      {/* ─── Table ───────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto p-4 flex flex-col gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-card shadow-sm flex-1">
          <div className="overflow-x-auto h-full">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground w-44">Timestamp</th>
                  <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground w-32">User</th>
                  <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground w-44">Action</th>
                  <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground">Resource</th>
                  <th className="px-4 py-3 text-center font-bold uppercase tracking-wider text-muted-foreground w-24">Result</th>
                  <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground w-32">Origin IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filtered.map((log) => (
                  <tr
                    key={log.id}
                    className={`hover:bg-muted/20 transition-colors ${log.isLive ? 'animate-in fade-in slide-in-from-top-1 duration-300' : ''}`}
                  >
                    {/* Timestamp */}
                    <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {log.isLive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                        )}
                        {formatTime(log.timestamp)}
                      </div>
                    </td>

                    {/* User */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                          {log.username.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="font-semibold truncate max-w-[80px]" title={log.username}>
                          {log.username}
                        </span>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-2.5">
                      <Badge
                        variant="outline"
                        className={`text-[9px] font-bold font-mono px-1.5 border ${getActionStyle(log.action)}`}
                      >
                        {log.action}
                      </Badge>
                    </td>

                    {/* Resource */}
                    <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground max-w-[240px]">
                      <span className="truncate block" title={log.resource}>
                        {log.resource || '—'}
                      </span>
                    </td>

                    {/* Result */}
                    <td className="px-4 py-2.5 text-center">
                      {log.result === 'success' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-2.5 h-2.5" /> OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-red-500/10 text-red-600 dark:text-red-400">
                          <XCircle className="w-2.5 h-2.5" /> Denied
                        </span>
                      )}
                    </td>

                    {/* IP */}
                    <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground italic">
                      {log.ip || '—'}
                    </td>
                  </tr>
                ))}

                {/* Empty state */}
                {filtered.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-20 text-center">
                      <div className="flex flex-col items-center gap-3 opacity-25">
                        <ShieldOff className="w-12 h-12" />
                        <div>
                          <p className="text-sm font-bold">
                            {hasActiveFilter ? 'No matching events' : 'Safe and Sound'}
                          </p>
                          <p className="text-xs mt-0.5">
                            {hasActiveFilter ? 'Try clearing filters' : 'No audit events recorded yet.'}
                          </p>
                        </div>
                        {hasActiveFilter && (
                          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFilterResult('') }}>
                            Clear filters
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {/* Loading skeleton rows */}
                {loading && logs.length === 0 && (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={`skel-${i}`}>
                      <td colSpan={6} className="px-4 py-2.5">
                        <div className="h-5 rounded-md bg-muted/50 animate-pulse" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── Footer: status + pagination ─────────────────────────────── */}
        <div className="flex items-center justify-between px-1 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-400'}`} />
              <span className="text-[10px] text-muted-foreground font-medium">
                {wsConnected ? 'Real-time logging active' : 'Disconnected — reconnecting...'}
              </span>
            </div>
            {hasActiveFilter && (
              <span className="text-[10px] text-muted-foreground">
                Showing <span className="font-bold text-foreground">{filtered.length}</span> of{' '}
                <span className="font-bold text-foreground">{logs.length}</span> loaded
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground">
              {offset + 1}–{offset + Math.min(LIMIT, logs.length)} of {hasMore ? `${offset + logs.length}+` : offset + logs.length}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-slate-200"
                disabled={offset === 0 || loading}
                onClick={prevPage}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-slate-200"
                disabled={!hasMore || loading}
                onClick={nextPage}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div ref={bottomRef} />
      </main>
    </div>
  )
}
