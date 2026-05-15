import { useEffect, useRef } from 'react'
import api from '../api/client'
import { createLogger } from '../utils/logger'

const logger = createLogger('ws')

type WSMessage = { type: string; [key: string]: any }

export function useWebSocket(onMessage?: (msg: WSMessage) => void) {
  const ws = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)
  const MAX_RECONNECT = 5

  useEffect(() => {
    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = async () => {
      try {
        logger.debug('Fetching WebSocket token...')
        const { data } = await api.get<{ token: string }>('/auth/ws-token')
        if (cancelled) return

        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const wsUrl = `${protocol}://${window.location.host}/ws?token=${data.token}`
        logger.debug('Connecting WebSocket', { url: wsUrl })
        ws.current = new WebSocket(wsUrl)

        ws.current.onopen = () => {
          logger.info('WebSocket connected')
          reconnectAttempts.current = 0

          const ping = setInterval(() => {
            if (ws.current?.readyState === WebSocket.OPEN) {
              ws.current.send(JSON.stringify({ type: 'ping' }))
            }
          }, 30000)
          ws.current!.onclose = () => clearInterval(ping)
        }

        ws.current.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data)
            onMessage?.(msg)
          } catch {
            logger.warn('Failed to parse WebSocket message', { raw: e.data.slice(0, 200) })
          }
        }

        ws.current.onclose = (e) => {
          logger.warn('WebSocket disconnected', { code: e.code, reason: e.reason })
          ws.current = null

          // Auto-reconnect on abnormal closure
          if (!cancelled && e.code !== 1000 && reconnectAttempts.current < MAX_RECONNECT) {
            const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000)
            reconnectAttempts.current++
            logger.info(
              `WebSocket reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${MAX_RECONNECT})`,
            )
            reconnectTimer = setTimeout(connect, delay)
          }
        }

        ws.current.onerror = () => {
          logger.error('WebSocket error occurred')
        }
      } catch (err) {
        logger.warn('WebSocket connection failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws.current?.close(1000, 'Component unmounted')
    }
  }, [])

  return ws
}
