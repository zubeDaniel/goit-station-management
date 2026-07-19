import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  // Previously unset (axios default is 0 = wait forever). On a flaky-but-
  // not-fully-dead connection, any request — not just logout — could hang
  // indefinitely with no error and no feedback, since a request that never
  // settles never reaches a catch block. 15s is generous enough for normal
  // use but guarantees every request eventually fails predictably instead
  // of hanging forever.
  timeout: 15000
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