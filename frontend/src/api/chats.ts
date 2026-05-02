import api from './client'
import { Chat, Message } from '../types'

export const listChats = () => api.get<Chat[]>('/chats/').then(r => r.data)
export const createChat = (data: Partial<Chat>) => api.post<Chat>('/chats/', data).then(r => r.data)
export const getChat = (id: string) => api.get<Chat>(`/chats/${id}`).then(r => r.data)
export const deleteChat = (id: string) => api.delete(`/chats/${id}`)
export const updateChatTitle = (id: string, title: string) =>
  api.patch(`/chats/${id}/title`, { title }).then(r => r.data)

export const listMessages = (chatId: string) =>
  api.get<Message[]>(`/chats/${chatId}/messages`).then(r => r.data)

export const sendMessage = (chatId: string, content: string) =>
  api.post<{ role: string; content: string }>(`/chats/${chatId}/messages`, { content }).then(r => r.data)
