import { useState, useMemo } from 'react'
import { useDebug } from './DebugProvider'
import type { DebugLog } from '../../utils/logger'

type TabId = 'logs' | 'network' | 'performance'

interface NetworkEntry {
  id: number
  method: string
  url: string
  status: number | 'pending'
  duration: number
  timestamp: number
  requestBody?: unknown
  responseBody?: unknown
}

// Shared network log storage (outside React state to avoid re-renders)
const networkEntries: NetworkEntry[] = []
let networkCounter = 0

export function addNetworkEntry(entry: Omit<NetworkEntry, 'id'>): number {
  const id = ++networkCounter
  networkEntries.push({ ...entry, id })
  if (networkEntries.length > 200) {
    networkEntries.shift()
  }
  return id
}

function LogTab({ logs }: { logs: DebugLog[] }) {
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [moduleFilter, setModuleFilter] = useState('')

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (levelFilter !== 'all' && log.level !== levelFilter) return false
      if (moduleFilter && !log.module.includes(moduleFilter)) return false
      return true
    })
  }, [logs, levelFilter, moduleFilter])

  const levels: string[] = ['all', 'debug', 'info', 'warn', 'error']

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 p-2 border-b border-gray-700">
        {levels.map((lvl) => (
          <button
            key={lvl}
            onClick={() => setLevelFilter(lvl)}
            className={`px-2 py-0.5 text-xs rounded ${
              levelFilter === lvl
                ? 'bg-sky-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {lvl}
          </button>
        ))}
        <input
          type="text"
          placeholder="module filter..."
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="ml-auto px-2 py-0.5 text-xs bg-gray-800 border border-gray-600 rounded text-gray-300 w-32"
        />
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-xs p-2 space-y-0.5">
        {filtered.length === 0 && (
          <p className="text-gray-500 text-center mt-4">No log entries</p>
        )}
        {filtered.map((log, i) => (
          <div
            key={`${log.timestamp}-${i}`}
            className={`flex gap-1 ${
              log.level === 'error'
                ? 'text-red-400'
                : log.level === 'warn'
                  ? 'text-yellow-400'
                  : log.level === 'debug'
                    ? 'text-gray-400'
                    : 'text-gray-200'
            }`}
          >
            <span className="text-gray-600 shrink-0">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span className="text-gray-500 shrink-0">[{log.module}]</span>
            <span className="truncate">{log.message}</span>
            {log.data !== undefined && (
              <span className="text-gray-600 truncate">
                {JSON.stringify(log.data).slice(0, 100)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function NetworkTab() {
  const [entries, setEntries] = useState<NetworkEntry[]>(networkEntries)

  // Poll for new entries every second
  useState(() => {
    const interval = setInterval(() => {
      setEntries([...networkEntries])
    }, 1000)
    return () => clearInterval(interval)
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 p-2 border-b border-gray-700">
        <span className="text-xs text-gray-400">
          {entries.length} requests
        </span>
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-xs p-2 space-y-1">
        {entries.length === 0 && (
          <p className="text-gray-500 text-center mt-4">No network activity</p>
        )}
        {[...entries].reverse().map((entry) => (
          <div key={entry.id} className="flex gap-1 items-center">
            <span
              className={`font-bold w-10 shrink-0 ${
                entry.status === 'pending'
                  ? 'text-yellow-400'
                  : entry.status >= 400
                    ? 'text-red-400'
                    : 'text-green-400'
              }`}
            >
              {entry.status}
            </span>
            <span className="text-yellow-300 w-7 shrink-0">{entry.method}</span>
            <span className="text-gray-300 truncate">{entry.url}</span>
            <span className="text-gray-600 shrink-0 ml-auto">
              {entry.duration.toFixed(0)}ms
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PerformanceTab() {
  const [metrics, setMetrics] = useState<Record<string, number>>({})

  useState(() => {
    // Try to capture Web Vitals
    try {
      const observer = new PerformanceObserver((list) => {
        const entries: Record<string, number> = {}
        list.getEntries().forEach((entry) => {
          entries[entry.name] = Math.round(entry.startTime)
        })
        setMetrics((prev) => ({ ...prev, ...entries }))
      })
      observer.observe({ type: 'navigation', buffered: true })
      observer.observe({ type: 'paint', buffered: true })
      observer.observe({ type: 'largest-contentful-paint', buffered: true })

      // Navigation timing
      const nav = performance.getEntriesByType(
        'navigation',
      )[0] as PerformanceNavigationTiming
      if (nav) {
        setMetrics({
          'DNS Lookup': Math.round(nav.domainLookupEnd - nav.domainLookupStart),
          'TCP Connect': Math.round(nav.connectEnd - nav.connectStart),
          'TTFB': Math.round(nav.responseStart - nav.requestStart),
          'DOM Load': Math.round(nav.domContentLoadedEventEnd - nav.fetchStart),
          'Page Load': Math.round(nav.loadEventEnd - nav.fetchStart),
        })
      }

      return () => observer.disconnect()
    } catch {
      // Performance API might not be available
    }
  })

  return (
    <div className="flex flex-col h-full p-4">
      {Object.keys(metrics).length === 0 && (
        <p className="text-gray-500 text-center">Collecting metrics...</p>
      )}
      <div className="space-y-2">
        {Object.entries(metrics).map(([key, value]) => (
          <div key={key} className="flex justify-between text-sm">
            <span className="text-gray-400">{key}</span>
            <span className="text-gray-200 font-mono">{value}ms</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DebugPanel() {
  const { isDebug, toggleDebug, logs, clearLogs } = useDebug()
  const [activeTab, setActiveTab] = useState<TabId>('logs')
  const [minimized, setMinimized] = useState(false)

  if (!isDebug) {
    // Show a small toggle button in the corner
    return (
      <button
        onClick={toggleDebug}
        className="fixed bottom-3 right-3 z-[9999] bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs px-2 py-1 rounded border border-gray-700 opacity-50 hover:opacity-100 transition-opacity"
        title="Enable debug panel"
      >
        🐛
      </button>
    )
  }

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'logs', label: 'Logs', count: logs.length },
    { id: 'network', label: 'Network' },
    { id: 'performance', label: 'Perf' },
  ]

  if (minimized) {
    return (
      <div className="fixed bottom-3 right-3 z-[9999] flex gap-2">
        <button
          onClick={() => setMinimized(false)}
          className="bg-gray-900 text-gray-300 text-xs px-3 py-1.5 rounded border border-gray-700 hover:bg-gray-800"
        >
          🐛 Debug ({logs.length})
        </button>
        <button
          onClick={toggleDebug}
          className="bg-gray-900 text-gray-500 text-xs px-2 py-1.5 rounded border border-gray-700 hover:bg-gray-800"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-3 right-3 z-[9999] w-[480px] h-[400px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-xs font-semibold text-sky-400 mr-2">🐛 Debug</span>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-2 py-0.5 text-xs rounded ${
              activeTab === tab.id
                ? 'bg-sky-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1 text-[10px] opacity-75">{tab.count}</span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={clearLogs}
          className="text-xs text-gray-500 hover:text-gray-300 px-2 py-0.5"
          title="Clear logs"
        >
          Clear
        </button>
        <button
          onClick={() => setMinimized(true)}
          className="text-xs text-gray-500 hover:text-gray-300 px-2 py-0.5"
          title="Minimize"
        >
          −
        </button>
        <button
          onClick={toggleDebug}
          className="text-xs text-gray-500 hover:text-red-400 px-2 py-0.5"
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'logs' && <LogTab logs={logs} />}
        {activeTab === 'network' && <NetworkTab />}
        {activeTab === 'performance' && <PerformanceTab />}
      </div>
    </div>
  )
}
