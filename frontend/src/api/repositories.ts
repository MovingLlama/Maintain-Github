import api from './client'
import { Repository, GitHubRepo, FileTreeItem } from '../types'

export const listGithubRepos = (page = 1) =>
  api.get<GitHubRepo[]>('/repositories/github', { params: { page, per_page: 30 } }).then(r => r.data)

export const listLocalRepos = () =>
  api.get<Repository[]>('/repositories/').then(r => r.data)

export const cloneRepo = (data: {
  github_repo_id: number
  full_name: string
  name: string
  description?: string
  default_branch: string
  is_private: boolean
  github_metadata?: object
}) => api.post<Repository>('/repositories/clone', data).then(r => r.data)

export const getRepo = (id: string) =>
  api.get<Repository>(`/repositories/${id}`).then(r => r.data)

export const getRepoFiles = (id: string) =>
  api.get<{ files: FileTreeItem[] }>(`/repositories/${id}/files`).then(r => r.data)

export const readFile = (id: string, path: string) =>
  api.get<{ path: string; content: string }>(`/repositories/${id}/files/${path}`).then(r => r.data)

export const writeFile = (id: string, path: string, content: string) =>
  api.put(`/repositories/${id}/files/${path}`, { content })

export const pushRepo = (id: string, message: string) =>
  api.post(`/repositories/${id}/push`, { message }).then(r => r.data)

export const deleteRepo = (id: string) =>
  api.delete(`/repositories/${id}`)
