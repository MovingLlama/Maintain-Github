import api from './client'
import { Agent } from '../types'

export async function listAgents(): Promise<Agent[]> {
  const { data } = await api.get('/agents/')
  return data
}

export async function listSystemAgents(): Promise<Agent[]> {
  const { data } = await api.get('/agents/system')
  return data
}

export async function listMyAgents(): Promise<Agent[]> {
  const { data } = await api.get('/agents/my')
  return data
}

export async function getAgent(id: string): Promise<Agent> {
  const { data } = await api.get(`/agents/${id}`)
  return data
}

export async function createAgent(payload: {
  name: string
  description?: string
  system_prompt?: string
  model_provider?: string | null
  model_name?: string | null
  tools_config?: string[]
}): Promise<Agent> {
  const { data } = await api.post('/agents/', payload)
  return data
}

export async function updateAgent(id: string, payload: {
  name?: string
  description?: string
  system_prompt?: string
  model_provider?: string | null
  model_name?: string | null
  tools_config?: string[]
  is_active?: boolean
}): Promise<Agent> {
  const { data } = await api.put(`/agents/${id}`, payload)
  return data
}

export async function deleteAgent(id: string): Promise<void> {
  await api.delete(`/agents/${id}`)
}
