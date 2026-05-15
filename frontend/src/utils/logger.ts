/**
 * Frontend logger utility with support for debug mode and log buffering.
 *
 * In production builds, debug logs are suppressed.
 * In development, all logs are printed to console and buffered for the DebugPanel.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface DebugLog {
  timestamp: number
  level: LogLevel
  module: string
  message: string
  data?: unknown
}

type LogListener = (entry: DebugLog) => void

const listeners = new Set<LogListener>()
const MAX_BUFFER = 500

let logBuffer: DebugLog[] = []

function isDev(): boolean {
  // React's import.meta.env.MODE is 'development' in dev builds
  try {
    return import.meta.env.DEV === true
  } catch {
    return false
  }
}

function emit(entry: DebugLog): void {
  logBuffer.push(entry)
  if (logBuffer.length > MAX_BUFFER) {
    logBuffer = logBuffer.slice(-MAX_BUFFER)
  }
  listeners.forEach((fn) => {
    try {
      fn(entry)
    } catch {
      // Silently ignore listener errors
    }
  })
}

function createLogEntry(
  level: LogLevel,
  module: string,
  message: string,
  data?: unknown,
): DebugLog {
  return {
    timestamp: Date.now(),
    level,
    module,
    message,
    data,
  }
}

export function subscribeToLogs(listener: LogListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getLogBuffer(): DebugLog[] {
  return [...logBuffer]
}

export function clearLogBuffer(): void {
  logBuffer = []
}

export function createLogger(module: string) {
  return {
    debug(message: string, data?: unknown): void {
      if (!isDev()) return
      const entry = createLogEntry('debug', module, message, data)
      console.debug(
        `[${module}]`,
        message,
        data !== undefined ? data : '',
      )
      emit(entry)
    },

    info(message: string, data?: unknown): void {
      const entry = createLogEntry('info', module, message, data)
      console.info(
        `[${module}]`,
        message,
        data !== undefined ? data : '',
      )
      emit(entry)
    },

    warn(message: string, data?: unknown): void {
      const entry = createLogEntry('warn', module, message, data)
      console.warn(
        `[${module}]`,
        message,
        data !== undefined ? data : '',
      )
      emit(entry)
    },

    error(message: string, data?: unknown): void {
      const entry = createLogEntry('error', module, message, data)
      console.error(
        `[${module}]`,
        message,
        data !== undefined ? data : '',
      )
      emit(entry)
    },
  }
}

// Default app logger
export const appLogger = createLogger('app')
