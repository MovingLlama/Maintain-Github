import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listChats, createChat, deleteChat, listMessages, sendMessage } from '../api/chats'
import { listModels } from '../api/ai'
import { ChatMessage } from '../components/chat/ChatMessage'
import { ChatInput } from '../components/chat/ChatInput'
import { Button } from '../components/common/Button'
import { Chat, Message } from '../types'
import { Plus, Trash2, MessageSquare, Bot } from 'lucide-react'

export function ChatPage() {
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [localMessages, setLocalMessages] = useState<Message[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  const { data: chats = [] } = useQuery({ queryKey: ['chats'], queryFn: listChats })
  const { data: models } = useQuery({ queryKey: ['models'], queryFn: listModels })
  const { data: messages = [] } = useQuery({
    queryKey: ['messages', activeChatId],
    queryFn: () => listMessages(activeChatId!),
    enabled: !!activeChatId,
  })

  useEffect(() => {
    setLocalMessages(messages)
  }, [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages])

  const createMutation = useMutation({
    mutationFn: () => createChat({ title: 'New Chat', model_provider: 'ollama', model_name: models?.ollama[0]?.id }),
    onSuccess: (chat) => { qc.invalidateQueries({ queryKey: ['chats'] }); setActiveChatId(chat.id) },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteChat,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['chats'] }); setActiveChatId(null) },
  })

  const sendMutation = useMutation({
    mutationFn: (content: string) => sendMessage(activeChatId!, content),
    onMutate: async (content) => {
      const tempMsg: Message = {
        id: 'temp-user',
        chat_id: activeChatId!,
        role: 'user',
        content,
        tool_calls: null,
        tool_result: null,
        model_used: null,
        created_at: new Date().toISOString(),
      }
      setLocalMessages(prev => [...prev, tempMsg])
    },
    onSuccess: (response) => {
      const assistantMsg: Message = {
        id: 'temp-assistant-' + Date.now(),
        chat_id: activeChatId!,
        role: 'assistant',
        content: response.content,
        tool_calls: null,
        tool_result: null,
        model_used: null,
        created_at: new Date().toISOString(),
      }
      setLocalMessages(prev => prev.filter(m => m.id !== 'temp-user').concat(assistantMsg))
      qc.invalidateQueries({ queryKey: ['messages', activeChatId] })
    },
  })

  return (
    <div className="h-full flex">
      {/* Sidebar: Chat List */}
      <div className="w-64 border-r border-gray-800 flex flex-col bg-gray-900">
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Chats</h2>
          <Button size="sm" variant="ghost" onClick={() => createMutation.mutate()} isLoading={createMutation.isPending}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {chats.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-500">No chats yet</p>
            </div>
          ) : (
            chats.map(chat => (
              <div
                key={chat.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer group transition-colors ${
                  activeChatId === chat.id ? 'bg-sky-900/30 text-sky-300' : 'hover:bg-gray-800 text-gray-300'
                }`}
                onClick={() => setActiveChatId(chat.id)}
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                <span className="text-xs flex-1 truncate">{chat.title}</span>
                <button
                  onClick={e => { e.stopPropagation(); deleteMutation.mutate(chat.id) }}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
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
                onSend={content => sendMutation.mutate(content)}
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
              <Button onClick={() => createMutation.mutate()} isLoading={createMutation.isPending}>
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
