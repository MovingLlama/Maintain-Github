import { NavLink, useLocation } from 'react-router-dom'
import { GitBranch, MessageSquare, Settings, LogOut, Github, Bot, X, BookOpen } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { logout } from '../../api/auth'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

const navItems = [
  { to: '/repos', icon: GitBranch, label: 'Repositories' },
  { to: '/chat', icon: MessageSquare, label: 'Chat' },
  { to: '/agent', icon: Bot, label: 'Agent' },
  { to: '/interview', icon: BookOpen, label: 'Interview Prep' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

interface SidebarProps {
  isMobile?: boolean
  onClose?: () => void
}

export function Sidebar({ isMobile, onClose }: SidebarProps) {
  const { user, setUser } = useAuthStore()
  const qc = useQueryClient()
  const location = useLocation()

  // Close mobile sidebar on navigation
  useEffect(() => {
    if (isMobile && onClose) onClose()
  }, [location.pathname])

  const handleLogout = async () => {
    await logout()
    setUser(null)
    qc.clear()
    window.location.href = '/'
  }

  const handleNavClick = () => {
    if (isMobile && onClose) onClose()
  }

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Github className="w-7 h-7 text-sky-400" />
          <span className="font-bold text-white text-lg">Maintain</span>
        </div>
        {isMobile && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={handleNavClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-sky-900/40 text-sky-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      {user && (
        <div className="p-3 border-t border-gray-800">
          <div className="flex items-center gap-3 px-3 py-2">
            <img
              src={user.github_avatar_url || ''}
              alt={user.github_login}
              className="w-7 h-7 rounded-full"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.github_name || user.github_login}</p>
              <p className="text-xs text-gray-400 truncate">@{user.github_login}</p>
            </div>
            <button onClick={handleLogout} className="text-gray-400 hover:text-red-400 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
