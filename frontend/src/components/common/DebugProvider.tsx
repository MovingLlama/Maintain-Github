import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import {
  subscribeToLogs,
  getLogBuffer,
  clearLogBuffer,
  type DebugLog,
} from '../../utils/logger'

interface DebugContextValue {
  isDebug: boolean
  toggleDebug: () => void
  logs: DebugLog[]
  clearLogs: () => void
}

const DebugContext = createContext<DebugContextValue>({
  isDebug: false,
  toggleDebug: () => {},
  logs: [],
  clearLogs: () => {},
})

export function useDebug(): DebugContextValue {
  return useContext(DebugContext)
}

/**
 * Check if debug mode is enabled via query parameter or localStorage.
 * Priority: ?debug=true query param > localStorage 'debugMode'
 */
function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false

  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('debug') === 'true') {
      localStorage.setItem('debugMode', 'true')
      return true
    }
    if (params.get('debug') === 'false') {
      localStorage.removeItem('debugMode')
      return false
    }
  } catch {
    // Ignore URL parsing errors
  }

  try {
    return localStorage.getItem('debugMode') === 'true'
  } catch {
    return false
  }
}

interface DebugProviderProps {
  children: ReactNode
}

export function DebugProvider({ children }: DebugProviderProps) {
  const [isDebug, setIsDebug] = useState(isDebugEnabled)
  const [logs, setLogs] = useState<DebugLog[]>(getLogBuffer)

  useEffect(() => {
    const unsub = subscribeToLogs((entry) => {
      setLogs((prev) => {
        const next = [...prev, entry]
        return next.length > 500 ? next.slice(-500) : next
      })
    })
    return unsub
  }, [])

  const toggleDebug = useCallback(() => {
    setIsDebug((prev) => {
      const next = !prev
      try {
        if (next) {
          localStorage.setItem('debugMode', 'true')
        } else {
          localStorage.removeItem('debugMode')
        }
      } catch {
        // Ignore localStorage errors
      }
      return next
    })
  }, [])

  const clearLogs = useCallback(() => {
    clearLogBuffer()
    setLogs([])
  }, [])

  return (
    <DebugContext.Provider value={{ isDebug, toggleDebug, logs, clearLogs }}>
      {children}
    </DebugContext.Provider>
  )
}
