import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listChats, createChat, deleteChat, updateChatTitle, listMessages, sendMessage } from '../api/chats'
import { listModels } from '../api/ai'
import { getUserSettings } from '../api/settings'
import { listLocalRepos } from '../api/repositories'
import { ChatMessage } from '../components/chat/ChatMessage'
import { ChatInput } from '../components/chat/ChatInput'
import { Button } from '../components/common/Button'
import { Chat, Message, AIModel, Repository } from '../types'
import { Plus, Trash2, MessageSquare, ChevronDown, Database, Check, X } from 'lucide-react'
import { useIsMobile } from '../hooks/useMediaQuery'

function modelKey(provider: string, modelId: string) {
  return `${provider}:${modelId}`
}

type MobileTab = 'chats' | 'messages' | 'tools'

export function ChatPage() {
  const isMobile = useIsMobile()
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [localMessages, setLocalMessages] = useState<Message[]>([])
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [selectedRepoIds, setSelectedRepoIds] = useState<string[]>([])
  const [mobileTab, setMobileTab] = useState<MobileTab>('messages')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  const { data: chats = [] } = useQuery({ queryKey: ['chats'], queryFn: listChats })
  const { data: models } = useQuery({ queryKey: ['models'], queryFn: listModels })
  const { data: settings } = useQuery({ queryKey: ['userSettings'], queryFn: getUserSettings })
  const { data: repos = [] } = useQuery({ queryKey: ['repoTools'], queryFn: listLocalRepos })
  const { data: messages = [] } = useQuery({
    queryKey: ['messages', activeChatId],
    queryFn: () => listMessages(activeChatId!),
    enabled: !!activeChatId,
  })

  // Sync selected repos with active chat's repos
  useEffect(() => {
    if (activeChatId) {
      const activeChat = chats.find(c => c.id === activeChatId)
      if (activeChat?.repository_ids) {
        setSelectedRepoIds(activeChat.repository_ids)
      }
    }
  }, [activeChatId, chats])

  const enabledModels: AIModel[] = useMemo(() => {
    const all: AIModel[] = [...(models?.ollama ?? []), ...(models?.openrouter ?? [])]
    const enabledKeys = settings?.enabled_models
    if (!enabledKeys || enabledKeys.length === 0) return all
    return all.filter(m => enabledKeys.includes(modelKey(m.provider, m.id)))
  }, [models, settings])

  const defaultModelKey = useMemo(() => {
    if (settings?.default_chat_model && enabledModels.some(
      m => modelKey(m.provider, m.id) === settings.default_chat_model
    )) return settings.default_chat_model
    if (enabledModels.length > 0) return modelKey(enabledModels[0].provider, enabledModels[0].id)
    return null
  }, [enabledModels, settings])

  useEffect(() => { if (!selectedModelKey && defaultModelKey) setSelectedModelKey(defaultModelKey) }, [defaultModelKey, selectedModelKey])
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowModelDropdown(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  useEffect(() => { setLocalMessages(messages) }, [messages])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [localMessages])

  const getModel = (): { model_provider: 'ollama' | 'openrouter'; model_name: string | null } => {
    const key = selectedModelKey || defaultModelKey
    if (!key) return { model_provider: 'ollama', model_name: null }
    const colonIdx = key.indexOf(':')
    return { model_provider: key.substring(0, colonIdx) as 'ollama' | 'openrouter', model_name: key.substring(colonIdx + 1) }
  }

  const createChatMutation = useMutation({
    mutationFn: () => {
      const model = getModel()
      return createChat({
        title: 'New Chat',
        model_provider: model.model_provider,
        model_name: model.model_name,
        repository_ids: selectedRepoIds.length > 0 ? selectedRepoIds : undefined,
      })
    },
    onSuccess: (chat) => {
      qc.invalidateQueries({ queryKey: ['chats'] })
      setActiveChatId(chat.id)
      if (isMobile) setMobileTab('messages')
    },
  })

  const sendMutation = useMutation({
    mutationFn: ({ chatId, content }: { chatId: string; content: string }) => sendMessage(chatId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages', activeChatId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteChat,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chats'] })
      if (activeChatId) setActiveChatId(null)
    },
  })

  const handleSend = async (content: string) => {
    let chatId = activeChatId
    if (!chatId) {
      try {
        const chat = await createChatMutation.mutateAsync()
        chatId = chat.id
      } catch { return }
    }
    const userMsg: Message = { id: 'temp-' + Date.now(), chat_id: chatId, role: 'user', content, tool_calls: null, tool_result: null, model_used: null, created_at: new Date().toISOString() }
    setLocalMessages(prev => [...prev, userMsg])
    try {
      const resp = await sendMutation.mutateAsync({ chatId, content })
      const assistantMsg: Message = { id: 'temp-resp-' + Date.now(), chat_id: chatId, role: 'assistant' as const, content: resp.content, tool_calls: null, tool_result: null, model_used: null, created_at: new Date().toISOString() }
      setLocalMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      console.error('Failed to send message:', err)
    }
    qc.invalidateQueries({ queryKey: ['chats'] })
  }

  const toggleRepo = (repoId: string) => {
    setSelectedRepoIds(prev =>
      prev.includes(repoId) ? prev.filter(id => id !== repoId) : [...prev, repoId]
    )
  }

  const readyRepos = useMemo(() =>
    (Array.isArray(repos) ? repos : []).filter(r => r.status === 'ready'),
    [repos]
  )

  // ---- Shared sub-components ----

  const modelSelector = (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowModelDropdown(!showModelDropdown)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white hover:border-gray-600"
      >
        {(() => {
          const key = selectedModelKey || defaultModelKey
          if (!key) return <span className="text-gray-500">Select model</span>
          const colonIdx = key.indexOf(':')
          const provider = key.substring(0, colonIdx)
          const modelId = key.substring(colonIdx + 1)
          const model = enabledModels.find(m => m.provider === provider && m.id === modelId)
          return <span>{model?.name || modelId}</span>
        })()}
        <ChevronDown className="w-4 h-4" />
      </button>
      {showModelDropdown && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
          {enabledModels.map(m => (
            <button
              key={modelKey(m.provider, m.id)}
              onClick={() => { setSelectedModelKey(modelKey(m.provider, m.id)); setShowModelDropdown(false) }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-800 flex items-center justify-between ${
                modelKey(m.provider, m.id) === (selectedModelKey || defaultModelKey) ? 'text-sky-400 bg-sky-900/20' : 'text-gray-300'
              }`}
            >
              <span>{m.name || m.id}</span>
              <span className="text-xs text-gray-500">{m.provider}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  const chatListContent = (
    <>
      <div className="p-3 border-b border-gray-800 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-white flex-1">Chats</h2>
        <Button size="sm" variant="ghost" onClick={() => { setActiveChatId(null); setLocalMessages([]); createChatMutation.mutate() }}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {chats.map(chat => (
          <div
            key={chat.id}
            className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              activeChatId === chat.id ? 'bg-sky-900/40 text-sky-300' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
            onClick={() => { setActiveChatId(chat.id); if (isMobile) setMobileTab('messages') }}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            {editingChatId === chat.id ? (
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onBlur={() => { updateChatTitle(chat.id, editTitle); setEditingChatId(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { updateChatTitle(chat.id, editTitle); setEditingChatId(null) } }}
                className="flex-1 bg-gray-800 text-sm text-white px-1 rounded outline-none"
                autoFocus
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="flex-1 text-sm truncate">{chat.title}</span>
            )}
            <button
              className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400"
              onClick={e => { e.stopPropagation(); deleteMutation.mutate(chat.id) }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </>
  )

  const chatAreaContent = (
    <>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3 shrink-0">
        {modelSelector}
        <span className="text-xs text-gray-600 hidden sm:inline">General Chat — no agent persona</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {localMessages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <MessageSquare className="w-10 h-10 text-gray-700 mx-auto" />
              <p className="text-sm text-gray-500">Select a model and start chatting.<br />Toggle repositories in the Tools panel to give context.</p>
            </div>
          </div>
        )}
        {localMessages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-800">
        <ChatInput onSend={handleSend} isLoading={sendMutation.isPending || createChatMutation.isPending} />
      </div>
    </>
  )

  const toolsContent = (
    <>
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Database className="w-4 h-4 text-sky-400" />
          Repository Tools
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Toggle repos to inject their summaries as context for the AI.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {readyRepos.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6">
            No ready repositories. Clone a repo first.
          </p>
        ) : (
          readyRepos.map(repo => (
            <label
              key={repo.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors border ${
                selectedRepoIds.includes(repo.id)
                  ? 'border-sky-600 bg-sky-900/20 text-sky-300'
                  : 'border-transparent bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedRepoIds.includes(repo.id)}
                onChange={() => toggleRepo(repo.id)}
                className="rounded bg-gray-700 border-gray-600 text-sky-500 focus:ring-sky-500"
              />
              <span className="text-xs truncate">{repo.name}</span>
              {selectedRepoIds.includes(repo.id) && (
                <span className="ml-auto text-xs text-sky-400">
                  <Check className="w-3 h-3" />
                </span>
              )}
            </label>
          ))
        )}
      </div>
      <div className="p-2 border-t border-gray-800">
        <p className="text-xs text-gray-600">
          {selectedRepoIds.length > 0
            ? `${selectedRepoIds.length} repo(s) active — summaries injected as context`
            : 'No repo selected — general chat mode'}
        </p>
      </div>
    </>
  )

  // ---- Mobile Layout ----
  if (isMobile) {
    return (
      <div className="h-full flex flex-col">
        {/* Mobile Tab Bar */}
        <div className="flex border-b border-gray-800 bg-gray-900 shrink-0">
          {([
            { key: 'chats' as MobileTab, label: 'Chats' },
            { key: 'messages' as MobileTab, label: activeChatId ? 'Chat' : 'Messages' },
            { key: 'tools' as MobileTab, label: 'Tools' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setMobileTab(tab.key)}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                mobileTab === tab.key
                  ? 'text-sky-400 border-b-2 border-sky-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Panel Content */}
        <div className="flex-1 overflow-hidden">
          {mobileTab === 'chats' && (
            <div className="h-full flex flex-col bg-gray-900">
              {chatListContent}
            </div>
          )}
          {mobileTab === 'messages' && (
            <div className="h-full flex flex-col">
              {chatAreaContent}
            </div>
          )}
          {mobileTab === 'tools' && (
            <div className="h-full flex flex-col bg-gray-900">
              {toolsContent}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---- Desktop Layout (unchanged 3-column) ----
  return (
    <div className="h-full flex">
      {/* Chat List Sidebar */}
      <div className="w-64 border-r border-gray-800 flex flex-col bg-gray-900 shrink-0">
        {chatListContent}
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {chatAreaContent}
      </div>

      {/* Repository Tools Sidebar */}
      <div className="w-60 border-l border-gray-800 flex flex-col bg-gray-900 shrink-0">
        {toolsContent}
      </div>
    </div>
  )
}
