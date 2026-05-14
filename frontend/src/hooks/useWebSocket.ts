import { useEffect, useRef } from 'react'
import api from '../api/client'

type WSMessage = { type: string; [key: string]: any }

export function useWebSocket(onMessage?: (msg: WSMessage) => void) {
  const ws = useRef<WebSocket | null>(null)

  useEffect(() => {
    let cancelled = false

    const connect = async () => {
      try {
        // access_token is httpOnly — JS cannot read it from document.cookie.
        // Fetch a WS token from the API instead.
        const { data } = await api.get<{ token: string }>('/auth/ws-token')
        if (cancelled) return

        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
        ws.current = new WebSocket(
          `${protocol}://${window.location.host}/ws?token=${data.token}`
        )

        ws.current.onopen = () => {
          const ping = setInterval(() => {
            ws.current?.send(JSON.stringify({ type: 'ping' }))
          }, 30000)
          ws.current!.onclose = () => clearInterval(ping)
        }

        ws.current.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data)
            onMessage?.(msg)
          } catch {}
        }
      } catch {
        // Not authenticated or network error — WebSocket intentionally not opened.
      }
    }

    connect()

    return () => {
      cancelled = true
      ws.current?.close()
    }
  }, [])

  return ws
}
