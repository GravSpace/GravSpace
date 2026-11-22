import { toast } from 'sonner'

export interface RemoteServer {
  id: number
  name: string
  endpoint: string
  s3_endpoint?: string | null
  access_key: string
  secret_key: string
  status: 'healthy' | 'unreachable' | 'degraded' | string
  latency_ms: number
  last_heartbeat?: string | null
  created_at: string
}

export interface CrossServerShare {
  id: number
  name: string
  source_bucket: string
  source_prefix: string
  remote_server_id: number
  remote_server_name?: string | null
  remote_endpoint?: string | null
  target_bucket: string
  target_prefix: string
  sync_mode: 'one_way' | 'two_way' | string
  enabled: boolean
  status: 'in_sync' | 'syncing' | 'pending_retry' | 'offline' | string
  last_synced_at?: string | null
  created_at: string
}

export interface SyncQueueItem {
  id: number
  share_id: number
  source_bucket: string
  source_key: string
  target_bucket: string
  target_key: string
  action: 'PUT' | 'DELETE' | string
  version_id: string
  content_hash?: string | null
  size_bytes: number
  status: 'pending' | 'syncing' | 'completed' | 'failed' | string
  attempts: number
  max_attempts: number
  next_retry_at: string
  last_error?: string | null
  created_at: string
  updated_at: string
}

export type QueueStatusFilter = 'all' | 'pending' | 'syncing' | 'completed' | 'failed'

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '—'
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diffSec < 5) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

export function getLatencyBadge(status: string, latencyMs: number) {
  if (status !== 'healthy') {
    return {
      label: 'Offline',
      color: 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/20',
      dot: 'bg-rose-500 animate-pulse',
    }
  }
  if (latencyMs <= 60) {
    return {
      label: `${latencyMs}ms (Optimal)`,
      color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      dot: 'bg-emerald-500',
    }
  }
  if (latencyMs <= 200) {
    return {
      label: `${latencyMs}ms (Normal)`,
      color: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
      dot: 'bg-sky-500',
    }
  }
  return {
    label: `${latencyMs}ms (High)`,
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    dot: 'bg-amber-500',
  }
}

export async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  } catch {
    toast.error('Failed to copy to clipboard')
  }
}
