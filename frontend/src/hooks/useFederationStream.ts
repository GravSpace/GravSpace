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

export function useFederationStream({ onEvent, enabled = true }: UseFederationStreamOptions = {}) {
  const { authState } = useAuth()
  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<FederationWsMessage | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const token = (authState as any)?.token || ''

  useEffect(() => {
    if (!enabled || !token) return

    let isDisposed = false
    let reconnectTimeout: ReturnType<typeof setTimeout>
    let ws: WebSocket | null = null

    function connect() {
      if (isDisposed) return
      try {
        const wsUrl = getFederationStreamWsUrl(token)
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
  }, [token, enabled])

  return { isConnected, lastEvent }
}
