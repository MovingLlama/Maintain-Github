import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listLocalRepos, listGithubRepos, cloneRepo, getRepoFiles, readFile, writeFile, pushRepo } from '../api/repositories'
import { listAgents } from '../api/agents'
import { createChat } from '../api/chats'
import { RepoCard } from '../components/repos/RepoCard'
import { FileTree } from '../components/repos/FileTree'
import { Button } from '../components/common/Button'
import { useRepoStore } from '../stores/repoStore'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { GitBranch, Download, Upload, RefreshCw, Plus, X, MessageSquare, AlertCircle, Brain, Lightbulb, Loader2 } from 'lucide-react'
import { GitHubRepo, Repository, RepoIssue, Agent } from '../types'
import api from '../api/client'

export function RepositoriesPage() {
  const [showGithub, setShowGithub] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [showPushModal, setShowPushModal] = useState(false)
  const [showAgentModal, setShowAgentModal] = useState<string | null>(null) // repo id
  const [showIssuesTab, setShowIssuesTab] = useState(false)
  const [issues, setIssues] = useState<RepoIssue[]>([])
  const [issuesLoading, setIssuesLoading] = useState(false)
  const [analyzingIssueId, setAnalyzingIssueId] = useState<string | null>(null)
  const { selectedRepo, selectedFile, fileContent, isDirty, setSelectedRepo, setSelectedFile, setFileContent, setDirty } = useRepoStore()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: localRepos = [], isLoading, isError: localError, error: localErrObj } = useQuery({ queryKey: ['repos'], queryFn: listLocalRepos })
  const { data: githubRepos = [], isLoading: ghLoading, isError: ghError, error: ghErrObj } = useQuery({
    queryKey: ['github-repos'],
    queryFn: () => listGithubRepos(),
    enabled: showGithub,
    retry: 1,
  })
  const { data: filesData } = useQuery({
    queryKey: ['repo-files', selectedRepo?.id],
    queryFn: () => getRepoFiles(selectedRepo!.id),
    enabled: !!selectedRepo && selectedRepo.status === 'ready',
  })
  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: listAgents,
  })

  // Load issues when issues tab is opened
  useEffect(() => {
    if (showIssuesTab && selectedRepo) {
      setIssuesLoading(true)
      api.get(`/repositories/${selectedRepo.id}/issues`)
        .then(r => setIssues(r.data))
        .catch(() => setIssues([]))
        .finally(() => setIssuesLoading(false))
    }
  }, [showIssuesTab, selectedRepo?.id])

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

  const handleStartChat = async (agentId: string) => {
    if (!selectedRepo) return
    try {
      const chat = await createChat({
        title: `Chat in ${selectedRepo.name}`,
        agent_id: agentId,
        repository_ids: [selectedRepo.id],
        model_provider: 'ollama',
        model_name: null,
      })
      setShowAgentModal(null)
      navigate('/chat')
      sessionStorage.setItem('activeChatId', chat.id)
    } catch (err) {
      console.error('Failed to create chat:', err)
    }
  }

  const handleSyncIssues = async () => {
    if (!selectedRepo) return
    setIssuesLoading(true)
    try {
      await api.post(`/repositories/${selectedRepo.id}/issues/sync`)
      const r = await api.get(`/repositories/${selectedRepo.id}/issues`)
      setIssues(r.data)
    } catch (err) {
      console.error('Failed to sync issues:', err)
    } finally {
      setIssuesLoading(false)
    }
  }

  const handleAnalyzeIssue = async (issueId: string) => {
    if (!selectedRepo) return
    setAnalyzingIssueId(issueId)
    try {
      const r = await api.post(`/repositories/${selectedRepo.id}/issues/${issueId}/analyze`)
      setIssues(prev => prev.map(i =>
        i.id === issueId ? { ...i, fix_generated: true, fix_summary: r.data.fix_summary, fix_model_used: r.data.model_used } : i
      ))
    } catch (err) {
      console.error('Failed to analyze issue:', err)
    } finally {
      setAnalyzingIssueId(null)
    }
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
          ) : localError ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-xs text-red-400">Failed to load repositories</p>
              <p className="text-xs text-gray-500">{(localErrObj as Error)?.message}</p>
              <Button size="sm" variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ['repos'] })}>
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </Button>
            </div>
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
                onClick={() => { setSelectedRepo(repo); setShowIssuesTab(false) }}
              />
            ))
          )}
        </div>
      </div>

      {/* Middle: File Tree + Tabs */}
      {selectedRepo && (
        <div className="w-56 border-r border-gray-800 flex flex-col bg-gray-900">
          {/* Tab Switcher */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setShowIssuesTab(false)}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                !showIssuesTab ? 'text-sky-400 border-b-2 border-sky-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Files
            </button>
            <button
              onClick={() => setShowIssuesTab(true)}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                showIssuesTab ? 'text-sky-400 border-b-2 border-sky-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Issues
            </button>
          </div>

          {!showIssuesTab ? (
            <>
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
                  onClick={() => setShowAgentModal(selectedRepo.id)}
                  disabled={selectedRepo.status !== 'ready'}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Start Chat
                </Button>
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
            </>
          ) : (
            /* Issues Tab */
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-300">Issues</span>
                <Button size="sm" variant="ghost" onClick={handleSyncIssues} disabled={issuesLoading}>
                  <RefreshCw className={`w-3 h-3 ${issuesLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              {issuesLoading ? (
                <p className="text-xs text-gray-500 text-center py-4">Loading issues...</p>
              ) : issues.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <AlertCircle className="w-8 h-8 text-gray-600 mx-auto" />
                  <p className="text-xs text-gray-500">No issues found.<br/>Click refresh to sync from GitHub.</p>
                </div>
              ) : (
                issues.map(issue => (
                  <div key={issue.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={issue.html_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-white hover:text-sky-400 truncate"
                      >
                        #{issue.number} {issue.title}
                      </a>
                      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                        issue.state === 'open' ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-400'
                      }`}>
                        {issue.state}
                      </span>
                    </div>
                    {issue.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {issue.labels.map(label => (
                          <span key={label} className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">{label}</span>
                        ))}
                      </div>
                    )}
                    {/* Fix section */}
                    {issue.fix_generated && issue.fix_summary ? (
                      <div className="bg-sky-900/20 border border-sky-800 rounded p-2">
                        <div className="flex items-center gap-1 text-xs text-sky-400 mb-1">
                          <Lightbulb className="w-3 h-3" />
                          AI-Generated Fix
                          {issue.fix_model_used && (
                            <span className="text-gray-500">via {issue.fix_model_used}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-300 whitespace-pre-wrap line-clamp-6">{issue.fix_summary}</p>
                      </div>
                    ) : issue.state === 'open' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full text-xs"
                        onClick={() => handleAnalyzeIssue(issue.id)}
                        disabled={analyzingIssueId === issue.id}
                      >
                        {analyzingIssueId === issue.id ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</>
                        ) : (
                          <><Brain className="w-3 h-3" /> Analyze with AI</>
                        )}
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Right: File Editor or Empty State */}
      <div className="flex-1 bg-gray-950 overflow-y-auto">
        {!selectedRepo ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <GitBranch className="w-12 h-12 text-gray-700 mx-auto" />
              <p className="text-gray-500 text-sm">Select a repository to view files or issues</p>
            </div>
          </div>
        ) : selectedFile && fileContent !== null ? (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400 font-mono">{selectedFile}</span>
            </div>
            <SyntaxHighlighter
              language={getLanguage(selectedFile)}
              style={oneDark}
              customStyle={{ margin: 0, borderRadius: '0.5rem', fontSize: '0.875rem' }}
            >
              {fileContent}
            </SyntaxHighlighter>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <Download className="w-10 h-10 text-gray-700 mx-auto" />
              <p className="text-gray-500 text-sm">Select a file to view its content</p>
            </div>
          </div>
        )}
      </div>

      {/* GitHub Repo Selector Modal */}
      {showGithub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4 p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Import from GitHub</h2>
              <button onClick={() => setShowGithub(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {ghLoading ? (
                <p className="text-sm text-gray-500 text-center py-4">Loading repositories...</p>
              ) : ghError ? (
                <div className="text-center py-4">
                  <p className="text-sm text-red-400">Failed to load repositories</p>
                  <p className="text-xs text-gray-500">{(ghErrObj as Error)?.message || 'Please ensure you have authenticated with GitHub.'}</p>
                </div>
              ) : (
                githubRepos.map(repo => (
                  <div key={repo.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{repo.full_name}</p>
                      <p className="text-xs text-gray-400 truncate">{repo.description || 'No description'}</p>
                    </div>
                    <Button size="sm" onClick={() => cloneMutation.mutate(repo)} disabled={cloneMutation.isPending}>
                      <Download className="w-3.5 h-3.5" />
                      Clone
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Agent Selection Modal */}
      {showAgentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Start Chat — Select Agent</h2>
              <button onClick={() => setShowAgentModal(null)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Choose an agent persona for your chat in <span className="text-sky-400">{selectedRepo?.name}</span>.
              The agent's tools and system prompt will be used.
            </p>
            <div className="space-y-2">
              {agents.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No agents available. Create agents on the Agent page first.
                </p>
              ) : (
                agents.filter(a => a.is_active).map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => handleStartChat(agent.id)}
                    className="w-full text-left p-3 bg-gray-800 border border-gray-700 rounded-lg hover:border-sky-600 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{agent.name}</span>
                      {agent.is_default && (
                        <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">System</span>
                      )}
                    </div>
                    {agent.description && (
                      <p className="text-xs text-gray-400 mt-1">{agent.description}</p>
                    )}
                    {agent.tools_config.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {agent.tools_config.map(t => (
                          <span key={t} className="text-xs bg-gray-700 text-gray-500 px-1 py-0.5 rounded">{t}</span>
                        ))}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-800">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => handleStartChat('')}
              >
                <MessageSquare className="w-4 h-4" />
                Start without Agent (General Chat)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Push Modal */}
      {showPushModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Push to GitHub</h2>
              <button onClick={() => setShowPushModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <input
              type="text"
              value={commitMsg}
              onChange={e => setCommitMsg(e.target.value)}
              placeholder="Commit message..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 mb-3"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowPushModal(false)}>Cancel</Button>
              <Button onClick={handlePush} disabled={!commitMsg.trim()}>Push</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
