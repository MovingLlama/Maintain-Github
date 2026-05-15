import { Component, ReactNode, ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw, Copy } from 'lucide-react'
import { createLogger } from '../../utils/logger'

const logger = createLogger('error-boundary')

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  componentStack: string | null
  copied: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, componentStack: null, copied: false }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('ErrorBoundary caught an error', {
      error: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    })

    this.setState({ componentStack: info.componentStack || null })
  }

  handleCopyError = () => {
    const { error, componentStack } = this.state
    const details = JSON.stringify(
      {
        error: error?.message ?? 'Unknown error',
        stack: error?.stack ?? '',
        componentStack: componentStack ?? '',
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    )

    navigator.clipboard.writeText(details).catch(() => {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = details
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    })

    this.setState({ copied: true })
    setTimeout(() => this.setState({ copied: false }), 2000)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-gray-900 rounded-2xl border border-red-900/50 p-6 space-y-4 text-left">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-red-400 shrink-0" />
              <h2 className="text-xl font-semibold text-white">Something went wrong</h2>
            </div>

            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Error</p>
              <p className="text-sm text-red-300 font-mono bg-gray-800 rounded-lg p-3 break-all">
                {this.state.error?.message ?? 'Unknown error'}
              </p>
            </div>

            {this.state.error?.stack && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  Stack Trace
                </p>
                <pre className="text-xs text-gray-400 font-mono bg-gray-800 rounded-lg p-3 overflow-auto max-h-32 whitespace-pre-wrap break-all">
                  {this.state.error.stack}
                </pre>
              </div>
            )}

            {this.state.componentStack && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  Component Stack
                </p>
                <pre className="text-xs text-gray-400 font-mono bg-gray-800 rounded-lg p-3 overflow-auto max-h-24 whitespace-pre-wrap">
                  {this.state.componentStack}
                </pre>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reload page
              </button>
              <button
                onClick={this.handleCopyError}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4" />
                {this.state.copied ? 'Copied!' : 'Copy error details'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
