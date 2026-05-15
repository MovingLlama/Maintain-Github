import axios from 'axios'
import { createLogger } from '../utils/logger'
import { addNetworkEntry } from '../components/common/DebugPanel'

const logger = createLogger('api')

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor — log outgoing requests
api.interceptors.request.use(
  (config) => {
    ;(config as any)._startTime = Date.now()
    logger.debug(`${config.method?.toUpperCase()} ${config.url}`, {
      params: config.params,
      data: config.data,
    })
    return config
  },
  (error) => {
    logger.error('Request error', { error: error.message })
    return Promise.reject(error)
  },
)

// Response interceptor — log responses and track in network tab
api.interceptors.response.use(
  (response) => {
    const startTime = (response.config as any)._startTime
    const duration = startTime ? Date.now() - startTime : 0

    logger.debug(
      `${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`,
      { duration },
    )

    addNetworkEntry({
      method: response.config.method?.toUpperCase() || 'GET',
      url: response.config.url || '',
      status: response.status,
      duration,
      timestamp: Date.now(),
      responseBody: response.data,
    })

    return response
  },
  async (error) => {
    const startTime = (error.config as any)?._startTime
    const duration = startTime ? Date.now() - startTime : 0

    // Auto-refresh on 401
    if (error.response?.status === 401 && !error.config?._retry) {
      logger.warn('Received 401, attempting token refresh')
      error.config._retry = true
      try {
        await axios.post('/auth/refresh', {}, { withCredentials: true })
        return api(error.config)
      } catch (refreshError) {
        logger.error('Token refresh failed')
        return Promise.reject(error)
      }
    }

    logger.error(
      `${error.response?.status || 'NET'} ${error.config?.method?.toUpperCase()} ${error.config?.url}`,
      {
        status: error.response?.status,
        data: error.response?.data,
        duration,
      },
    )

    addNetworkEntry({
      method: error.config?.method?.toUpperCase() || 'GET',
      url: error.config?.url || '',
      status: error.response?.status || 0,
      duration,
      timestamp: Date.now(),
      responseBody: error.response?.data,
    })

    return Promise.reject(error)
  },
)

export default api
