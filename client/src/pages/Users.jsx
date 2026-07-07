import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../context/AuthContext'

export default function Users() {
  const { showToast } = useToast()
  const { isAdmin } = useRole()
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', role: '' })
  const [form, setForm] = useState({ email:'', name:'', password:'', role:'viewer' })

  const loadUsers = () => {
    return api.get('/users').then(res => setUsers(res.data)).catch(console.error)
  }

  useEffect(() => {
    loadUsers().finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.post('/users', form)
      showToast('success', 'User created', `${form.name} (${form.role})`)
      await loadUsers()
      setForm({ email:'', name:'', password:'', role:'viewer' })
    } catch (err) { showToast('error', 'Failed to create user', err.response?.data?.error) }
    finally { setSaving(false) }
  }

  const handleEditClick = (u) => {
    setEditingId(u.id)
    setEditForm({ name: u.name, role: u.role })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditForm({ name: '', role: '' })
  }

  const handleSaveEdit = async (id) => {
    setSaving(true)
    try {
      await api.put(`/users/${id}`, editForm)
      showToast('success', 'User updated', editForm.name)
      await loadUsers()
      handleCancelEdit()
    } catch (err) {
      showToast('error', 'Update failed', err.response?.data?.error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (u) => {
    if (u.id === currentUser?.id) return // shouldn't be reachable, button is disabled, but belt and suspenders
    if (!confirm(`Permanently delete ${u.name}'s account? This removes their login access completely and cannot be undone.`)) return
    try {
      await api.delete(`/users/${u.id}`)
      showToast('success', 'User deleted', u.name)
      await loadUsers()
    } catch (err) {
      showToast('error', 'Delete failed', err.response?.data?.error)
    }
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
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map(u => {
                const isSelf = u.id === currentUser?.id
                const isEditing = editingId === u.id
                // Manager can't edit an admin account, can't touch their own role, matches backend guard
                const managerBlocked = !isAdmin && u.role === 'admin'
                return (
                  <tr key={u.id}>
                    {isEditing ? (
                      <>
                        <td>
                          <input className="form-input" style={{ minWidth: 140 }} value={editForm.name}
                            onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{u.email}</td>
                        <td>
                          <select className="form-select" style={{ minWidth: 130 }} value={editForm.role}
                            disabled={isSelf}
                            onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}>
                            {isAdmin && <option value="admin">Admin</option>}
                            <option value="manager">Manager</option>
                            <option value="viewer">Viewer (Attendant)</option>
                          </select>
                          {isSelf && <div className="form-hint">Can't change your own role</div>}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => handleSaveEdit(u.id)}><i className="ph ph-check"></i></button>
                            <button className="btn btn-ghost btn-sm" onClick={handleCancelEdit}><i className="ph ph-x"></i></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontWeight: 500 }}>{u.name}{isSelf && <span className="badge badge-neutral" style={{ marginLeft: 6, fontSize: 10 }}>You</span>}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{u.email}</td>
                        <td><span className={`badge ${roleColor[u.role]||'badge-neutral'}`}>{u.role}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" disabled={managerBlocked}
                              title={managerBlocked ? "Managers can't edit Admin accounts" : 'Edit'}
                              onClick={() => handleEditClick(u)}>
                              <i className="ph ph-pencil-simple"></i>
                            </button>
                            {isAdmin && (
                              <button className="btn btn-ghost btn-sm" style={{ color: isSelf ? 'var(--text-3)' : 'var(--red)' }}
                                disabled={isSelf}
                                title={isSelf ? "You can't delete your own account" : 'Delete permanently'}
                                onClick={() => handleDelete(u)}>
                                <i className="ph ph-trash"></i>
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
              {users.length===0 && <tr><td colSpan={5} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>No users yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}