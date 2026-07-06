import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import MeterBook from './pages/MeterBook'
import TankStock from './pages/TankStock'
import Deliveries from './pages/Deliveries'
import Creditors from './pages/Creditors'
import SalesBook from './pages/SalesBook'
import Banking from './pages/Banking'
import Expenses from './pages/Expenses'
import Compliance from './pages/Compliance'
import Shifts from './pages/Shifts'
import Reports from './pages/Reports'
import PriceSettings from './pages/PriceSettings'
import Users from './pages/Users'
import ImportData from './pages/ImportData'
import StationSetup from './pages/StationSetup'
import AuditLog from './pages/AuditLog'

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) {
    const home = user.role === 'viewer' ? '/meter' : '/'
    return <Navigate to={home} replace />
  }
  return children
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen">Loading...</div>

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={
          <ProtectedRoute roles={['admin', 'manager']}>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="meter" element={<ProtectedRoute><MeterBook /></ProtectedRoute>} />
        <Route path="tank-stock" element={<ProtectedRoute roles={['admin', 'manager']}><TankStock /></ProtectedRoute>} />
        <Route path="deliveries" element={<ProtectedRoute roles={['admin', 'manager']}><Deliveries /></ProtectedRoute>} />
        <Route path="creditors" element={<ProtectedRoute roles={['admin', 'manager']}><Creditors /></ProtectedRoute>} />
        <Route path="sales" element={<ProtectedRoute roles={['admin', 'manager']}><SalesBook /></ProtectedRoute>} />
        <Route path="banking" element={<ProtectedRoute roles={['admin', 'manager']}><Banking /></ProtectedRoute>} />
        <Route path="expenses" element={<ProtectedRoute roles={['admin', 'manager']}><Expenses /></ProtectedRoute>} />
        <Route path="compliance" element={<ProtectedRoute roles={['admin', 'manager']}><Compliance /></ProtectedRoute>} />
        <Route path="shifts" element={<ProtectedRoute><Shifts /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute roles={['admin', 'manager']}><Reports /></ProtectedRoute>} />
        <Route path="prices" element={<ProtectedRoute roles={['admin', 'manager']}><PriceSettings /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute roles={['admin', 'manager']}><Users /></ProtectedRoute>} />
        <Route path="import" element={<ProtectedRoute roles={['admin', 'manager']}><ImportData /></ProtectedRoute>} />
        <Route path="setup" element={<ProtectedRoute roles={['admin', 'manager']}><StationSetup /></ProtectedRoute>} />
        <Route path="audit" element={<ProtectedRoute roles={['admin']}><AuditLog /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}