import api from './client'
import { AIModel } from '../types'

export const listModels = () =>
  api.get<{ ollama: AIModel[]; openrouter: AIModel[] }>('/ai/models').then(r => r.data)
