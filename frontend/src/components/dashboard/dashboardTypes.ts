export const CHART_COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6']
export const TYPE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#8b5cf6', '#ec4899', '#64748b']

export function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatSavings(logical: number, physical: number): string {
  if (!logical || logical <= 0) return '0 B (0%)'
  const diff = logical - physical
  if (diff <= 0) return '0 B (0%)'
  const percent = Math.min(100, Math.round((diff / logical) * 100))
  return `${formatSize(diff)} (${percent}%)`
}

export type WsStatus = 'connected' | 'connecting' | 'disconnected'
