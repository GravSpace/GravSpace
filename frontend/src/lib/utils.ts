import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
const WS_BASE = import.meta.env.VITE_WS_BASE ?? ''

export function getAuditStreamWsUrl(token: string): string {
  const encodedToken = encodeURIComponent(token)

  if (WS_BASE) {
    const base = WS_BASE.replace(/\/$/, '')
    return `${base}/admin/audit/stream?token=${encodedToken}`
  }

  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'

  if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
    const host = API_BASE.replace(/^https?:\/\//, '').replace(/\/$/, '')
    return `${protocol}//${host}/admin/audit/stream?token=${encodedToken}`
  }

  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return `${protocol}//${window.location.hostname}:8080/admin/audit/stream?token=${encodedToken}`
  }

  if (typeof window !== 'undefined') {
    const cleanBase = API_BASE.startsWith('/') ? API_BASE : `/${API_BASE}`
    return `${protocol}//${window.location.host}${cleanBase.replace(/\/$/, '')}/admin/audit/stream?token=${encodedToken}`
  }

  return `ws://localhost:8080/admin/audit/stream?token=${encodedToken}`
}

