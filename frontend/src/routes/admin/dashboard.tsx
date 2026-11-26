import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Database, FileUp, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { useAuth } from '../../hooks/useAuth'
import { fetchWsTicketOrToken, getAuditStreamWsUrl } from '../../lib/utils'
import {
  formatSize,
  formatSavings,
  type WsStatus,
  CHART_COLORS,
  TYPE_COLORS,
} from '../../components/dashboard/dashboardTypes'
import {
  DashboardStatCards,
  type StatCardItem,
} from '../../components/dashboard/DashboardStatCards'
import { DashboardCharts } from '../../components/dashboard/DashboardCharts'
import { LiveActivityFeed } from '../../components/dashboard/LiveActivityFeed'
import { Archive } from '#/lib/iconsax-adapter'

export const Route = createFileRoute('/admin/dashboard')({
  component: DashboardPage,
  head: () => ({ meta: [{ title: 'Dashboard | GravSpace' }] }),
})

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

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
  const wsConnectSeqRef = useRef(0)

  const fetchAllData = useCallback(async () => {
    if (!authState.isAuthenticated) return
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
    } catch (e: any) {
      if (e?.message !== 'Not authenticated') {
        console.error('Failed to fetch dashboard data', e)
      }
    } finally {
      setLoading(false)
    }
  }, [authFetch, authState.isAuthenticated])

  const connectWS = useCallback(async () => {
    if (!authState.isAuthenticated) return
    const connectSeq = ++wsConnectSeqRef.current
    if (wsRef.current) wsRef.current.close()
    setWsStatus('connecting')
    const token = authState?.token || ''
    const { credential, useTicket } = await fetchWsTicketOrToken(authFetch, token)
    if (wsConnectSeqRef.current !== connectSeq || !credential) return
    const wsUrl = getAuditStreamWsUrl(credential, useTicket)
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
            setStats((prev) => ({
              ...prev,
              total_objects: (prev.total_objects || 0) + 1,
              total_size: (prev.total_size || 0) + size,
              physical_size: (prev.physical_size || 0) + size,
            }))
          } else if (action.includes('DeleteObject')) {
            setStats((prev) => ({
              ...prev,
              total_objects: Math.max(0, (prev.total_objects || 0) - 1),
              total_size: Math.max(0, (prev.total_size || 0) - size),
              physical_size: Math.max(0, (prev.physical_size || 0) - size),
            }))
          }
        }
      } catch { }
    }
    ws.onclose = () => setWsStatus('disconnected')
    ws.onerror = () => setWsStatus('disconnected')
  }, [authFetch, authState?.token, authState.isAuthenticated])

  useEffect(() => {
    if (!authState.isAuthenticated) return
    fetchAllData()
    void connectWS()
    return () => {
      wsConnectSeqRef.current += 1
      if (wsRef.current) wsRef.current.close()
    }
  }, [authState.isAuthenticated, fetchAllData, connectWS])

  const topStats: StatCardItem[] = [
    {
      label: 'Logical Size',
      value: formatSize(stats.total_size || 0),
      sub: `${stats.total_buckets || 0} active buckets`,
      icon: Database,
      accent: 'indigo',
    },
    {
      label: 'Physical Size',
      value: formatSize(stats.physical_size || stats.total_size || 0),
      sub: `Saved: ${formatSavings(stats.total_size || 0, stats.physical_size || stats.total_size || 0)}`,
      icon: Database,
      accent: 'emerald',
    },
    {
      label: 'Total Objects',
      value: (stats.total_objects || 0).toLocaleString(),
      sub: 'Stored across system',
      icon: FileUp,
      accent: 'amber',
    },
    {
      label: 'Total Buckets',
      value: (stats.total_buckets || 0).toLocaleString(),
      sub: 'Namespace containers',
      icon: Archive,
      accent: 'violet',
    },
  ]

  const storageByBucket = (stats.buckets || stats.Buckets || []).map((b: any, i: number) => ({
    name: b.name || b.Name || '',
    value: b.size ?? b.Size ?? 0,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }))

  const contentTypePie = contentTypes.slice(0, 6).map((ct: any, i: number) => {
    const type = String(ct.ContentType || ct.content_type || '')
    return {
      name: type ? type.split('/')[1] || type : 'unknown',
      value: Number(ct.TotalSize ?? ct.size ?? 0),
      fill: TYPE_COLORS[i % TYPE_COLORS.length],
    }
  })

  // Generate continuous 30-day timeline (29 days ago to today)
  const last30Days: string[] = []
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    last30Days.push(d.toISOString().slice(0, 10))
  }

  const allDays = Array.from(
    new Set([
      ...last30Days,
      ...Object.values(requestTrends)
        .flat()
        .map((r: any) => r?.Day || r?.day)
        .filter(Boolean),
    ]),
  ).sort()

  const trendsChartData = allDays.map((day) => {
    const row: Record<string, any> = { day: day ? day.split('-').slice(1).join('/') : '' }
    let uploads = 0
    let downloads = 0
    let deletions = 0

    Object.keys(requestTrends).forEach((action) => {
      const match = requestTrends[action]?.find((r: any) => (r?.Day || r?.day) === day)
      const count = Number(match?.Count ?? match?.count ?? 0)
      const cleanAction = action.replace('s3:', '')
      row[cleanAction] = count

      if (action.includes('PutObject')) uploads += count
      else if (action.includes('GetObject')) downloads += count
      else if (action.includes('DeleteObject')) deletions += count
    })

    row.Uploads = uploads
    row.Downloads = downloads
    row.Deletions = deletions
    return row
  })

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      <header className="min-h-14 sm:min-h-16 h-auto py-2.5 sm:py-0 border-b bg-card/50 backdrop-blur-md px-3.5 sm:px-6 flex flex-wrap items-center justify-between gap-2.5 sticky top-0 z-10">
        <div>
          <h1 className="text-base sm:text-lg font-semibold tracking-tight">System Overview</h1>
          <p className="hidden sm:block text-xs text-muted-foreground">Real-time health, operations, and telemetry metrics.</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-800 bg-background text-[11px] font-mono">
            <span
              className={`h-2 w-2 rounded-full ${wsStatus === 'connected'
                  ? 'bg-emerald-500 animate-pulse'
                  : wsStatus === 'connecting'
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-rose-500'
                }`}
            />
            <span
              className={`capitalize font-bold ${wsStatus === 'connected'
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

      <main className="flex-1 overflow-auto p-3.5 sm:p-5 space-y-4">
        <DashboardStatCards stats={topStats} />

        <DashboardCharts
          storageByBucket={storageByBucket}
          contentTypePie={contentTypePie}
          trendsChartData={trendsChartData}
          storageHistory={storageHistory}
        />

        <LiveActivityFeed liveLogs={liveLogs} />
      </main>
    </div>
  )
}
