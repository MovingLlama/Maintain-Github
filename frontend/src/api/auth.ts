import axios from 'axios'
import { User } from '../types'

const authApi = axios.create({ withCredentials: true })

export const getMe = () => authApi.get<User>('/auth/me').then(r => r.data)
export const logout = () => authApi.post('/auth/logout')
