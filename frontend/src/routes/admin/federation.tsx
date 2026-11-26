import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { useFederationStream } from '@/hooks/useFederationStream'
import { Clock, FolderSync, Network, Plus, RefreshCw, Search, Server, X } from 'lucide-react'
import { ConfirmActionDialog } from '@/components/federation/ConfirmActionDialog'
import { ConnectPeerDialog } from '@/components/federation/ConnectPeerDialog'
import { CreateShareDialog } from '@/components/federation/CreateShareDialog'
import { FederationMetricsBanner } from '@/components/federation/FederationMetricsBanner'
import { NodeNetworkCard } from '@/components/federation/NodeNetworkCard'
import { PeerFormDialog } from '@/components/federation/PeerFormDialog'
import { PeersTable } from '@/components/federation/PeersTable'
import { QueueTable } from '@/components/federation/QueueTable'
import { ShareFormDialog } from '@/components/federation/ShareFormDialog'
import { SharesTable } from '@/components/federation/SharesTable'
import { useFederationData } from '@/components/federation/useFederationData'
import type { CrossServerShare, RemoteServer } from '@/components/federation/federationTypes'

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export const Route = createFileRoute('/admin/federation')({
  component: FederationPage,
  head: () => ({ meta: [{ title: 'Federation & Sync | GravSpace' }] }),
})

