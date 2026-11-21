export interface TrashItem {
  id: number
  bucket: string
  key: string
  version_id: string
  size: number
  deleted_at: string | null
  content_type?: string | null
}

export function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatDate(d: string | null): string {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '—'
  const now = Date.now()
  const diff = now - date.getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  const relative =
    days > 0 ? `${days}d ago` : hrs > 0 ? `${hrs}h ago` : mins > 0 ? `${mins}m ago` : 'just now'
  return `${date.toLocaleString()} (${relative})`
}
