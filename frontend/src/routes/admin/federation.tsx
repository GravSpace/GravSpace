import { useCallback, useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { useFederationStream } from '@/hooks/useFederationStream'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderSync,
  Network,
  Plus,
  RefreshCw,
  Search,
  Server,
  X,
} from 'lucide-react'
import { ConnectPeerDialog } from '@/components/federation/ConnectPeerDialog'
import { CreateShareDialog } from '@/components/federation/CreateShareDialog'
import { SharesTable } from '@/components/federation/SharesTable'
import { PeersTable } from '@/components/federation/PeersTable'
import { QueueTable } from '@/components/federation/QueueTable'
import { NodeNetworkCard } from '@/components/federation/NodeNetworkCard'
import type {
  CrossServerShare,
  RemoteServer,
  SyncQueueItem,
} from '@/components/federation/federationTypes'

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export const Route = createFileRoute('/admin/federation')({
  component: FederationPage,
  head: () => ({ meta: [{ title: 'Federation & Sync | GravSpace' }] }),
})

function FederationPage() {
  const { authFetch } = useAuth()
  const [activeTab, setActiveTab] = useState<'shares' | 'peers' | 'queue'>('shares')
  const [searchQuery, setSearchQuery] = useState('')
  const [peers, setPeers] = useState<RemoteServer[]>([])
  const [shares, setShares] = useState<CrossServerShare[]>([])
  const [queue, setQueue] = useState<SyncQueueItem[]>([])
  const [localBuckets, setLocalBuckets] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  // Dialog states
  const [openConnectPeer, setOpenConnectPeer] = useState(false)
  const [openCreateShare, setOpenCreateShare] = useState(false)
  const [pingingId, setPingingId] = useState<number | null>(null)
  const [reconcilingId, setReconcilingId] = useState<number | null>(null)

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [peersRes, sharesRes, queueRes, bucketsRes] = await Promise.all([
        authFetch(`${API_BASE}/admin/federation/peers`),
        authFetch(`${API_BASE}/admin/federation/shares`),
        authFetch(`${API_BASE}/admin/federation/queue?limit=150`),
        authFetch(`${API_BASE}/admin/buckets`),
      ])

      if (peersRes.ok) setPeers((await peersRes.json()) || [])
      if (sharesRes.ok) setShares((await sharesRes.json()) || [])
      if (queueRes.ok) setQueue((await queueRes.json()) || [])
      if (bucketsRes.ok) {
        const bData: any[] = (await bucketsRes.json()) || []
        setLocalBuckets(
          bData
            .map((b) => (typeof b === 'string' ? b : b.name || b.Name || ''))
            .filter(Boolean),
        )
      }
    } catch (e: any) {
      if (!silent) toast.error('Failed to load federation data: ' + e.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [authFetch])

  const { isConnected } = useFederationStream({
    onEvent: () => {
      loadData(true)
    },
  })

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handlePingPeer(id: number) {
    setPingingId(id)
    try {
      const res = await authFetch(`${API_BASE}/admin/federation/peers/${id}/ping`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'healthy') {
          const detail = data.s3_latency_ms != null ? ` (Admin: ${data.admin_latency_ms}ms, S3: ${data.s3_latency_ms}ms)` : ` (${data.latency_ms} ms)`
          toast.success(`Peer healthy${detail}`)
        } else if (data.status === 'degraded') {
          toast.warning(`Peer degraded: Admin ${data.admin_ok ? 'OK' : 'Fail'}, S3 ${data.s3_ok ? 'OK' : 'Fail'}`)
        } else {
          toast.warning(`Peer unreachable: ${data.error || 'Connection timed out'}`)
        }
        loadData()
      }
    } catch (err: any) {
      toast.error('Ping failed: ' + err.message)
    } finally {
      setPingingId(null)
    }
  }

  async function handleDeletePeer(id: number, name: string) {
    if (!confirm(`Are you sure you want to remove peer server "${name}"? Associated sync rules will be deleted.`)) return
    try {
      const res = await authFetch(`${API_BASE}/admin/federation/peers/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success(`Peer "${name}" removed.`)
        loadData()
      }
    } catch (err: any) {
      toast.error('Delete failed: ' + err.message)
    }
  }

  async function handleDeleteShare(id: number, name: string) {
    if (!confirm(`Are you sure you want to delete share rule "${name}"? Existing files on remote server will remain.`)) return
    try {
      const res = await authFetch(`${API_BASE}/admin/federation/shares/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success(`Share rule "${name}" removed.`)
        loadData()
      }
    } catch (err: any) {
      toast.error('Delete failed: ' + err.message)
    }
  }

  async function handleReconcile(id: number, name: string) {
    setReconcilingId(id)
    try {
      const res = await authFetch(`${API_BASE}/admin/federation/shares/${id}/reconcile`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Reconciliation initiated for "${name}": ${data.enqueued_count || 0} items enqueued to outbox.`)
        loadData()
      }
    } catch (err: any) {
      toast.error('Reconciliation failed: ' + err.message)
    } finally {
      setReconcilingId(null)
    }
  }

  async function handleRetryQueue() {
    try {
      const res = await authFetch(`${API_BASE}/admin/federation/queue/retry-failed`, { method: 'POST' })
      if (res.ok) {
        toast.success('Retrying all pending and failed tasks.')
        loadData()
      }
    } catch (err: any) {
      toast.error('Retry failed: ' + err.message)
    }
  }

  async function handleClearCompleted() {
    try {
      const res = await authFetch(`${API_BASE}/admin/federation/queue/completed`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Completed tasks pruned.')
        loadData()
      }
    } catch (err: any) {
      toast.error('Clear failed: ' + err.message)
    }
  }

  const pendingQueueCount = queue.filter((q) => q.status === 'pending').length
  const failedQueueCount = queue.filter((q) => q.attempts > 0 && q.status === 'pending').length
  const onlinePeersCount = peers.filter((p) => p.status === 'healthy').length

  const searchPlaceholder =
    activeTab === 'shares'
      ? 'Filter shares by rule name, local bucket, prefix, or remote target...'
      : activeTab === 'peers'
      ? 'Filter peers by server name, endpoint URL, or health status...'
      : 'Filter outbox tasks by object key, bucket, action, or error...'

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      {/* Header */}
      <header className="h-14 border-b bg-card/70 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Network className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-foreground">Federation & Sync</h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                Mesh Node
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cross-cluster bucket replication, selective folder sharing, and fault-tolerant outbox.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {isConnected ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 text-[11px] font-semibold shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Stream</span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-500/10 border border-slate-500/20 text-slate-400 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span>Connecting Stream...</span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData()}
            disabled={loading}
            className="h-8 text-xs font-medium"
            title="Refresh federation state"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenConnectPeer(true)}
            className="h-8 text-xs font-medium"
          >
            <Server className="w-3.5 h-3.5 mr-1.5" />
            <span>Connect Server</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setOpenCreateShare(true)}
            className="h-8 text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            <span>New Share Rule</span>
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto p-4 flex flex-col gap-3.5 max-w-7xl w-full mx-auto">
        <NodeNetworkCard apiBase={API_BASE} />

        {/* Interactive Metric Cards Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Card 1: Remote Peers */}
          <div
            onClick={() => setActiveTab('peers')}
            className={`p-3.5 rounded-xl border bg-card/80 backdrop-blur-xs shadow-xs cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm ${
              activeTab === 'peers' ? 'ring-1 ring-primary/40 border-primary/50' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Remote Peers</span>
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                <Server className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-xl font-bold font-mono text-foreground">{peers.length}</span>
              <span className="text-[11px] text-emerald-500 font-medium">({onlinePeersCount} online)</span>
            </div>
          </div>

          {/* Card 2: Active Shares */}
          <div
            onClick={() => setActiveTab('shares')}
            className={`p-3.5 rounded-xl border bg-card/80 backdrop-blur-xs shadow-xs cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm ${
              activeTab === 'shares' ? 'ring-1 ring-primary/40 border-primary/50' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Shares</span>
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-500">
                <FolderSync className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-xl font-bold font-mono text-foreground">{shares.length}</span>
              <span className="text-[11px] text-muted-foreground">replication rules</span>
            </div>
          </div>

          {/* Card 3: Outbox Queue */}
          <div
            onClick={() => setActiveTab('queue')}
            className={`p-3.5 rounded-xl border bg-card/80 backdrop-blur-xs shadow-xs cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm ${
              activeTab === 'queue' ? 'ring-1 ring-primary/40 border-primary/50' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Outbox Queue</span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-xl font-bold font-mono text-foreground">{pendingQueueCount}</span>
              <span className="text-[11px] text-muted-foreground">pending tasks</span>
            </div>
          </div>

          {/* Card 4: RTO Failover State */}
          <div
            onClick={() => setActiveTab('queue')}
            className={`p-3.5 rounded-xl border bg-card/80 backdrop-blur-xs shadow-xs cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm ${
              failedQueueCount > 0 ? 'border-rose-500/30' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">RTO / Failover</span>
              <div className={`p-1.5 rounded-lg ${failedQueueCount > 0 ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                {failedQueueCount > 0 ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className={`text-xs font-bold ${failedQueueCount > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                {failedQueueCount > 0 ? `${failedQueueCount} Retrying (Backoff)` : 'Mesh Synchronized'}
              </span>
            </div>
          </div>
        </div>

        {/* Toolbar: Navigation Tabs & Search Input */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
          {/* Segmented Control Tabs */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/40 w-fit text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('shares')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'shares'
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FolderSync className="w-3.5 h-3.5 text-primary" />
              <span>Cross-Server Shares</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-muted font-bold">
                {shares.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('peers')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'peers'
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Server className="w-3.5 h-3.5 text-indigo-500" />
              <span>Remote Peers</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-muted font-bold">
                {peers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'queue'
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>Outbox & RTO Monitor</span>
              {pendingQueueCount > 0 ? (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-bold animate-pulse">
                  {pendingQueueCount}
                </span>
              ) : (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-muted font-bold">
                  {queue.length}
                </span>
              )}
            </button>
          </div>

          {/* Search Input Filter */}
          <div className="relative max-w-xs w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 text-xs pl-8 pr-7 bg-card/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Tab Content Panes */}
        {activeTab === 'shares' && (
          <SharesTable
            shares={shares}
            searchQuery={searchQuery}
            reconcilingId={reconcilingId}
            onReconcile={handleReconcile}
            onDelete={handleDeleteShare}
            onCreateNew={() => setOpenCreateShare(true)}
          />
        )}

        {activeTab === 'peers' && (
          <PeersTable
            peers={peers}
            shares={shares}
            searchQuery={searchQuery}
            pingingId={pingingId}
            onPing={handlePingPeer}
            onDelete={handleDeletePeer}
            onConnectNew={() => setOpenConnectPeer(true)}
          />
        )}

        {activeTab === 'queue' && (
          <QueueTable
            queue={queue}
            searchQuery={searchQuery}
            onRetryAll={handleRetryQueue}
            onClearCompleted={handleClearCompleted}
          />
        )}
      </main>

      {/* Dialogs */}
      <ConnectPeerDialog
        open={openConnectPeer}
        onClose={() => setOpenConnectPeer(false)}
        onSuccess={loadData}
        authFetch={authFetch}
        apiBase={API_BASE}
      />

      <CreateShareDialog
        open={openCreateShare}
        onClose={() => setOpenCreateShare(false)}
        onSuccess={loadData}
        localBuckets={localBuckets}
        peers={peers}
        authFetch={authFetch}
        apiBase={API_BASE}
      />
    </div>
  )
}
