import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
const WS_BASE = import.meta.env.VITE_WS_BASE ?? ''

function buildStreamWsUrl(path: string, ticketOrToken: string, useTicket: boolean): string {
  const encoded = encodeURIComponent(ticketOrToken)
  const query = useTicket ? `ticket=${encoded}` : `token=${encoded}`

  if (WS_BASE) {
    return `${WS_BASE.replace(/\/$/, '')}${path}?${query}`
  }

  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'

  if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
    const host = API_BASE.replace(/^https?:\/\//, '').replace(/\/$/, '')
    return `${protocol}//${host}${path}?${query}`
  }

  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return `${protocol}//${window.location.hostname}:8080${path}?${query}`
  }

  if (typeof window !== 'undefined') {
    const cleanBase = API_BASE.startsWith('/') ? API_BASE : `/${API_BASE}`
    return `${protocol}//${window.location.host}${cleanBase.replace(/\/$/, '')}${path}?${query}`
  }

  return `ws://localhost:8080${path}?${query}`
}

export function getAuditStreamWsUrl(ticketOrToken: string, useTicket = false): string {
  return buildStreamWsUrl('/admin/audit/stream', ticketOrToken, useTicket)
}

export function getFederationStreamWsUrl(ticketOrToken: string, useTicket = true): string {
  return buildStreamWsUrl('/admin/federation/stream', ticketOrToken, useTicket)
}

export async function fetchWsTicketOrToken(
  authFetch: (url: string, init?: RequestInit) => Promise<Response>,
  fallbackToken: string,
): Promise<{ credential: string; useTicket: boolean }> {
  try {
    const res = await authFetch(`${API_BASE}/admin/federation/stream-ticket`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      if (typeof data?.ticket === 'string' && data.ticket) {
        return { credential: data.ticket, useTicket: true }
      }
    }
  } catch {
    // Fallback to token if ticket endpoint is temporarily unreachable
  }
  return { credential: fallbackToken, useTicket: false }
}
