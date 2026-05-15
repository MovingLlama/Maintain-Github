import { Bot, Pencil, Trash2, MessageSquare } from 'lucide-react'
import { Chat } from '../../types'

interface AgentCardProps {
  agent: Chat
  isActive: boolean
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
  onChat: () => void
}

export function AgentCard({ agent, isActive, onClick, onEdit, onDelete, onChat }: AgentCardProps) {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl border cursor-pointer transition-all group ${
        isActive
          ? 'bg-sky-900/20 border-sky-700/50'
          : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-lg flex-shrink-0 ${isActive ? 'bg-sky-500/20' : 'bg-gray-700'}`}>
            <Bot className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-gray-400'}`} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-white truncate">{agent.title}</h3>
            <p className="text-[10px] text-gray-500 truncate">
              {agent.model_provider}/{agent.model_name || 'default'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onChat() }}
            className="p-1 rounded text-gray-400 hover:text-sky-400 hover:bg-gray-700 transition-colors"
            title="Open chat"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onEdit() }}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            title="Edit agent"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-gray-700 transition-colors"
            title="Delete agent"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {agent.system_prompt && (
        <p className="mt-2 text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
          {agent.system_prompt.slice(0, 120)}
          {agent.system_prompt.length > 120 ? '...' : ''}
        </p>
      )}
      {!agent.system_prompt && (
        <p className="mt-2 text-[11px] text-gray-600 italic">Default system prompt</p>
      )}
    </div>
  )
}
