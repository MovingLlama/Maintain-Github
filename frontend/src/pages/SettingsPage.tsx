import { useState, useCallback, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listModels, pullOllamaModel } from '../api/ai'
import { getUserSettings, updateUserSettings } from '../api/settings'
import { useAuthStore } from '../stores/authStore'
import { Github, Cpu, Cloud, Shield, Star, ToggleLeft, ToggleRight, Download, Loader2, ExternalLink, ChevronRight, ChevronDown, Search } from 'lucide-react'
import { AIModel } from '../types'

/** Derive composite key from provider + model id */
function modelKey(provider: string, modelId: string) {
  return `${provider}:${modelId}`
}

/** Group models by their family name */
function groupModels(models: AIModel[], provider: string): Map<string, AIModel[]> {
  const groups = new Map<string, AIModel[]>()
  for (const m of models) {
    let family: string
    if (provider === 'ollama') {
      const colonIdx = m.id.indexOf(':')
      family = colonIdx > 0 ? m.id.substring(0, colonIdx) : m.id
    } else {
      const slashIdx = m.id.indexOf('/')
      family = slashIdx > 0 ? m.id.substring(0, slashIdx) : m.id
    }
    if (!groups.has(family)) groups.set(family, [])
    groups.get(family)!.push(m)
  }
  return groups
}

