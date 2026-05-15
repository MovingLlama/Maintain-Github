import { useState, useEffect, FormEvent } from 'react'
import { X, Save } from 'lucide-react'
import { Chat, AIModel } from '../../types'

export interface AgentFormData {
  title: string
  system_prompt: string
  model_provider: 'ollama' | 'openrouter'
  model_name: string
  repository_id: string | null
}

interface AgentFormProps {
  initial?: AgentFormData
  enabledModels: AIModel[]
  repositories: { id: string; full_name: string }[]
  onSave: (data: AgentFormData) => void
  onCancel: () => void
  isPending: boolean
}

export function AgentForm({
  initial,
  enabledModels,
  repositories,
  onSave,
  onCancel,
  isPending,
}: AgentFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? '')
  const [modelKey, setModelKey] = useState(() => {
    if (initial) return `${initial.model_provider}:${initial.model_name}`
    return enabledModels.length > 0
      ? `${enabledModels[0].provider}:${enabledModels[0].id}`
      : ''
  })
  const [repoId, setRepoId] = useState(initial?.repository_id ?? '')

  useEffect(() => {
    if (initial) {
      setTitle(initial.title)
      setSystemPrompt(initial.system_prompt)
      setModelKey(`${initial.model_provider}:${initial.model_name}`)
      setRepoId(initial.repository_id ?? '')
    }
  }, [initial])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !modelKey) return

    const colonIdx = modelKey.indexOf(':')
    onSave({
      title: title.trim(),
      system_prompt: systemPrompt.trim(),
      model_provider: modelKey.substring(0, colonIdx) as 'ollama' | 'openrouter',
      model_name: modelKey.substring(colonIdx + 1),
      repository_id: repoId || null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Agent Name</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Code Reviewer"
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sky-500"
          autoFocus
          required
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">
          System Prompt
          <span className="text-gray-600 ml-1">(defines agent behavior)</span>
        </label>
        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          placeholder="You are an expert code reviewer. Focus on..."
          rows={5}
          className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sky-500 resize-none"
        />
        <p className="text-[10px] text-gray-600 mt-1">
          Leave empty to use the default expert software engineer prompt.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Model</label>
          <select
            value={modelKey}
            onChange={e => setModelKey(e.target.value)}
            className="w-full px-2.5 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-sky-500"
          >
            {enabledModels.length === 0 && (
              <option value="" disabled>No models enabled</option>
            )}
            {enabledModels.map(m => {
              const key = `${m.provider}:${m.id}`
              return (
                <option key={key} value={key}>
                  [{m.provider}] {m.name}
                </option>
              )
            })}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Repository <span className="text-gray-600">(optional)</span>
          </label>
          <select
            value={repoId}
            onChange={e => setRepoId(e.target.value)}
            className="w-full px-2.5 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-sky-500"
          >
            <option value="">None</option>
            {repositories.map(repo => (
              <option key={repo.id} value={repo.id}>
                {repo.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending || !title.trim() || !modelKey}
          className="px-4 py-1.5 text-xs bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          {isPending ? 'Saving...' : 'Save Agent'}
        </button>
      </div>
    </form>
  )
}