function FederationPage() {
  const { authFetch } = useAuth()
  const [activeTab, setActiveTab] = useState<'shares' | 'peers' | 'queue'>('shares')
  const [searchQuery, setSearchQuery] = useState('')
  const [openConnectPeer, setOpenConnectPeer] = useState(false)
  const [editingPeer, setEditingPeer] = useState<RemoteServer | null>(null)
  const [openCreateShare, setOpenCreateShare] = useState(false)
  const [editingShare, setEditingShare] = useState<CrossServerShare | null>(null)

  const {
    peers, shares, queue, queueLimit, setQueueLimit, setQueuePage,
    queueStatus, setQueueStatus, queueMeta, localBuckets, loading, pingingId,
    reconcilingId, pendingDelete, setPendingDelete, loadData, scheduleStreamRefresh,
    handlePingPeer, handleToggleShare, executePendingDelete, handleReconcile,
    handleRetryQueue, handleClearCompleted,
  } = useFederationData({ apiBase: API_BASE, authFetch, activeTab, searchQuery })

  const { isConnected } = useFederationStream({
    onEvent: (msg) => scheduleStreamRefresh(msg.event),
  })

  const pendingQueueCount = queueMeta.counts.pending + queueMeta.counts.syncing + queueMeta.counts.failed
  const failedQueueCount = queueMeta.counts.failed
  const onlinePeersCount = peers.filter((p) => p.status === 'healthy').length

  const searchPlaceholder =
    activeTab === 'shares'
      ? 'Filter shares by rule name, local bucket, prefix, or remote target...'
      : activeTab === 'peers'
      ? 'Filter peers by server name, endpoint URL, or health status...'
      : 'Filter outbox tasks by object key, bucket, action, or error...'

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      <header className="min-h-14 h-auto py-2.5 sm:py-0 border-b bg-card/70 backdrop-blur-md px-3.5 sm:px-6 flex flex-wrap items-center justify-between gap-2.5 sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
            <Network className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-foreground">Federation & Sync</h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                Mesh Node
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-muted-foreground">
              Cross-cluster bucket replication, selective folder sharing, and fault-tolerant outbox.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
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

          <Button variant="outline" size="sm" onClick={() => loadData()} disabled={loading} className="h-8 text-xs font-medium" aria-label="Refresh federation">
            <RefreshCw className={`w-3.5 h-3.5 sm:mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpenConnectPeer(true)} className="h-8 text-xs font-medium">
            <Server className="w-3.5 h-3.5 mr-1.5" />
            <span>Connect Server</span>
          </Button>
          <Button size="sm" onClick={() => setOpenCreateShare(true)} className="h-8 text-xs font-medium">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            <span>New Share Rule</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-3.5 sm:p-4 flex flex-col gap-3.5 max-w-7xl w-full mx-auto">
        <NodeNetworkCard apiBase={API_BASE} />

        <FederationMetricsBanner
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          peersCount={peers.length}
          onlinePeersCount={onlinePeersCount}
          sharesCount={shares.length}
          pendingQueueCount={pendingQueueCount}
          failedQueueCount={failedQueueCount}
        />

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/40 w-fit text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('shares')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'shares' ? 'bg-card text-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FolderSync className="w-3.5 h-3.5 text-primary" />
              <span>Cross-Server Shares</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-muted font-bold">{shares.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('peers')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'peers' ? 'bg-card text-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Server className="w-3.5 h-3.5 text-indigo-500" />
              <span>Remote Peers</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-muted font-bold">{peers.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'queue' ? 'bg-card text-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>Outbox & RTO Monitor</span>
              {pendingQueueCount > 0 ? (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-bold animate-pulse">
                  {pendingQueueCount}
                </span>
              ) : (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-muted font-bold">{queueMeta.counts.all}</span>
              )}
            </button>
          </div>

          <div className="relative max-w-xs w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setQueuePage(1)
              }}
              placeholder={searchPlaceholder}
              className="h-8 text-xs pl-8 pr-7 bg-card/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setQueuePage(1)
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {activeTab === 'shares' && (
          <SharesTable
            shares={shares}
            searchQuery={searchQuery}
            reconcilingId={reconcilingId}
            onReconcile={handleReconcile}
            onEdit={setEditingShare}
            onToggle={handleToggleShare}
            onDelete={(id, name) => setPendingDelete({ kind: 'share', id, name })}
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
            onEdit={setEditingPeer}
            onDelete={(id, name) => setPendingDelete({ kind: 'peer', id, name })}
            onConnectNew={() => setOpenConnectPeer(true)}
          />
        )}

        {activeTab === 'queue' && (
          <QueueTable
            queue={queue}
            counts={queueMeta.counts}
            pendingBytes={queueMeta.pending_bytes}
            total={queueMeta.total}
            page={queueMeta.page}
            limit={queueLimit}
            totalPages={queueMeta.total_pages}
            statusFilter={queueStatus}
            onStatusFilterChange={(next) => { setQueueStatus(next); setQueuePage(1) }}
            onPageChange={setQueuePage}
            onLimitChange={(nextLimit) => { setQueueLimit(nextLimit); setQueuePage(1) }}
            onRetryAll={handleRetryQueue}
            onClearCompleted={handleClearCompleted}
          />
        )}
      </main>

      <ConnectPeerDialog open={openConnectPeer} onClose={() => setOpenConnectPeer(false)} onSuccess={loadData} authFetch={authFetch} apiBase={API_BASE} />
      <PeerFormDialog open={editingPeer !== null} peer={editingPeer} onClose={() => setEditingPeer(null)} onSuccess={loadData} authFetch={authFetch} apiBase={API_BASE} />
      <CreateShareDialog open={openCreateShare} onClose={() => setOpenCreateShare(false)} onSuccess={loadData} localBuckets={localBuckets} peers={peers} authFetch={authFetch} apiBase={API_BASE} />
      <ShareFormDialog open={editingShare !== null} share={editingShare} onClose={() => setEditingShare(null)} onSuccess={loadData} localBuckets={localBuckets} peers={peers} authFetch={authFetch} apiBase={API_BASE} />

      <ConfirmActionDialog
        open={pendingDelete !== null}
        title={pendingDelete?.kind === 'peer' ? `Remove peer "${pendingDelete.name}"?` : `Delete share rule "${pendingDelete?.name ?? ''}"?`}
        description={
          pendingDelete?.kind === 'peer'
            ? 'Removing this remote peer permanently deletes all cross-server share rules linked to it.'
            : 'Deleting this share rule stops future replication. Files already replicated on the remote peer remain intact.'
        }
        confirmLabel={pendingDelete?.kind === 'peer' ? 'Remove peer permanently' : 'Delete share rule'}
        confirmAgentHint={pendingDelete?.kind === 'peer' ? 'Removes the remote peer and its linked share rules' : 'Deletes the replication share rule'}
        onConfirm={executePendingDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
