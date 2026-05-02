import { useEffect, useRef } from 'react'

type WSMessage = { type: string; [key: string]: any }

export function useWebSocket(onMessage?: (msg: WSMessage) => void) {
  const ws = useRef<WebSocket | null>(null)

  useEffect(() => {
    const token = document.cookie.match(/access_token=([^;]+)/)?.[1]
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    ws.current = new WebSocket(`${protocol}://${window.location.host}/ws?token=${token}`)

    ws.current.onopen = () => {
      // Send ping every 30s
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

    return () => ws.current?.close()
  }, [])

  return ws
}
