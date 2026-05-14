import api from './client'
import { AIModel } from '../types'

export const listModels = () =>
  api.get<{ ollama: AIModel[]; openrouter: AIModel[] }>('/ai/models').then(r => r.data)

export const pullOllamaModel = (modelName: string) =>
  api.post<{ status: string; detail: any }>('/ai/ollama/pull', { model_name: modelName }).then(r => r.data)
