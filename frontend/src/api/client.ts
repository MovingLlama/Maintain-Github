import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// Auto-refresh on 401
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true
      try {
        await axios.post('/auth/refresh', {}, { withCredentials: true })
        return api(error.config)
      } catch {
        window.location.href = '/'
      }
    }
    return Promise.reject(error)
  }
)

export default api
