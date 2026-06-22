import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useRole } from '../hooks/useRole'

export default function Users() {
  const { showToast } = useToast()
  const { isAdmin } = useRole()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ email:'', name:'', password:'', role:'viewer' })

  useEffect(() => {
    api.get('/users').then(res => setUsers(res.data)).catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.post('/users', form)
      showToast('success', 'User created', `${form.name} (${form.role})`)
      const res = await api.get('/users')
      setUsers(res.data)
      setForm({ email:'', name:'', password:'', role:'viewer' })
    } catch (err) { showToast('error', 'Failed to create user', err.response?.data?.error) }
    finally { setSaving(false) }
  }

  const roleColor = { admin:'badge-red', manager:'badge-blue', viewer:'badge-neutral' }

  if (loading) return <div className="loading-screen">Loading users...</div>

  return (
    <div>
      <div className="page-header"><div><h2>User Management</h2><p>Role-based access control</p></div></div>
      <div className="card mb-16">
        <div className="card-header"><div className="card-title">Create new user</div></div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Full name</label><input className="form-input" value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Email address</label><input className="form-input" type="email" value={form.email} onChange={e => setForm(p=>({...p,email:e.target.value}))} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Password</label><input className="form-input" type="password" value={form.password} onChange={e => setForm(p=>({...p,password:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Role</label>
            <select className="form-select" value={form.role} onChange={e => setForm(p=>({...p,role:e.target.value}))}>
              {isAdmin && <option value="admin">Admin</option>}
              <option value="manager">Manager</option>
              <option value="viewer">Viewer (Attendant)</option>
            </select>
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}><i className="ph ph-user-plus"></i> {saving?'Creating...':'Create user'}</button>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">System users</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}><td style={{ fontWeight:500 }}>{u.name}</td><td style={{ fontSize:12, color:'var(--text-3)' }}>{u.email}</td><td><span className={`badge ${roleColor[u.role]||'badge-neutral'}`}>{u.role}</span></td><td style={{ fontSize:12, color:'var(--text-3)' }}>{u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</td></tr>
              ))}
              {users.length===0 && <tr><td colSpan={4} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>No users yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}