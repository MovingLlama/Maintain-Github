import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { Menu, X } from 'lucide-react'

export function AppLayout() {
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close sidebar when switching to desktop
  useEffect(() => {
    if (!isMobile) setSidebarOpen(false)
  }, [isMobile])

  // Close sidebar on route change (via Outlet rerender)
  useEffect(() => {
    setSidebarOpen(false)
  }, [])

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* Desktop sidebar – always visible */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {isMobile && (
        <>
          {/* Backdrop */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          {/* Slide-in drawer */}
          <div
            className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <Sidebar isMobile onClose={() => setSidebarOpen(false)} />
          </div>

          {/* Hamburger button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className={`fixed top-3 left-3 z-30 p-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-300 hover:text-white transition-colors ${
              sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
        </>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-hidden min-w-0">
        <Outlet />
      </main>
    </div>
  )
}
