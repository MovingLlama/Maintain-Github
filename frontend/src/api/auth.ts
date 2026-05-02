import api from './client'
import { User } from '../types'

export const getMe = () => api.get<User>('/auth/me').then(r => r.data)
export const logout = () => api.post('/auth/logout')
