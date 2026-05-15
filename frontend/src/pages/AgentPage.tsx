import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listChats, createChat, deleteChat, updateChatTitle } from '../api/chats'
import { listModels } from '../api/ai'
import { getUserSettings } from '../api/settings'
import { listLocalRepos } from '../api/repositories'
import { AgentCard } from '../components/agents/AgentCard'
import { AgentForm, AgentFormData } from '../components/agents/AgentForm'
import { Button } from '../components/common/Button'
import { Chat, AIModel } from '../types'
import { Bot, Plus, X } from 'lucide-react'

function modelKey(provider: string, modelId: string) {
  return `${provider}:${modelId}`
}

export function AgentPage() {
  const [showForm, setShowForm] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Chat | null>(null)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: chats = [] } = useQuery({ queryKey: ['chats'], queryFn: listChats })
  const { data: models } = useQuery({ queryKey: ['models'], queryFn: listModels })
  const { data: settings } = useQuery({
    queryKey: ['userSettings'],
    queryFn: getUserSettings,
  })
  const { data: repos = [] } = useQuery({
    queryKey: ['localRepos'],
    queryFn: listLocalRepos,
  })

  // Filter agent-mode chats
  const agents = useMemo(() => {
    if (!Array.isArray(chats)) return []
    return chats.filter(c => c.is_agent_mode)
  }, [chats])

  // Enabled models
  const enabledModels = useMemo(() => {
    const all: AIModel[] = [
      ...(models?.ollama ?? []),
      ...(models?.openrouter ?? []),
    ]
    const enabledKeys = settings?.enabled_models
    if (!enabledKeys || enabledKeys.length === 0) return all
    return all.filter(m => enabledKeys.includes(modelKey(m.provider, m.id)))
  }, [models, settings])

  const createMutation = useMutation({
    mutationFn: (data: AgentFormData) =>
      createChat({
        title: data.title,
        model_provider: data.model_provider,
        model_name: data.model_name,
        system_prompt: data.system_prompt || undefined,
        is_agent_mode: true,
        repository_id: data.repository_id || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chats'] })
      setShowForm(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      updateChatTitle(id, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chats'] })
      setEditingAgent(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteChat,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chats'] })
      if (editingAgent && activeAgentId === editingAgent.id) {
        setActiveAgentId(null)
      }
      setEditingAgent(null)
    },
  })

  const handleEditSave = (data: AgentFormData) => {
    if (!editingAgent) return
    // For now, we support editing the title (and system prompt could be added later)
    updateMutation.mutate({ id: editingAgent.id, title: data.title })
  }

  const handleOpenChat = (agentId: string) => {
    navigate(`/chat`)
    // The chat page will need to select this agent; we could use query params or local storage
    // For simplicity, navigate to chat and store intent
    sessionStorage.setItem('activeAgentChatId', agentId)
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bot className="w-6 h-6 text-sky-400" />
            Agents
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Configure AI agents with custom prompts and tools for specialized tasks.
          </p>
        </div>
        <Button
          onClick={() => { setShowForm(true); setEditingAgent(null) }}
          disabled={enabledModels.length === 0}
        >
          <Plus className="w-4 h-4" />
          New Agent
        </Button>
      </div>

      {/* Create/Edit Form Modal */}
      {(showForm || editingAgent) && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              {editingAgent ? 'Edit Agent' : 'Create New Agent'}
            </h2>
            <button
              onClick={() => { setShowForm(false); setEditingAgent(null) }}
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <AgentForm
            initial={
              editingAgent
                ? {
                    title: editingAgent.title,
                    system_prompt: editingAgent.system_prompt ?? '',
                    model_provider: editingAgent.model_provider,
                    model_name: editingAgent.model_name ?? '',
                    repository_id: editingAgent.repository_id,
                  }
                : undefined
            }
            enabledModels={enabledModels}
            repositories={repos.map((r: any) => ({ id: r.id, full_name: r.full_name }))}
            onSave={editingAgent ? handleEditSave : (data) => createMutation.mutate(data)}
            onCancel={() => { setShowForm(false); setEditingAgent(null) }}
            isPending={createMutation.isPending || updateMutation.isPending}
          />
        </div>
      )}

      {/* Agent List */}
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Bot className="w-16 h-16 text-gray-700" />
          <div className="text-center space-y-1">
            <h3 className="text-lg font-semibold text-white">No Agents Yet</h3>
            <p className="text-sm text-gray-400 max-w-sm">
              Create your first AI agent with a custom system prompt to handle specialized
              tasks like code review, refactoring, documentation, or debugging.
            </p>
          </div>
          <Button
            onClick={() => setShowForm(true)}
            disabled={enabledModels.length === 0}
          >
            <Plus className="w-4 h-4" />
            Create First Agent
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isActive={activeAgentId === agent.id}
              onClick={() => setActiveAgentId(agent.id === activeAgentId ? null : agent.id)}
              onEdit={() => {
                setEditingAgent(agent)
                setShowForm(false)
              }}
              onDelete={() => {
                if (window.confirm(`Delete agent "${agent.title}"?`)) {
                  deleteMutation.mutate(agent.id)
                }
              }}
              onChat={() => handleOpenChat(agent.id)}
            />
          ))}
        </div>
      )}

      {/* Info Box */}
      {agents.length > 0 && (
        <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
          <h3 className="text-xs font-semibold text-gray-400 mb-2">How Agents Work</h3>
          <ul className="space-y-1 text-[11px] text-gray-500 leading-relaxed">
            <li>• Each agent is a specialized chat with a custom <strong>system prompt</strong> that defines its behavior.</li>
            <li>• Agents in <strong>agent mode</strong> can use tools to read/write files, view git diffs, and search code.</li>
            <li>• Attach a <strong>repository</strong> to give the agent context about your codebase.</li>
            <li>• Start a <strong>chat</strong> with any agent to begin working on tasks.</li>
          </ul>
        </div>
      )}
    </div>
  )
}
