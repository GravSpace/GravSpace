import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  CrossServerShare,
  PaginatedSyncQueueResponse,
  QueueStatusFilter,
  RemoteServer,
  SyncQueueItem,
} from './federationTypes'

export interface PendingConfirmAction {
  kind: 'peer' | 'share'
  id: number
  name: string
}

interface UseFederationDataOptions {
  apiBase: string
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  activeTab: 'shares' | 'peers' | 'queue'
  searchQuery: string
}

export function useFederationData({
  apiBase,
  authFetch,
  activeTab,
  searchQuery,
}: UseFederationDataOptions) {
  const [peers, setPeers] = useState<RemoteServer[]>([])
  const [shares, setShares] = useState<CrossServerShare[]>([])
  const [queue, setQueue] = useState<SyncQueueItem[]>([])
  const [queuePage, setQueuePage] = useState(1)
  const [queueLimit, setQueueLimit] = useState(25)
  const [queueStatus, setQueueStatus] = useState<QueueStatusFilter>('all')
  const [queueMeta, setQueueMeta] = useState<Omit<PaginatedSyncQueueResponse, 'items'>>({
    total: 0,
    page: 1,
    limit: 25,
    total_pages: 1,
    counts: { all: 0, pending: 0, syncing: 0, completed: 0, failed: 0 },
    pending_bytes: 0,
  })
  const [localBuckets, setLocalBuckets] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [pingingId, setPingingId] = useState<number | null>(null)
  const [reconcilingId, setReconcilingId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingConfirmAction | null>(null)

  const refreshTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const fetchPeers = useCallback(async () => {
    const res = await authFetch(`${apiBase}/admin/federation/peers`)
    if (res.ok) setPeers((await res.json()) || [])
  }, [apiBase, authFetch])

  const fetchShares = useCallback(async () => {
    const res = await authFetch(`${apiBase}/admin/federation/shares`)
    if (res.ok) setShares((await res.json()) || [])
  }, [apiBase, authFetch])

  const fetchQueue = useCallback(async () => {
    const queueParams = new URLSearchParams({
      paginated: 'true',
      page: String(queuePage),
      limit: String(queueLimit),
    })
    if (queueStatus !== 'all') queueParams.set('status', queueStatus)
    if (activeTab === 'queue' && searchQuery.trim()) queueParams.set('q', searchQuery.trim())

    const res = await authFetch(`${apiBase}/admin/federation/queue?${queueParams.toString()}`)
    if (res.ok) {
      const qData: PaginatedSyncQueueResponse = await res.json()
      setQueue(qData.items || [])
      setQueueMeta({
        total: qData.total ?? 0,
        page: qData.page ?? 1,
        limit: qData.limit ?? queueLimit,
        total_pages: qData.total_pages ?? 1,
        counts: qData.counts ?? { all: 0, pending: 0, syncing: 0, completed: 0, failed: 0 },
        pending_bytes: qData.pending_bytes ?? 0,
      })
    }
  }, [apiBase, authFetch, queuePage, queueLimit, queueStatus, activeTab, searchQuery])

  const fetchBuckets = useCallback(async () => {
    const res = await authFetch(`${apiBase}/admin/buckets`)
    if (res.ok) {
      const bData: any[] = (await res.json()) || []
      setLocalBuckets(
        bData.map((b) => (typeof b === 'string' ? b : b.name || b.Name || '')).filter(Boolean),
      )
    }
  }, [apiBase, authFetch])

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        await Promise.all([fetchPeers(), fetchShares(), fetchQueue(), fetchBuckets()])
      } catch (e: any) {
        if (!silent) toast.error('Failed to load federation data: ' + e.message)
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [fetchPeers, fetchShares, fetchQueue, fetchBuckets],
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    return () => {
      Object.values(refreshTimers.current).forEach(clearTimeout)
    }
  }, [])

  const scheduleStreamRefresh = useCallback(
    (eventType: string) => {
      const bucket = eventType.startsWith('peer')
        ? 'peers'
        : eventType.startsWith('share')
        ? 'shares'
        : 'queue'

      clearTimeout(refreshTimers.current[bucket])
      refreshTimers.current[bucket] = setTimeout(() => {
        if (bucket === 'peers') {
          void fetchPeers()
        } else if (bucket === 'shares') {
          void fetchShares()
          void fetchQueue()
        } else {
          void fetchQueue()
          void fetchShares()
        }
      }, 300)
    },
    [fetchPeers, fetchShares, fetchQueue],
  )

  async function handlePingPeer(id: number) {
    setPingingId(id)
    try {
      const res = await authFetch(`${apiBase}/admin/federation/peers/${id}/ping`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'healthy') {
          const detail =
            data.s3_latency_ms != null
              ? ` (Admin: ${data.admin_latency_ms}ms, S3: ${data.s3_latency_ms}ms)`
              : ` (${data.latency_ms} ms)`
          toast.success(`Peer healthy${detail}`)
        } else if (data.status === 'degraded') {
          toast.warning(`Peer degraded: Admin ${data.admin_ok ? 'OK' : 'Fail'}, S3 ${data.s3_ok ? 'OK' : 'Fail'}`)
        } else {
          toast.warning(`Peer unreachable: ${data.error || 'Connection timed out'}`)
        }
        await fetchPeers()
      }
    } catch (err: any) {
      toast.error('Ping failed: ' + err.message)
    } finally {
      setPingingId(null)
    }
  }

  async function handleToggleShare(id: number, enabled: boolean) {
    try {
      const res = await authFetch(`${apiBase}/admin/federation/shares/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (res.ok) {
        toast.success(enabled ? 'Share rule resumed & queued for sync.' : 'Share rule paused.')
        await fetchShares()
      } else {
        toast.error('Failed to update share rule status')
      }
    } catch (err: any) {
      toast.error('Toggle failed: ' + err.message)
    }
  }

  async function executePendingDelete() {
    if (!pendingDelete) return
    const { kind, id, name } = pendingDelete
    setPendingDelete(null)
    try {
      const path =
        kind === 'peer'
          ? `${apiBase}/admin/federation/peers/${id}`
          : `${apiBase}/admin/federation/shares/${id}`
      const res = await authFetch(path, { method: 'DELETE' })
      if (res.ok) {
        toast.success(kind === 'peer' ? `Peer "${name}" removed.` : `Share rule "${name}" removed.`)
        await Promise.all([fetchPeers(), fetchShares(), fetchQueue()])
      }
    } catch (err: any) {
      toast.error('Delete failed: ' + err.message)
    }
  }

  async function handleReconcile(id: number, name: string) {
    setReconcilingId(id)
    try {
      const res = await authFetch(`${apiBase}/admin/federation/shares/${id}/reconcile`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Reconciliation initiated for "${name}": ${data.enqueued_count || 0} items enqueued.`)
        await Promise.all([fetchShares(), fetchQueue()])
      }
    } catch (err: any) {
      toast.error('Reconciliation failed: ' + err.message)
    } finally {
      setReconcilingId(null)
    }
  }

  async function handleRetryQueue() {
    try {
      const res = await authFetch(`${apiBase}/admin/federation/queue/retry-failed`, { method: 'POST' })
      if (res.ok) {
        toast.success('Retrying all pending and failed tasks.')
        await fetchQueue()
      }
    } catch (err: any) {
      toast.error('Retry failed: ' + err.message)
    }
  }

  async function handleClearCompleted() {
    try {
      const res = await authFetch(`${apiBase}/admin/federation/queue/completed`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Completed tasks pruned.')
        await fetchQueue()
      }
    } catch (err: any) {
      toast.error('Clear failed: ' + err.message)
    }
  }

  return {
    peers, shares, queue, queuePage, setQueuePage, queueLimit, setQueueLimit,
    queueStatus, setQueueStatus, queueMeta, localBuckets, loading, pingingId,
    reconcilingId, pendingDelete, setPendingDelete, loadData, scheduleStreamRefresh,
    handlePingPeer, handleToggleShare, executePendingDelete, handleReconcile,
    handleRetryQueue, handleClearCompleted,
  }
}
