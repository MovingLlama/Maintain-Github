import { create } from 'zustand'
import { Repository } from '../types'

interface RepoState {
  selectedRepo: Repository | null
  selectedFile: string | null
  fileContent: string | null
  isDirty: boolean
  setSelectedRepo: (repo: Repository | null) => void
  setSelectedFile: (path: string | null) => void
  setFileContent: (content: string | null) => void
  setDirty: (dirty: boolean) => void
}

export const useRepoStore = create<RepoState>((set) => ({
  selectedRepo: null,
  selectedFile: null,
  fileContent: null,
  isDirty: false,
  setSelectedRepo: (selectedRepo) => set({ selectedRepo, selectedFile: null, fileContent: null, isDirty: false }),
  setSelectedFile: (selectedFile) => set({ selectedFile }),
  setFileContent: (fileContent) => set({ fileContent }),
  setDirty: (isDirty) => set({ isDirty }),
}))
