import { Agent, AIModel } from '../../types'
import { Bot, Trash2, Edit3, Lock } from 'lucide-react'

interface AgentCardProps {
  agent: Agent
  isSystem: boolean
  onEdit?: () => void
  onDelete?: () => void
}

export function AgentCard({ agent, isSystem, onEdit, onDelete }: AgentCardProps) {
  const toolLabels: Record<string, string> = {
    read_file: 'Read',
    write_file: 'Write',
    list_files: 'List',
    get_git_diff: 'Diff',
    get_git_log: 'Log',
    search_in_files: 'Search',
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="w-4 h-4 text-sky-400 shrink-0" />
          <h3 className="text-sm font-semibold text-white truncate">{agent.name}</h3>
          {isSystem && (
            <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
              <Lock className="w-2.5 h-2.5" />
              System
            </span>
          )}
        </div>
        {!isSystem && (
          <div className="flex items-center gap-1 shrink-0">
            {onEdit && (
              <button
                onClick={onEdit}
                className="text-gray-500 hover:text-sky-400 p-1 transition-colors"
                title="Edit agent"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="text-gray-500 hover:text-red-400 p-1 transition-colors"
                title="Delete agent"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {agent.description && (
        <p className="text-xs text-gray-400 mt-2 line-clamp-2">{agent.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {agent.model_provider && agent.model_name && (
          <span className="text-xs bg-sky-900/30 text-sky-300 px-1.5 py-0.5 rounded">
            {agent.model_name}
          </span>
        )}
        {agent.tools_config.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {agent.tools_config.map(tool => (
              <span
                key={tool}
                className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded"
              >
                {toolLabels[tool] || tool}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
