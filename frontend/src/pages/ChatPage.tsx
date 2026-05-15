import { useState, useRef, useEffect, useMemo, KeyboardEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listChats, createChat, deleteChat, updateChatTitle, listMessages, sendMessage } from '../api/chats'
import { listModels } from '../api/ai'
import { getUserSettings } from '../api/settings'
import { ChatMessage } from '../components/chat/ChatMessage'
import { ChatInput } from '../components/chat/ChatInput'
import { Button } from '../components/common/Button'
import { Chat, Message, AIModel } from '../types'
import { Plus, Trash2, MessageSquare, Bot, ChevronDown, Check, X } from 'lucide-react'

function modelKey(provider: string, modelId: string) {
  return `${provider}:${modelId}`
}

export function ChatPage() {
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [localMessages, setLocalMessages] = useState<Message[]>([])
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  const { data: chats = [] } = useQuery({ queryKey: ['chats'], queryFn: listChats })
  const { data: models } = useQuery({ queryKey: ['models'], queryFn: listModels })
  const { data: settings } = useQuery({
    queryKey: ['userSettings'],
    queryFn: getUserSettings,
  })
  const { data: messages = [] } = useQuery({
    queryKey: ['messages', activeChatId],
    queryFn: () => listMessages(activeChatId!),
    enabled: !!activeChatId,
  })

  // Build list of enabled models (fall back to all models if none enabled)
  const enabledModels = useMemo(() => {
    const all: AIModel[] = [
      ...(models?.ollama ?? []),
      ...(models?.openrouter ?? []),
    ]
    const enabledKeys = settings?.enabled_models
    if (!enabledKeys || enabledKeys.length === 0) return all
    return all.filter(m => enabledKeys.includes(modelKey(m.provider, m.id)))
  }, [models, settings])

  // Determine the default model to pre-select
  const defaultModelKey = useMemo(() => {
    if (settings?.default_chat_model && enabledModels.some(
      m => modelKey(m.provider, m.id) === settings.default_chat_model
    )) {
      return settings.default_chat_model
    }
    if (enabledModels.length > 0) {
      return modelKey(enabledModels[0].provider, enabledModels[0].id)
    }
    return null
  }, [enabledModels, settings])

  // Initialize selected model on first load
  useEffect(() => {
    if (!selectedModelKey && defaultModelKey) {
      setSelectedModelKey(defaultModelKey)
    }
  }, [defaultModelKey, selectedModelKey])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    setLocalMessages(messages)
  }, [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages])

  const getModelToCreate = (): { model_provider: 'ollama' | 'openrouter'; model_name: string | null } => {
    const key = selectedModelKey || defaultModelKey
    if (!key) return { model_provider: 'ollama', model_name: null }
    const colonIdx = key.indexOf(':')
    const provider = key.substring(0, colonIdx) as 'ollama' | 'openrouter'
    return {
      model_provider: provider,
      model_name: key.substring(colonIdx + 1),
    }
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const { model_provider, model_name } = getModelToCreate()
      return createChat({ title: 'New Chat', model_provider, model_name })
    },
    onSuccess: (chat) => { qc.invalidateQueries({ queryKey: ['chats'] }); setActiveChatId(chat.id) },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteChat,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['chats'] }); setActiveChatId(null) },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => updateChatTitle(id, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chats'] })
      setEditingChatId(null)
    },
  })

  const startRename = (chat: Chat) => {
    setEditingChatId(chat.id)
    setEditTitle(chat.title)
  }

  const commitRename = (id: string) => {
    const trimmed = editTitle.trim()
    if (trimmed) {
      renameMutation.mutate({ id, title: trimmed })
    } else {
      setEditingChatId(null)
    }
  }

  const handleRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>, id: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename(id)
    } else if (e.key === 'Escape') {
      setEditingChatId(null)
    }
  }

  const sendMutation = useMutation({
    mutationFn: ({ chatId, content }: { chatId: string; content: string }) => sendMessage(chatId, content),
    onMutate: async ({ chatId, content }) => {
      const tempMsg: Message = {
        id: 'temp-user',
        chat_id: chatId,
        role: 'user',
        content,
        tool_calls: null,
        tool_result: null,
        model_used: null,
        created_at: new Date().toISOString(),
      }
      setLocalMessages(prev => [...prev, tempMsg])
      return { chatId }
    },
    onSuccess: (response, { chatId }) => {
      const assistantMsg: Message = {
        id: 'temp-assistant-' + Date.now(),
        chat_id: chatId,
        role: 'assistant',
        content: response.content,
        tool_calls: null,
        tool_result: null,
        model_used: null,
        created_at: new Date().toISOString(),
      }
      setLocalMessages(prev => prev.filter(m => m.id !== 'temp-user').concat(assistantMsg))
      qc.invalidateQueries({ queryKey: ['messages', chatId] })
      // Title is auto-generated server-side in the same transaction;
      // invalidate chats so the sidebar picks up the new title
      qc.invalidateQueries({ queryKey: ['chats'] })
    },
  })

  const selectedModel = enabledModels.find(m => modelKey(m.provider, m.id) === selectedModelKey)

  return (
    <div className="h-full flex">
      {/* Sidebar: Chat List */}
      <div className="w-64 border-r border-gray-800 flex flex-col bg-gray-900">
        <div className="p-3 border-b border-gray-800 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Chats</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => createMutation.mutate()}
              isLoading={createMutation.isPending}
              disabled={enabledModels.length === 0}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Model Selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              disabled={enabledModels.length === 0}
              className="w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-xs text-gray-300 hover:border-gray-600 transition-colors disabled:opacity-50"
            >
              <span className="truncate">
                {selectedModel ? selectedModel.name : enabledModels.length === 0 ? 'No models enabled' : 'Select model'}
              </span>
              <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showModelDropdown && enabledModels.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                {/* Group by provider */}
                {['ollama', 'openrouter'].map(provider => {
                  const providerModels = enabledModels.filter(m => m.provider === provider)
                  if (providerModels.length === 0) return null
                  return (
                    <div key={provider}>
                      <div className="px-2 py-1 text-[10px] text-gray-500 uppercase font-semibold">
                        {provider}
                      </div>
                      {providerModels.map(model => (
                        <button
                          key={modelKey(model.provider, model.id)}
                          onClick={() => {
                            setSelectedModelKey(modelKey(model.provider, model.id))
                            setShowModelDropdown(false)
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 transition-colors ${
                            modelKey(model.provider, model.id) === selectedModelKey ? 'text-sky-300 bg-sky-900/20' : 'text-gray-300'
                          }`}
                        >
                          <span className="truncate block">{model.name}</span>
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {!Array.isArray(chats) || chats.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-500">No chats yet</p>
            </div>
            chats.map(chat => {
              const isEditing = editingChatId === chat.id
              return (
                <div
                  key={chat.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer group transition-colors ${
                    activeChatId === chat.id ? 'bg-sky-900/30 text-sky-300' : 'hover:bg-gray-800 text-gray-300'
                  }`}
                  onClick={() => !isEditing && setActiveChatId(chat.id)}
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0" />
                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-1 min-w-0">
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onKeyDown={e => handleRenameKeyDown(e, chat.id)}
                        onBlur={() => commitRename(chat.id)}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 min-w-0 px-1 py-0.5 text-xs bg-gray-900 border border-sky-500 rounded text-gray-200 outline-none"
                        disabled={renameMutation.isPending}
                      />
                      <button
                        onClick={e => { e.stopPropagation(); commitRename(chat.id) }}
                        className="text-green-400 hover:text-green-300 flex-shrink-0"
                        disabled={renameMutation.isPending}
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setEditingChatId(null) }}
                        className="text-gray-500 hover:text-gray-300 flex-shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span
                        className="text-xs flex-1 truncate"
                        onDoubleClick={e => { e.stopPropagation(); startRename(chat) }}
                        title="Double-click to rename"
                      >
                        {chat.title}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); deleteMutation.mutate(chat.id) }}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {activeChatId ? (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {localMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4 text-center">
                  <Bot className="w-12 h-12 text-gray-600" />
                  <div>
                    <h3 className="text-lg font-semibold text-white">Start a conversation</h3>
                    <p className="text-sm text-gray-400 mt-1">Ask anything about your code or get AI assistance</p>
                  </div>
                </div>
              ) : (
                localMessages.map(msg => <ChatMessage key={msg.id} message={msg} />)
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-gray-800">
              <ChatInput
                onSend={content => sendMutation.mutate({ chatId: activeChatId!, content })}
                isLoading={sendMutation.isPending}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <Bot className="w-16 h-16 text-gray-700 mx-auto" />
              <h3 className="text-xl font-semibold text-white">AI Chat Assistant</h3>
              <p className="text-gray-400 text-sm max-w-xs">Select a chat or create a new one to start talking with your AI assistant</p>
              <Button
                onClick={() => createMutation.mutate()}
                isLoading={createMutation.isPending}
                disabled={enabledModels.length === 0}
              >
                <Plus className="w-4 h-4" />
                New Chat
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
