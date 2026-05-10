import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMe } from '../api/auth'
import { useAuthStore } from '../stores/authStore'

export function useAuth() {
  const { user: storeUser, isLoading: storeLoading, setUser, setLoading } = useAuthStore()

  const { data, isLoading: queryLoading, error } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    setLoading(queryLoading)
    if (data) setUser(data)
    if (error) setUser(null)
  }, [data, queryLoading, error, setUser, setLoading])

  return {
    user: data || storeUser,
    isLoading: queryLoading
  }
}
