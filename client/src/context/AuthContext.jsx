import { createContext, useContext, useEffect, useState } from 'react'
import api from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    try {
      const token = localStorage.getItem('goil_token')
      const savedUser = localStorage.getItem('goil_user')
      if (token && savedUser) {
        setUser(JSON.parse(savedUser))
      }
    } catch (err) {
      localStorage.removeItem('goil_token')
      localStorage.removeItem('goil_user')
    } finally {
      setLoading(false)
    }
  }, [])

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('goil_token', data.token)
    localStorage.setItem('goil_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch (_) {}
    localStorage.removeItem('goil_token')
    localStorage.removeItem('goil_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}