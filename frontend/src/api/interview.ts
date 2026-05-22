import api from './client'
import { InterviewPrepQuestion } from '../types'

export interface GenerateQuestionsPayload {
  count?: number
  category?: string | null
  difficulty: string
}

export interface SubmitAnswerResponse {
  question_id: string
  is_completed: boolean
  user_answer: string
  feedback: string
}

export const listQuestions = (repoId: string) =>
  api.get<InterviewPrepQuestion[]>(`/interview/repos/${repoId}`).then(r => r.data)

export const generateQuestions = (repoId: string, payload: GenerateQuestionsPayload) =>
  api.post<InterviewPrepQuestion[]>(`/interview/repos/${repoId}/generate`, payload).then(r => r.data)

export const submitAnswer = (questionId: string, user_answer: string) =>
  api.post<SubmitAnswerResponse>(`/interview/questions/${questionId}/answer`, { user_answer }).then(r => r.data)

export const resetQuestions = (repoId: string) =>
  api.delete(`/interview/repos/${repoId}`).then(r => r.data)
