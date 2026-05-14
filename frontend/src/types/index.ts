export interface User {
  id: string
  github_id: number
  github_login: string
  github_name: string | null
  github_email: string | null
  github_avatar_url: string | null
  is_active: boolean
  is_admin: boolean
  created_at: string
  last_login_at: string | null
}

export interface Repository {
  id: string
  owner_id: string
  github_repo_id: number
  full_name: string
  name: string
  description: string | null
  default_branch: string
  current_branch: string
  status: 'pending' | 'cloning' | 'ready' | 'error' | 'pushing'
  is_private: boolean
  local_path: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface GitHubRepo {
  id: number
  full_name: string
  name: string
  description: string | null
  default_branch: string
  private: boolean
  html_url: string
  language: string | null
  stargazers_count: number
  updated_at: string | null
}

export interface Chat {
  id: string
  user_id: string
  repository_id: string | null
  title: string
  model_provider: 'ollama' | 'openrouter'
  model_name: string | null
  is_agent_mode: boolean
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  chat_id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_calls: any | null
  tool_result: any | null
  model_used: string | null
  created_at: string
}

export interface AIModel {
  id: string
  name: string
  provider: 'ollama' | 'openrouter'
  size?: number
  context_length?: number
}

export interface UserSettings {
  enabled_models: string[]           // composite keys: "provider:model_id"
  default_chat_model: string | null  // composite key or null
}

export interface FileTreeItem {
  path: string
  type: 'file' | 'directory'
  size: number | null
}
