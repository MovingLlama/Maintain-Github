import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listAgents, createAgent, updateAgent, deleteAgent } from '../api/agents'
import { listModels } from '../api/ai'
import { AgentCard } from '../components/agents/AgentCard'
import { AgentForm, AgentFormData } from '../components/agents/AgentForm'
import { Button } from '../components/common/Button'
import { Agent, AIModel } from '../types'
import { Bot, Plus, X } from 'lucide-react'
import { useIsMobile } from '../hooks/useMediaQuery'

function modelKey(provider: string, modelId: string) {
  return `${provider}:${modelId}`
}

export function AgentPage() {
  const isMobile = useIsMobile()
  const [showForm, setShowForm] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: listAgents,
  })

  const { data: models } = useQuery({
    queryKey: ['models'],
    queryFn: listModels,
  })

  // Separate system vs user agents
  const { systemAgents, userAgents } = useMemo(() => {
    if (!Array.isArray(agents)) return { systemAgents: [], userAgents: [] }
    return {
      systemAgents: agents.filter(a => a.is_default),
      userAgents: agents.filter(a => !a.is_default),
    }
  }, [agents])

  // All available models for the form
  const allModels: AIModel[] = useMemo(() => {
    return [
      ...(models?.ollama ?? []),
      ...(models?.openrouter ?? []),
    ]
  }, [models])

  const createMutation = useMutation({
    mutationFn: (data: AgentFormData) => createAgent({
      name: data.name,
      description: data.description || undefined,
      system_prompt: data.system_prompt || undefined,
      model_provider: data.model_provider || undefined,
      model_name: data.model_name || undefined,
      tools_config: data.tools_config || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      setShowForm(false)
      setEditingAgent(null)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AgentFormData }) => updateAgent(id, {
      name: editingAgent?.is_default ? undefined : data.name, // never send name for system agents
      description: data.description || undefined,
      system_prompt: data.system_prompt || undefined,
      model_provider: data.model_provider || undefined,
      model_name: data.model_name || undefined,
      tools_config: data.tools_config || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
      setShowForm(false)
      setEditingAgent(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAgent,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] })
    },
  })

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <Bot className="w-5 h-5 md:w-6 md:h-6 text-sky-400" />
              Agents
            </h1>
            <p className="text-xs md:text-sm text-gray-400 mt-1">
              Agents define AI personas with custom system prompts and tool access.
              System agents are shared templates. Create your own for specific workflows.
            </p>
          </div>
          <Button onClick={() => { setEditingAgent(null); setShowForm(true) }} size={isMobile ? 'sm' : 'md'}>
            <Plus className="w-4 h-4" />
            New Agent
          </Button>
        </div>

        {/* Create/Edit Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-0 md:p-4" onClick={() => setShowForm(false)}>
            <div
              className="bg-gray-900 border border-gray-700 md:rounded-xl w-full h-full md:max-w-lg md:mx-4 md:max-h-[90vh] md:h-auto p-4 md:p-6 overflow-y-auto flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4 shrink-0">
                <h2 className="text-lg font-semibold text-white">
                  {editingAgent
                    ? editingAgent.is_default ? 'Edit System Agent' : 'Edit Agent'
                    : 'Create Agent'}
                </h2>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <AgentForm
                  onSubmit={async (data) => {
                    if (editingAgent) {
                      await updateMutation.mutateAsync({ id: editingAgent.id, data })
                    } else {
                      await createMutation.mutateAsync(data)
                    }
                  }}
                  models={allModels}
                  isSystem={editingAgent?.is_default ?? false}
                  initialData={editingAgent ? {
                    name: editingAgent.name,
                    description: editingAgent.description || '',
                    system_prompt: editingAgent.system_prompt || '',
                    model_provider: editingAgent.model_provider || '',
                    model_name: editingAgent.model_name || '',
                    tools_config: editingAgent.tools_config,
                  } : undefined}
                />
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sky-500 mx-auto"></div>
          </div>
        )}

        {/* System Agents */}
        {systemAgents.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              System Agents
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {systemAgents.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isSystem={true}
                  onEdit={() => { setEditingAgent(agent); setShowForm(true) }}
                  onDelete={() => deleteMutation.mutate(agent.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* User Agents */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Your Agents
          </h2>
          {userAgents.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-gray-700 rounded-xl">
              <Bot className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                No custom agents yet. Create one based on your workflow.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {userAgents.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isSystem={false}
                  onEdit={() => { setEditingAgent(agent); setShowForm(true) }}
                  onDelete={() => deleteMutation.mutate(agent.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
