import { useEffect, useRef, useState } from 'react'
import { getFederationStreamWsUrl } from '../lib/utils'
import { useAuth } from './useAuth'

export interface FederationWsMessage {
  event: string
  data: any
  timestamp: string
}

interface UseFederationStreamOptions {
  onEvent?: (event: FederationWsMessage) => void
  enabled?: boolean
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export function useFederationStream({ onEvent, enabled = true }: UseFederationStreamOptions = {}) {
  const { authState, authFetch } = useAuth()
  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<FederationWsMessage | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const onEventRef = useRef(onEvent)
  const authFetchRef = useRef(authFetch)
  onEventRef.current = onEvent
  authFetchRef.current = authFetch

  const isAuthenticated = Boolean(authState?.isAuthenticated)
  const token = (authState as any)?.token || ''

  useEffect(() => {
    if (!enabled || !isAuthenticated) return

    let isDisposed = false
    let reconnectTimeout: ReturnType<typeof setTimeout>
    let ws: WebSocket | null = null

    async function connect() {
      if (isDisposed) return
      try {
        let wsUrl: string
        try {
          const ticketRes = await authFetchRef.current(`${API_BASE}/admin/federation/stream-ticket`, {
            method: 'POST',
          })
          if (ticketRes.ok) {
            const ticketData = await ticketRes.json()
            wsUrl = ticketData?.ticket
              ? getFederationStreamWsUrl(ticketData.ticket, true)
              : getFederationStreamWsUrl(token, false)
          } else {
            wsUrl = getFederationStreamWsUrl(token, false)
          }
        } catch {
          wsUrl = getFederationStreamWsUrl(token, false)
        }

        if (isDisposed) return
        ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          if (!isDisposed) setIsConnected(true)
        }

        ws.onmessage = (e) => {
          try {
            const parsed: FederationWsMessage = JSON.parse(e.data)
            if (!isDisposed) {
              setLastEvent(parsed)
              onEventRef.current?.(parsed)
            }
          } catch {}
        }

        ws.onclose = () => {
          if (!isDisposed) {
            setIsConnected(false)
            reconnectTimeout = setTimeout(connect, 3000)
          }
        }

        ws.onerror = () => {
          ws?.close()
        }
      } catch {
        if (!isDisposed) {
          setIsConnected(false)
          reconnectTimeout = setTimeout(connect, 5000)
        }
      }
    }

    connect()

    return () => {
      isDisposed = true
      clearTimeout(reconnectTimeout)
      if (ws) {
        ws.close()
        wsRef.current = null
      }
      setIsConnected(false)
    }
  }, [isAuthenticated, token, enabled])

  return { isConnected, lastEvent }
}
