import api from './client'
import { UserSettings } from '../types'

export const getUserSettings = () =>
  api.get<UserSettings>('/settings/user').then(r => r.data)

export const updateUserSettings = (settings: Partial<UserSettings>) =>
  api.put<UserSettings>('/settings/user', settings).then(r => r.data)
