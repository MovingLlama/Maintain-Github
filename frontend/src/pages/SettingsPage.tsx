import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listModels } from '../api/ai'
import { getUserSettings, updateUserSettings } from '../api/settings'
import { useAuthStore } from '../stores/authStore'
import { Github, Cpu, Cloud, Shield, Star, ToggleLeft, ToggleRight } from 'lucide-react'
import { AIModel } from '../types'

/** Derive composite key from provider + model id */
function modelKey(provider: string, modelId: string) {
  return `${provider}:${modelId}`
}

export function SettingsPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const { data: models } = useQuery({ queryKey: ['models'], queryFn: listModels })
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['userSettings'],
    queryFn: getUserSettings,
  })

  const saveMutation = useMutation({
    mutationFn: updateUserSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['userSettings'] }),
  })

  const enabledModels = settings?.enabled_models ?? []
  const defaultModel = settings?.default_chat_model ?? null

  const isEnabled = useCallback(
    (provider: string, id: string) => enabledModels.includes(modelKey(provider, id)),
    [enabledModels],
  )

  const toggleModel = (provider: string, id: string) => {
    const key = modelKey(provider, id)
    let next: string[]
    if (enabledModels.includes(key)) {
      next = enabledModels.filter(k => k !== key)
    } else {
      next = [...enabledModels, key]
    }
    // If we removed the default model, clear it too
    let nextDefault = defaultModel
    if (!next.includes(defaultModel ?? '')) {
      nextDefault = next.length > 0 ? next[0] : null
    }
    // If this is the first enabled model and no default was set, auto-set as default
    if (next.length === 1 && !nextDefault) {
      nextDefault = next[0]
    }
    saveMutation.mutate({ enabled_models: next, default_chat_model: nextDefault })
  }

  const setDefaultModel = (provider: string, id: string) => {
    const key = modelKey(provider, id)
    if (!enabledModels.includes(key)) return
    saveMutation.mutate({ default_chat_model: key })
  }

  const allModels: { provider: string; label: string; icon: React.ReactNode; color: string; models: AIModel[] }[] = [
    {
      provider: 'ollama',
      label: 'Ollama (Local)',
      icon: <Cloud className="w-3 h-3" />,
      color: 'text-sky-400',
      models: models?.ollama ?? [],
    },
    {
      provider: 'openrouter',
      label: 'OpenRouter (Cloud)',
      icon: <Shield className="w-3 h-3" />,
      color: 'text-purple-400',
      models: models?.openrouter ?? [],
    },
  ]

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

      {/* AI Models – interactive toggles */}
      <section className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          AI Model Configuration
        </h2>
        <p className="text-xs text-gray-500 -mt-2">
          Toggle models to make them available in chat. Click the star to set your default model.
        </p>

        {settingsLoading ? (
          <div className="text-xs text-gray-500 italic py-4">Loading settings…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allModels.map(({ provider, label, icon, color, models: providerModels }) => (
              <div key={provider} className="p-4 bg-gray-800/50 rounded-xl border border-gray-700 space-y-3">
                <div className={`flex items-center gap-2 text-xs font-medium ${color}`}>
                  {icon}
                  {label}
                </div>
                <div className="space-y-1">
                  {providerModels.map(model => {
                    const enabled = isEnabled(provider, model.id)
                    const isDefault = defaultModel === modelKey(provider, model.id)
                    return (
                      <div
                        key={model.id}
                        className="flex items-center justify-between py-1.5 border-b border-gray-700 last:border-0 group"
                      >
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <button
                            onClick={() => toggleModel(provider, model.id)}
                            disabled={saveMutation.isPending}
                            className="flex-shrink-0 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                            title={enabled ? 'Disable model' : 'Enable model'}
                          >
                            {enabled ? (
                              <ToggleRight className="w-5 h-5 text-sky-400" />
                            ) : (
                              <ToggleLeft className="w-5 h-5" />
                            )}
                          </button>
                          <span className={`text-xs truncate ${enabled ? 'text-gray-200' : 'text-gray-500'}`}>
                            {model.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-600">
                            {model.size ? `${(model.size / 1e9).toFixed(1)}GB` : model.context_length ? `${(model.context_length / 1000).toFixed(0)}k` : ''}
                          </span>
                          {enabled && (
                            <button
                              onClick={() => setDefaultModel(provider, model.id)}
                              disabled={saveMutation.isPending}
                              className="opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                              title={isDefault ? 'Default model' : 'Set as default'}
                            >
                              <Star
                                className={`w-3.5 h-3.5 ${
                                  isDefault ? 'text-yellow-400 fill-yellow-400' : 'text-gray-500 hover:text-yellow-400'
                                }`}
                              />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {providerModels.length === 0 && (
                    <p className="text-xs text-gray-500 italic py-2">No models found</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
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
