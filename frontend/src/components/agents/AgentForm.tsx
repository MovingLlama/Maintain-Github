import { useState } from 'react'
import { Button } from '../common/Button'
import { AIModel } from '../../types'

export interface AgentFormData {
  name: string
  description: string
  system_prompt: string
  model_provider: string
  model_name: string
  tools_config: string[]
}

const AVAILABLE_TOOLS = [
  { value: 'read_file', label: 'Read File', description: 'Read file contents from the repo' },
  { value: 'write_file', label: 'Write File', description: 'Create or update files' },
  { value: 'list_files', label: 'List Files', description: 'Browse directory structure' },
  { value: 'get_git_diff', label: 'Git Diff', description: 'View uncommitted changes' },
  { value: 'get_git_log', label: 'Git Log', description: 'View commit history' },
  { value: 'search_in_files', label: 'Search', description: 'Search for patterns in files' },
  { value: 'delegate_to_agent', label: 'Delegate to Agent', description: 'Delegate sub-tasks to other specialized agents' },
]

interface AgentFormProps {
  onSubmit: (data: AgentFormData) => Promise<void>
  models: AIModel[]
  initialData?: Partial<AgentFormData>
  isSystem?: boolean
}

export function AgentForm({ onSubmit, models, initialData, isSystem }: AgentFormProps) {
  const [name, setName] = useState(initialData?.name || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [systemPrompt, setSystemPrompt] = useState(initialData?.system_prompt || '')
  const [modelKey, setModelKey] = useState(
    initialData?.model_provider && initialData?.model_name
      ? `${initialData.model_provider}:${initialData.model_name}`
      : ''
  )
  const [toolsConfig, setToolsConfig] = useState<string[]>(initialData?.tools_config || [])
  const [submitting, setSubmitting] = useState(false)

  const toggleTool = (toolValue: string) => {
    setToolsConfig(prev =>
      prev.includes(toolValue)
        ? prev.filter(t => t !== toolValue)
        : [...prev, toolValue]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    let modelProvider = ''
    let modelName = ''
    if (modelKey) {
      const colonIdx = modelKey.indexOf(':')
      if (colonIdx > 0) {
        modelProvider = modelKey.substring(0, colonIdx)
        modelName = modelKey.substring(colonIdx + 1)
      }
    }

    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        system_prompt: systemPrompt.trim(),
        model_provider: modelProvider || '',
        model_name: modelName || '',
        tools_config: toolsConfig,
      })
    } catch (error) {
      console.error('Agent form submission failed:', error)
      throw error // Re-throw so mutation's onError can handle it
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">
          Name *
          {isSystem && (
            <span className="text-amber-400 ml-2">(protected — cannot be changed)</span>
          )}
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={isSystem}
          placeholder="e.g. My Code Reviewer"
          className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:border-sky-500 focus:outline-none ${
            isSystem ? 'text-gray-500 cursor-not-allowed opacity-60' : 'text-white'
          }`}
          required={!isSystem}
        />
        {isSystem && (
          <p className="text-xs text-amber-400/80 mt-1">
            System agent names are fixed to maintain the delegation chain. You can customize all other settings below.
          </p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What does this agent do?"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-sky-500 focus:outline-none"
        />
      </div>

      {/* System Prompt */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">System Prompt</label>
        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          placeholder="Instructions that define the agent's behavior..."
          rows={4}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-sky-500 focus:outline-none resize-none"
        />
      </div>

      {/* Model */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">
          Model <span className="text-gray-600">(optional — inherits from chat if empty)</span>
        </label>
        <select
          value={modelKey}
          onChange={e => setModelKey(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
        >
          <option value="">Inherit from chat</option>
          {models.map(m => (
            <option key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
              [{m.provider}] {m.name || m.id}
            </option>
          ))}
        </select>
      </div>

      {/* Tools */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-2">
          Tools ({toolsConfig.length} selected)
        </label>
        <div className="space-y-1.5">
          {AVAILABLE_TOOLS.map(tool => (
            <label
              key={tool.value}
              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                toolsConfig.includes(tool.value)
                  ? 'border-sky-600 bg-sky-900/20'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
            >
              <input
                type="checkbox"
                checked={toolsConfig.includes(tool.value)}
                onChange={() => toggleTool(tool.value)}
                className="rounded bg-gray-700 border-gray-600 text-sky-500 focus:ring-sky-500"
              />
              <div>
                <span className="text-sm text-white">{tool.label}</span>
                <span className="text-xs text-gray-500 ml-2">{tool.description}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="submit" disabled={submitting || !name.trim()}>
          {submitting ? 'Saving...' : initialData ? 'Update Agent' : 'Create Agent'}
        </Button>
      </div>
    </form>
  )
}
