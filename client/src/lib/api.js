import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
})

// Attach token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('goil_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('goil_token')
      localStorage.removeItem('goil_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api