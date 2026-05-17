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
  issue_analysis_model: string | null
  issue_analysis_enabled: boolean
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

export interface Agent {
  id: string
  user_id: string | null
  name: string
  description: string | null
  system_prompt: string | null
  model_provider: 'ollama' | 'openrouter' | null
  model_name: string | null
  tools_config: string[]
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Chat {
  id: string
  user_id: string
  agent_id: string | null
  title: string
  model_provider: 'ollama' | 'openrouter'
  model_name: string | null
  system_prompt: string | null
  repository_ids: string[] | null
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
  enabled_models: string[]
  default_chat_model: string | null
  title_generation_model: string | null
}

export interface FileTreeItem {
  path: string
  type: 'file' | 'directory'
  size: number | null
}

export interface RepoSummary {
  id: string
  repository_id: string
  summary_text: string | null
  file_tree_json: any
  key_files_json: any
  languages_json: any
  total_files: number
  total_size: number
  last_indexed_at: string
  content_hash: string | null
}

export interface RepoIssue {
  id: string
  repository_id: string
  github_issue_id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  labels: string[]
  assignee: string | null
  html_url: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  fix_generated: boolean
  fix_summary: string | null
  fix_branch: string | null
  fix_model_used: string | null
  analyzed_at: string | null
}
