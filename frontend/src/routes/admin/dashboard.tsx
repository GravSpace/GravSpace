import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Database,
  Activity,
  FileUp,
  RefreshCw,
  PieChart,
  BarChart3,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart as RPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { useAuth } from '../../hooks/useAuth'
import { getAuditStreamWsUrl } from '../../lib/utils'

export const Route = createFileRoute('/admin/dashboard')({
  component: DashboardPage,
  head: () => ({ meta: [{ title: 'Dashboard | GravSpace' }] }),
})

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
const CHART_COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6']
const TYPE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#8b5cf6', '#ec4899', '#64748b']

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatSavings(logical: number, physical: number): string {
  if (!logical || logical <= 0) return '0 B (0%)'
  const diff = logical - physical
  if (diff <= 0) return '0 B (0%)'
  const percent = Math.min(100, Math.round((diff / logical) * 100))
  return `${formatSize(diff)} (${percent}%)`
}

type WsStatus = 'connected' | 'connecting' | 'disconnected'

function DashboardPage() {
  const { authFetch, authState } = useAuth()
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<Record<string, any>>({})
  const [storageHistory, setStorageHistory] = useState<any[]>([])
  const [requestTrends, setRequestTrends] = useState<Record<string, any[]>>({})
  const [contentTypes, setContentTypes] = useState<any[]>([])
  const [wsStatus, setWsStatus] = useState<WsStatus>('disconnected')
  const [liveLogs, setLiveLogs] = useState<any[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  const fetchAllData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, storageRes, trendsRes, contentTypeRes] = await Promise.all([
        authFetch(`${API_BASE}/admin/stats`),
        authFetch(`${API_BASE}/admin/analytics/storage?days=30`),
        authFetch(`${API_BASE}/admin/analytics/requests?days=30`),
        authFetch(`${API_BASE}/admin/analytics/content-types`),
      ])
      if (statsRes.ok) setStats(await statsRes.json())
      if (storageRes.ok) setStorageHistory(await storageRes.json())
      if (trendsRes.ok) setRequestTrends(await trendsRes.json())
      if (contentTypeRes.ok) setContentTypes(await contentTypeRes.json())
    } catch (e) {
      console.error('Failed to fetch dashboard data', e)
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  const connectWS = useCallback(() => {
    if (wsRef.current) wsRef.current.close()
    setWsStatus('connecting')
    const token = authState?.token || ''
    const wsUrl = getAuditStreamWsUrl(token)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    ws.onopen = () => setWsStatus('connected')
    ws.onmessage = (event) => {
      try {
        const logEntry = JSON.parse(event.data)
        setLiveLogs((prev) => [logEntry, ...prev].slice(0, 50))

        const status = logEntry.Status || logEntry.status || ''
        if (status === 'success' || status === 'allowed') {
          const action = logEntry.Action || logEntry.action || ''
          const details = logEntry.Details || logEntry.details || {}
          const size = details.size || details.Size || 0

          if (action.includes('PutObject')) {
            setStats(prev => ({
              ...prev,
              total_objects: (prev.total_objects || 0) + 1,
              total_size: (prev.total_size || 0) + size,
              physical_size: (prev.physical_size || 0) + size,
            }))
          } else if (action.includes('DeleteObject')) {
            setStats(prev => ({
              ...prev,
              total_objects: Math.max(0, (prev.total_objects || 0) - 1),
              total_size: Math.max(0, (prev.total_size || 0) - size),
              physical_size: Math.max(0, (prev.physical_size || 0) - size),
            }))
          }
        }
      } catch (e) {
        console.error('Failed to parse WS log entry', e)
      }
    }
    ws.onclose = () => {
      setWsStatus('disconnected')
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) connectWS()
      }, 3000)
    }
    ws.onerror = () => setWsStatus('disconnected')
  }, [authState?.token])

  useEffect(() => {
    fetchAllData()
    connectWS()
    return () => wsRef.current?.close()
  }, [])

  // Build chart data
  const storageByBucket = (() => {
    const map: Record<string, number> = {}
    storageHistory.forEach((s) => { map[s.Bucket] = s.Size })
    return Object.entries(map).map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }))
  })()

  const contentTypePie = contentTypes.map((ct, i) => ({
    name: ct.category,
    value: ct.totalSize,
    fill: TYPE_COLORS[i % TYPE_COLORS.length],
  }))

  // Build trends area chart data
  const trendsChartData = (() => {
    const days = new Set<string>()
    Object.values(requestTrends).forEach((arr) => arr.forEach((d) => days.add(d.day)))
    const sorted = Array.from(days).sort()
    return sorted.map((day) => {
      const row: Record<string, any> = { day: day.split('-').slice(1).join('/') }
      const get3PO = (requestTrends['s3:PutObject'] || []).find((d) => d.day === day)
      const getDO = (requestTrends['s3:DeleteObject'] || []).find((d) => d.day === day)
      const getGO = (requestTrends['s3:GetObject'] || []).find((d) => d.day === day)
      row.Uploads = get3PO?.count || 0
      row.Deletions = getDO?.count || 0
      row.Downloads = getGO?.count || 0
      return row
    })
  })()

  const topStats = [
    {
      label: 'Total Objects',
      value: stats.total_objects || 0,
      icon: Database,
      sub: stats.deduplicated_count ? `${stats.deduplicated_count} deduplicated` : 'No duplicates',
      accent: 'indigo',
    },
    {
      label: 'Logical Capacity',
      value: formatSize(stats.total_size || 0),
      icon: Activity,
      sub: 'Virtual S3 size',
      accent: 'sky',
    },
    {
      label: 'Physical Disk Space',
      value: formatSize(stats.physical_size || 0),
      icon: Database,
      sub: 'Actual space used',
      accent: 'violet',
    },
    {
      label: 'Storage Saved',
      value: formatSavings(stats.total_size, stats.physical_size),
      icon: FileUp,
      sub: 'Deduplication + Gzip',
      accent: 'emerald',
    },
  ]

  const accentMap: Record<string, string> = {
    indigo: 'bg-indigo-500',
    sky: 'bg-sky-500',
    violet: 'bg-violet-500',
    emerald: 'bg-emerald-500',
  }
  const iconBgMap: Record<string, string> = {
    indigo: 'bg-indigo-500/10 text-indigo-500',
    sky: 'bg-sky-500/10 text-sky-500',
    violet: 'bg-violet-500/10 text-violet-500',
    emerald: 'bg-emerald-500/10 text-emerald-500',
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      {/* Header */}
      <header className="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Historical trends and storage distribution</p>
        </div>
        <div className="flex items-center gap-3">
          {/* WS Status */}
          <div className="flex items-center gap-1.5 select-none">
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  wsStatus === 'connected'
                    ? 'animate-ping bg-emerald-400'
                    : wsStatus === 'connecting'
                      ? 'animate-ping bg-amber-400'
                      : 'bg-rose-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  wsStatus === 'connected'
                    ? 'bg-emerald-500'
                    : wsStatus === 'connecting'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                }`}
              />
            </span>
            <span
              className={`text-[9px] uppercase tracking-widest font-bold ${
                wsStatus === 'connected'
                  ? 'text-emerald-500'
                  : wsStatus === 'connecting'
                    ? 'text-amber-500'
                    : 'text-rose-500'
              }`}
            >
              {wsStatus}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAllData}
            disabled={loading}
            className="h-8 border-slate-200 dark:border-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-5 space-y-4">
        {/* TOP STATS */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {topStats.map((stat, i) => (
            <div
              key={stat.label}
              className="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-card p-4 shadow-xs hover:shadow-md hover:border-primary/30 transition-all duration-300"
            >
              <div className={`absolute top-0 left-0 right-0 h-0.5 ${accentMap[stat.accent]}`} />
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                  {stat.label}
                </span>
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${iconBgMap[stat.accent]}`}>
                  <stat.icon className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
                </div>
              </div>
              <div className="text-xl font-bold tracking-tight">{stat.value}</div>
              <p className="text-[10px] text-muted-foreground mt-0.5 opacity-60">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* CHARTS 2-COLUMN */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Left: Pie Charts */}
          <div className="grid gap-3 grid-cols-2">
            {/* Storage by Bucket */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs overflow-hidden flex flex-col">
              <div className="px-4 pt-3 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <PieChart className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-bold tracking-tight">By Bucket</span>
                </div>
              </div>
              <div className="flex-1 min-h-[180px] px-2 pb-3">
                {storageByBucket.length > 0 ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <RPieChart>
                      <Pie
                        data={storageByBucket}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {storageByBucket.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatSize(v)} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                    </RPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full opacity-20 animate-pulse">
                    <PieChart className="w-10 h-10" />
                    <span className="text-[9px] italic mt-1">Loading...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Content Type */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs overflow-hidden flex flex-col">
              <div className="px-4 pt-3 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-bold tracking-tight">By Type</span>
                </div>
              </div>
              <div className="flex-1 min-h-[180px] px-2 pb-3">
                {contentTypePie.length > 0 ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <RPieChart>
                      <Pie
                        data={contentTypePie}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {contentTypePie.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatSize(v)} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                    </RPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full opacity-20 animate-pulse">
                    <BarChart3 className="w-10 h-10" />
                    <span className="text-[9px] italic mt-1">Loading...</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Request Trends Line */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs overflow-hidden flex flex-col">
            <div className="px-4 pt-3 pb-1.5">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-bold tracking-tight">Request Trends (30d)</span>
              </div>
            </div>
            <div className="flex-1 min-h-[200px] px-3 pb-4">
              {trendsChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={trendsChartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="uploads" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="downloads" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="deletions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                    <XAxis dataKey="day" tick={{ fontSize: 8 }} tickCount={10} />
                    <YAxis tick={{ fontSize: 8 }} />
                    <Tooltip />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                    <Area type="monotone" dataKey="Uploads" stroke="#10b981" fill="url(#uploads)" strokeWidth={1.5} dot={false} />
                    <Area type="monotone" dataKey="Downloads" stroke="#3b82f6" fill="url(#downloads)" strokeWidth={1.5} dot={false} />
                    <Area type="monotone" dataKey="Deletions" stroke="#ef4444" fill="url(#deletions)" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full opacity-20 animate-pulse">
                  <Activity className="w-10 h-10" />
                  <span className="text-[9px] italic mt-1">Loading...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Storage Growth Bar Chart */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs overflow-hidden">
          <div className="px-4 pt-3 pb-1.5">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-bold tracking-tight">Storage Growth (30d)</span>
            </div>
          </div>
          <div className="min-h-[200px] px-3 pb-4">
            {storageHistory.length > 0 ? (() => {
              const days = Array.from(new Set(storageHistory.map((s) =>
                s.Timestamp.split('T')[0] || s.Timestamp.split(' ')[0]
              ))).sort()
              const buckets = Array.from(new Set(storageHistory.map((s) => s.Bucket)))
              const chartData = days.map((day) => {
                const row: Record<string, any> = { day: day.split('-').slice(1).join('/') }
                buckets.forEach((b) => {
                  const match = storageHistory.find((s) => s.Bucket === b && s.Timestamp.startsWith(day))
                  row[b] = match?.Size || 0
                })
                return row
              })
              return (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                    <XAxis dataKey="day" tick={{ fontSize: 8 }} tickCount={10} />
                    <YAxis tick={{ fontSize: 8 }} tickFormatter={(v) => formatSize(v)} />
                    <Tooltip formatter={(v: any) => formatSize(v)} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                    {buckets.map((b, i) => (
                      <Bar key={b} dataKey={b} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[2, 2, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )
            })() : (
              <div className="flex flex-col items-center justify-center h-full opacity-20 animate-pulse">
                <BarChart3 className="w-10 h-10" />
                <span className="text-[9px] italic mt-1">Loading...</span>
              </div>
            )}
          </div>
        </div>

        {/* Live System Activity Feed */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs overflow-hidden flex flex-col">
          <div className="px-4 pt-3 pb-1.5 border-b flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
              <span className="text-xs font-bold tracking-tight">Live System Activity Feed</span>
            </div>
            <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800/80 border">
              Real-time
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y font-mono text-[10px] bg-slate-950/20">
            {liveLogs.length > 0 ? (
              liveLogs.map((log, idx) => {
                const action = log.Action || log.action || ''
                const status = log.Status || log.status || ''
                const user = log.User || log.user || 'system'
                const resource = log.Resource || log.resource || '—'
                const timestamp = log.Timestamp || log.timestamp || ''
                
                const formattedTime = timestamp
                  ? new Date(timestamp).toLocaleTimeString()
                  : new Date().toLocaleTimeString()

                const isSuccess = status === 'success' || status === 'allowed'
                
                return (
                  <div key={idx} className="p-2.5 px-4 flex items-center justify-between hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-slate-500 shrink-0 select-none">{formattedTime}</span>
                      <Badge variant="outline" className={`text-[8px] font-bold px-1.5 h-4.5 uppercase tracking-wide shrink-0 ${
                        action.includes('Put')
                          ? 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5'
                          : action.includes('Delete')
                            ? 'border-rose-500/20 text-rose-500 bg-rose-500/5'
                            : 'border-blue-500/20 text-blue-500 bg-blue-500/5'
                      }`}>
                        {action.replace('s3:', '')}
                      </Badge>
                      <span className="text-slate-700 dark:text-slate-300 font-bold shrink-0 truncate max-w-28" title={user}>
                        @{user}
                      </span>
                      <span className="text-muted-foreground truncate" title={resource}>
                        {resource}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                        isSuccess ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10'
                      }`}>
                        {isSuccess ? 'Allowed' : 'Denied'}
                      </span>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-center py-8 text-muted-foreground italic">
                Waiting for incoming system activities...
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
