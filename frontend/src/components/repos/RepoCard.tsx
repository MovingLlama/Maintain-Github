import { ReactElement } from 'react'
import { Repository } from '../../types'
import { GitBranch, Lock, Unlock, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'

interface RepoCardProps {
  repo: Repository
  isSelected: boolean
  onClick: () => void
}

const statusIcon: Record<Repository['status'], ReactElement> = {
  ready:   <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
  cloning: <Loader2 className="w-3 h-3 text-sky-400 animate-spin" />,
  pushing: <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />,
  pending: <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />,
  error:   <AlertCircle className="w-3 h-3 text-red-400" />,
}

const statusLabel: Record<Repository['status'], string> = {
  ready:   'Ready',
  cloning: 'Cloning…',
  pushing: 'Pushing…',
  pending: 'Pending',
  error:   'Error',
}

export function RepoCard({ repo, isSelected, onClick }: RepoCardProps) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-left rounded-lg px-3 py-2 transition-colors group',
        isSelected
          ? 'bg-sky-600/20 border border-sky-500/40'
          : 'bg-gray-800/50 border border-transparent hover:bg-gray-800',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <GitBranch className="w-3.5 h-3.5 mt-0.5 text-gray-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">{repo.name}</p>
          {repo.description && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{repo.description}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            {statusIcon[repo.status]}
            <span className="text-xs text-gray-500">{statusLabel[repo.status]}</span>
            <span className="ml-auto">
              {repo.is_private
                ? <Lock className="w-3 h-3 text-gray-600" />
                : <Unlock className="w-3 h-3 text-gray-700" />}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}
