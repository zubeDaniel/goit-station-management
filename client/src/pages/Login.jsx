import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(email, password)
      if (user.role === 'viewer') {
        navigate('/meter')
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--navy)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16
    }}>
      <div style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r-lg)',
        padding: 36,
        width: '100%',
        maxWidth: 380,
        boxShadow: 'var(--shadow-md)'
      }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:28 }}>
          <div style={{ width:12, height:12, background:'var(--red)', borderRadius:'50%' }}></div>
          <div>
            <div style={{ fontSize:18, fontWeight:700, color:'var(--navy)' }}>GOIL Kuntunso</div>
            <div style={{ fontSize:12, color:'var(--text-3)' }}>Station Management System</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom:12 }}>
            <label className="form-label">Email address</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoFocus
            />
          </div>

          <div className="form-group" style={{ marginBottom:20 }}>
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div style={{
              background: 'var(--red-subtle)',
              border: '1px solid var(--red-border)',
              borderRadius: 'var(--r-sm)',
              padding: '10px 12px',
              fontSize: 12,
              color: 'var(--red)',
              marginBottom: 16
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-danger"
            style={{ width:'100%', justifyContent:'center', padding:'10px', fontSize:14 }}
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}