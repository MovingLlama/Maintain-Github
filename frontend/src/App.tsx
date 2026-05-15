import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { AuthSuccessPage } from './pages/AuthSuccessPage'
import { RepositoriesPage } from './pages/RepositoriesPage'
import { ChatPage } from './pages/ChatPage'
import { AgentPage } from './pages/AgentPage'
import { SettingsPage } from './pages/SettingsPage'
import { useAuth } from './hooks/useAuth'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { DebugProvider } from './components/common/DebugProvider'
import { DebugPanel } from './components/common/DebugPanel'

const queryClient = new QueryClient()

function AppRoutes() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/success" element={<AuthSuccessPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/repos" element={<RepositoriesPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/agent" element={<AgentPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/" element={<Navigate to="/repos" replace />} />
      </Route>
      <Route path="/auth/success" element={<AuthSuccessPage />} />
      <Route path="*" element={<Navigate to="/repos" replace />} />
    </Routes>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <DebugProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </QueryClientProvider>
        <DebugPanel />
      </DebugProvider>
    </ErrorBoundary>
  )
}
