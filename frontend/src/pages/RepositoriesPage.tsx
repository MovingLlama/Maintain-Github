import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listLocalRepos, listGithubRepos, cloneRepo, getRepoFiles, readFile, writeFile, pushRepo } from '../api/repositories'
import { RepoCard } from '../components/repos/RepoCard'
import { FileTree } from '../components/repos/FileTree'
import { Button } from '../components/common/Button'
import { useRepoStore } from '../stores/repoStore'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { GitBranch, Download, Upload, RefreshCw, Plus, X } from 'lucide-react'
import { GitHubRepo, Repository } from '../types'

export function RepositoriesPage() {
  const [showGithub, setShowGithub] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [showPushModal, setShowPushModal] = useState(false)
  const { selectedRepo, selectedFile, fileContent, isDirty, setSelectedRepo, setSelectedFile, setFileContent, setDirty } = useRepoStore()
  const qc = useQueryClient()

  const { data: localRepos = [], isLoading } = useQuery({ queryKey: ['repos'], queryFn: listLocalRepos })
  const { data: githubRepos = [], isLoading: ghLoading } = useQuery({
    queryKey: ['github-repos'],
    queryFn: () => listGithubRepos(),
    enabled: showGithub,
  })
  const { data: filesData } = useQuery({
    queryKey: ['repo-files', selectedRepo?.id],
    queryFn: () => getRepoFiles(selectedRepo!.id),
    enabled: !!selectedRepo && selectedRepo.status === 'ready',
  })

  const cloneMutation = useMutation({
    mutationFn: (repo: GitHubRepo) => cloneRepo({
      github_repo_id: repo.id,
      full_name: repo.full_name,
      name: repo.name,
      description: repo.description || undefined,
      default_branch: repo.default_branch,
      is_private: repo.private,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['repos'] }); setShowGithub(false) },
  })

  const handleFileSelect = async (path: string) => {
    if (!selectedRepo) return
    setSelectedFile(path)
    const { content } = await readFile(selectedRepo.id, path)
    setFileContent(content)
    setDirty(false)
  }

  const handleSaveFile = async () => {
    if (!selectedRepo || !selectedFile || fileContent === null) return
    await writeFile(selectedRepo.id, selectedFile, fileContent)
    setDirty(false)
  }

  const handlePush = async () => {
    if (!selectedRepo || !commitMsg.trim()) return
    await pushRepo(selectedRepo.id, commitMsg)
    setCommitMsg('')
    setShowPushModal(false)
    qc.invalidateQueries({ queryKey: ['repos'] })
  }

  const getLanguage = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase()
    const map: Record<string, string> = { py: 'python', ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', md: 'markdown', json: 'json', yml: 'yaml', yaml: 'yaml', sh: 'bash', css: 'css', html: 'html', rs: 'rust', go: 'go' }
    return map[ext || ''] || 'text'
  }

  return (
    <div className="h-full flex">
      {/* Left: Repo List */}
      <div className="w-72 border-r border-gray-800 flex flex-col bg-gray-900">
        <div className="p-3 border-b border-gray-800 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white flex-1">Repositories</h2>
          <Button size="sm" variant="ghost" onClick={() => setShowGithub(true)}>
            <Plus className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ['repos'] })}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <p className="text-xs text-gray-500 text-center py-4">Loading...</p>
          ) : !Array.isArray(localRepos) || localRepos.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <GitBranch className="w-8 h-8 text-gray-600 mx-auto" />
              <p className="text-xs text-gray-500">No repositories yet.<br />Click + to add one from GitHub.</p>
            </div>
          ) : (
            localRepos.map(repo => (
              <RepoCard
                key={repo.id}
                repo={repo}
                isSelected={selectedRepo?.id === repo.id}
                onClick={() => setSelectedRepo(repo)}
              />
            ))
          )}
        </div>
      </div>

      {/* Middle: File Tree */}
      {selectedRepo && (
        <div className="w-56 border-r border-gray-800 flex flex-col bg-gray-900">
          <div className="p-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-300 truncate">{selectedRepo.name}</span>
            {isDirty && (
              <Button size="sm" variant="ghost" onClick={handleSaveFile} className="text-sky-400 text-xs">
                Save
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {filesData ? (
              <FileTree files={filesData.files} onFileSelect={handleFileSelect} selectedFile={selectedFile} />
            ) : (
              <p className="text-xs text-gray-500 text-center py-4">
                {selectedRepo.status === 'cloning' ? 'Cloning...' : 'Select a ready repo'}
              </p>
            )}
          </div>
          <div className="p-2 border-t border-gray-800 space-y-1">
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={() => setShowPushModal(true)}
              disabled={selectedRepo.status !== 'ready'}
            >
              <Upload className="w-3.5 h-3.5" />
              Push to GitHub
            </Button>
          </div>
        </div>
      )}

      {/* Right: File Editor */}
      <div className="flex-1 flex flex-col bg-gray-950">
        {selectedFile && fileContent !== null ? (
          <>
            <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-3">
              <span className="text-xs text-gray-400 font-mono">{selectedFile}</span>
              {isDirty && <span className="w-2 h-2 rounded-full bg-sky-400" title="Unsaved changes" />}
            </div>
            <div className="flex-1 overflow-auto">
              <SyntaxHighlighter
                language={getLanguage(selectedFile)}
                style={oneDark}
                customStyle={{ margin: 0, borderRadius: 0, background: 'transparent', fontSize: '13px', minHeight: '100%' }}
                showLineNumbers
              >
                {fileContent}
              </SyntaxHighlighter>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            <div className="text-center space-y-2">
              <GitBranch className="w-12 h-12 mx-auto opacity-30" />
              <p className="text-sm">Select a file to view its contents</p>
            </div>
          </div>
        )}
      </div>

      {/* GitHub Repos Modal */}
      {showGithub && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-white">Add GitHub Repository</h3>
              <button onClick={() => setShowGithub(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {ghLoading ? <p className="text-gray-400 text-sm text-center py-4">Loading...</p> : (Array.isArray(githubRepos) ? githubRepos : []).map(repo => (
                <div key={repo.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{repo.full_name}</p>
                    {repo.description && <p className="text-xs text-gray-400 truncate">{repo.description}</p>}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => cloneMutation.mutate(repo)}
                    isLoading={cloneMutation.isPending}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Clone
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Push Modal */}
      {showPushModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-white">Commit & Push</h3>
            <p className="text-xs text-gray-400">All changes will be committed and pushed to GitHub.</p>
            <input
              type="text"
              placeholder="Commit message..."
              value={commitMsg}
              onChange={e => setCommitMsg(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sky-500"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowPushModal(false)}>Cancel</Button>
              <Button onClick={handlePush} disabled={!commitMsg.trim()}>
                <Upload className="w-4 h-4" />
                Push
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
