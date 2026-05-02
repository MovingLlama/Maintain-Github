import { useQuery } from '@tanstack/react-query'
import { listModels } from '../api/ai'
import { useAuthStore } from '../stores/authStore'
import { Github, Cpu, Cloud, Shield } from 'lucide-react'

export function SettingsPage() {
  const { user } = useAuthStore()
  const { data: models } = useQuery({ queryKey: ['models'], queryFn: listModels })

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {/* User Info */}
      <section className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <Github className="w-4 h-4" />
          GitHub Account
        </h2>
        <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-xl border border-gray-700">
          <img
            src={user?.github_avatar_url || ''}
            alt={user?.github_login || 'User'}
            className="w-12 h-12 rounded-full"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.github_name || user?.github_login}</p>
            <p className="text-xs text-gray-400 truncate">@{user?.github_login}</p>
          </div>
        </div>
      </section>

      {/* AI Models */}
      <section className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          AI Model Configuration
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700 space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-sky-400">
              <Cloud className="w-3 h-3" />
              Ollama (Local)
            </div>
            <div className="space-y-2">
              {models?.ollama.map(model => (
                <div key={model.id} className="flex items-center justify-between text-xs py-1 border-b border-gray-700 last:border-0">
                  <span className="text-gray-300 truncate">{model.name}</span>
                  <span className="text-gray-500">{model.size ? `${(model.size / 1e9).toFixed(1)}GB` : 'N/A'}</span>
                </div>
              ))}
              {(!models?.ollama || models.ollama.length === 0) && (
                <p className="text-xs text-gray-500 italic">No local models found</p>
              )}
            </div>
          </div>
          <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700 space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-purple-400">
              <Shield className="w-3 h-3" />
              OpenRouter (Cloud)
            </div>
            <div className="space-y-2">
              {models?.openrouter.map(model => (
                <div key={model.id} className="flex items-center justify-between text-xs py-1 border-b border-gray-700 last:border-0">
                  <span className="text-gray-300 truncate">{model.name}</span>
                  <span className="text-gray-500">{model.context_length ? `${(model.context_length / 1000).toFixed(0)}k` : 'N/A'}</span>
                </div>
              ))}
              {(!models?.openrouter || models.openrouter.length === 0) && (
                <p className="text-xs text-gray-500 italic">No cloud models found</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* System Status */}
      <section className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-300">System Status</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 flex items-center justify-between">
            <span className="text-xs text-gray-400">Backend API</span>
            <div className="w-2 h-2 rounded-full bg-green-500" />
          </div>
          <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 flex items-center justify-between">
            <span className="text-xs text-gray-400">Git Service</span>
            <div className="w-2 h-2 rounded-full bg-green-500" />
          </div>
        </div>
      </section>
    </div>
  )
}