export function SettingsPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [pullModelName, setPullModelName] = useState('')
  const [pullMessage, setPullMessage] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [openRouterSearch, setOpenRouterSearch] = useState('')
  const pullInputRef = useRef<HTMLInputElement>(null)

  const { data: models } = useQuery({ queryKey: ['models'], queryFn: listModels })
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['userSettings'],
    queryFn: getUserSettings,
  })

  const saveMutation = useMutation({
    mutationFn: updateUserSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['userSettings'] }),
  })

  const pullMutation = useMutation({
    mutationFn: pullOllamaModel,
    onSuccess: () => {
      setPullMessage('Model pulled successfully! Refreshing…')
      setPullModelName('')
      qc.invalidateQueries({ queryKey: ['models'] })
      setTimeout(() => setPullMessage(null), 3000)
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Unknown error'
      setPullMessage(`Pull failed: ${detail}`)
      setTimeout(() => setPullMessage(null), 6000)
    },
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
    let nextDefault = defaultModel
    if (!next.includes(defaultModel ?? '')) {
      nextDefault = next.length > 0 ? next[0] : null
    }
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

  const titleModel = settings?.title_generation_model ?? null

  const setTitleModel = (key: string | null) => {
    saveMutation.mutate({ title_generation_model: key })
  }

  const flatEnabledModels = (models?.ollama ?? [])
    .concat(models?.openrouter ?? [])
    .filter(m => enabledModels.includes(modelKey(m.provider, m.id)))

  const toggleGroup = (family: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(family)) next.delete(family)
      else next.add(family)
      return next
    })
  }

  const ollamaModels = models?.ollama ?? []
  const openRouterModels = models?.openrouter ?? []
  const ollamaGroups = useMemo(() => groupModels(ollamaModels, 'ollama'), [ollamaModels])
  const openRouterGroups = useMemo(() => {
    const groups = groupModels(openRouterModels, 'openrouter')
    if (!openRouterSearch.trim()) return groups
    const filtered = new Map<string, AIModel[]>()
    const q = openRouterSearch.toLowerCase()
    for (const [family, familyModels] of groups) {
      const matching = familyModels.filter(
        m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
      )
      if (matching.length > 0) filtered.set(family, matching)
    }
    return filtered
  }, [openRouterModels, openRouterSearch])

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 max-w-2xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold text-white">Settings</h1>

      {/* User Info */}
      <section className="bg-gray-900 rounded-2xl border border-gray-800 p-4 md:p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <Github className="w-4 h-4" />
          GitHub Account
        </h2>
        <div className="flex items-center gap-3 md:gap-4 p-3 bg-gray-800/50 rounded-xl border border-gray-700">
          <img
            src={user?.github_avatar_url || ''}
            alt={user?.github_login || 'User'}
            className="w-10 h-10 md:w-12 md:h-12 rounded-full"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.github_name || user?.github_login}</p>
            <p className="text-xs text-gray-400 truncate">@{user?.github_login}</p>
          </div>
        </div>
      </section>

      {/* AI Models – interactive toggles */}
      <section className="bg-gray-900 rounded-2xl border border-gray-800 p-4 md:p-5 space-y-4">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {/* --- Ollama Column --- */}
            <div className="p-3 md:p-4 bg-gray-800/50 rounded-xl border border-gray-700 space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-sky-400">
                <Cloud className="w-3 h-3" />
                Ollama (Local)
              </div>

              {ollamaGroups.size === 0 ? (
                <p className="text-xs text-gray-500 italic py-2">No models found</p>
              ) : (
                <div className="space-y-2">
                  {Array.from(ollamaGroups.entries()).map(([family, familyModels]) => {
                    const isExpanded = expandedGroups.has(family) || ollamaGroups.size === 1
                    return (
                      <div key={family} className="border border-gray-700/50 rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleGroup(family)}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-700/50 transition-colors"
                        >
                          <span className="text-xs font-medium text-gray-300 truncate mr-2">{family}</span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-gray-600">{familyModels.length}</span>
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                            )}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-gray-700/50">
                            {familyModels.map(model => {
                              const enabled = isEnabled('ollama', model.id)
                              const isDefault = defaultModel === modelKey('ollama', model.id)
                              return (
                                <div
                                  key={model.id}
                                  className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-700/30 group"
                                >
                                  <div className="flex-1 min-w-0 flex items-center gap-2">
                                    <button
                                      onClick={() => toggleModel('ollama', model.id)}
                                      disabled={saveMutation.isPending}
                                      className="shrink-0 text-gray-400 hover:text-white transition-colors"
                                    >
                                      {enabled ? (
                                        <ToggleRight className="w-4 h-4 text-sky-400" />
                                      ) : (
                                        <ToggleLeft className="w-4 h-4" />
                                      )}
                                    </button>
                                    <span className={`text-xs truncate ${enabled ? 'text-gray-200' : 'text-gray-500'}`}>
                                      {model.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] text-gray-600">
                                      {model.size ? `${(model.size / 1e9).toFixed(1)}GB` : ''}
                                    </span>
                                    {enabled && (
                                      <button
                                        onClick={() => setDefaultModel('ollama', model.id)}
                                        disabled={saveMutation.isPending}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                                      >
                                        <Star
                                          className={`w-3 h-3 ${
                                            isDefault ? 'text-yellow-400 fill-yellow-400' : 'text-gray-500 hover:text-yellow-400'
                                          }`}
                                        />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Pull new model section */}
              <div className="pt-2 border-t border-gray-700 space-y-1.5">
                <p className="text-[10px] text-gray-500 uppercase font-semibold">Pull new model</p>
                <div className="flex gap-1.5">
                  <input
                    ref={pullInputRef}
                    type="text"
                    value={pullModelName}
                    onChange={e => setPullModelName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && pullModelName.trim() && pullMutation.mutate(pullModelName.trim())}
                    placeholder="e.g. llama3:8b"
                    className="flex-1 min-w-0 px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sky-500"
                  />
                  <button
                    onClick={() => pullModelName.trim() && pullMutation.mutate(pullModelName.trim())}
                    disabled={pullMutation.isPending || !pullModelName.trim()}
                    className="px-2 py-1 text-xs bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md flex items-center gap-1 transition-colors shrink-0"
                  >
                    {pullMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3" />
                    )}
                    Pull
                  </button>
                </div>
                {pullMessage && (
                  <p className={`text-[11px] ${pullMessage.startsWith('Pull failed') ? 'text-red-400' : 'text-green-400'}`}>
                    {pullMessage}
                  </p>
                )}
                <a
                  href="https://ollama.com/library"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 transition-colors mt-1.5"
                >
                  <ExternalLink className="w-3 h-3" />
                  Browse available models on ollama.com
                </a>
              </div>
            </div>

            {/* --- OpenRouter Column --- */}
            <div className="p-3 md:p-4 bg-gray-800/50 rounded-xl border border-gray-700 space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-purple-400">
                <Shield className="w-3 h-3" />
                OpenRouter (Cloud)
              </div>

              {/* Search field */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                <input
                  type="text"
                  value={openRouterSearch}
                  onChange={e => setOpenRouterSearch(e.target.value)}
                  placeholder="Search models..."
                  className="w-full pl-6 pr-2 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {openRouterGroups.size === 0 ? (
                <p className="text-xs text-gray-500 italic py-2">
                  {openRouterSearch ? 'No matching models' : 'No models found'}
                </p>
              ) : (
                <div className="space-y-2 max-h-60 md:max-h-80 overflow-y-auto">
                  {Array.from(openRouterGroups.entries()).map(([family, familyModels]) => {
                    const isExpanded = expandedGroups.has(family) || openRouterGroups.size === 1 || !!openRouterSearch
                    return (
                      <div key={family} className="border border-gray-700/50 rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleGroup(family)}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-700/50 transition-colors"
                        >
                          <span className="text-xs font-medium text-gray-300 truncate mr-2">{family}</span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-gray-600">{familyModels.length}</span>
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                            )}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-gray-700/50">
                            {familyModels.map(model => {
                              const enabled = isEnabled('openrouter', model.id)
                              const isDefault = defaultModel === modelKey('openrouter', model.id)
                              return (
                                <div
                                  key={model.id}
                                  className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-700/30 group"
                                >
                                  <div className="flex-1 min-w-0 flex items-center gap-2">
                                    <button
                                      onClick={() => toggleModel('openrouter', model.id)}
                                      disabled={saveMutation.isPending}
                                      className="shrink-0 text-gray-400 hover:text-white transition-colors"
                                    >
                                      {enabled ? (
                                        <ToggleRight className="w-4 h-4 text-sky-400" />
                                      ) : (
                                        <ToggleLeft className="w-4 h-4" />
                                      )}
                                    </button>
                                    <span className={`text-xs truncate ${enabled ? 'text-gray-200' : 'text-gray-500'}`}>
                                      {model.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] text-gray-600">
                                      {model.context_length ? `${(model.context_length / 1000).toFixed(0)}k` : ''}
                                    </span>
                                    {enabled && (
                                      <button
                                        onClick={() => setDefaultModel('openrouter', model.id)}
                                        disabled={saveMutation.isPending}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                                      >
                                        <Star
                                          className={`w-3 h-3 ${
                                            isDefault ? 'text-yellow-400 fill-yellow-400' : 'text-gray-500 hover:text-yellow-400'
                                          }`}
                                        />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Title Generation Model selector */}
        <div className="pt-2 border-t border-gray-700">
          <label className="text-xs text-gray-400 block mb-1.5">
            Chat Title Generation Model
          </label>
          <p className="text-[10px] text-gray-500 mb-2">
            This model generates a short, descriptive name for new chats after the first message.
          </p>
          <select
            value={titleModel ?? ''}
            onChange={e => setTitleModel(e.target.value || null)}
            disabled={settingsLoading || saveMutation.isPending}
            className="w-full px-2.5 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:border-sky-500 disabled:opacity-50"
          >
            <option value="">Auto (default chat model)</option>
            {flatEnabledModels.map(m => {
              const key = modelKey(m.provider, m.id)
              return (
                <option key={key} value={key}>
                  [{m.provider}] {m.name}
                </option>
              )
            })}
            {flatEnabledModels.length === 0 && (
              <option value="" disabled>No models enabled – enable models above first</option>
            )}
          </select>
        </div>
      </section>

      {/* System Status */}
      <section className="bg-gray-900 rounded-2xl border border-gray-800 p-4 md:p-5 space-y-4">
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
