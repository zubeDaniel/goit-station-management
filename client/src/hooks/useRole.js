import { useAuth } from '../context/AuthContext'

export function useRole() {
  const { user } = useAuth()
  return {
    role: user?.role,
    isAdmin: user?.role === 'admin',
    isManager: user?.role === 'manager',
    isViewer: user?.role === 'viewer',
    isAdminOrManager: user?.role === 'admin' || user?.role === 'manager',
  }
}