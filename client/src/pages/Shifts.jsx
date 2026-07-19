import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useRole } from '../hooks/useRole'

export default function Shifts() {
  const { showToast } = useToast()
  const { isAdminOrManager } = useRole()
  const [shifts, setShifts] = useState([])
  const [attendants, setAttendants] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ shift_date: new Date().toISOString().split('T')[0], P1:'', P2:'', P3:'' })

  // Editing/deleting a single existing shift record — kept separate from
  // the "assign shifts" form above, which is for assigning all three
  // pumps at once for a new date, not correcting one existing record.
  const [editingShift, setEditingShift] = useState(null)
  const [editForm, setEditForm] = useState({ shift_date: '', pump_id: '', attendant_id: '' })
  const [editSaving, setEditSaving] = useState(false)

  const openEditShift = (row) => {
    setEditingShift(row)
    setEditForm({ shift_date: row.shift_date, pump_id: row.pump_id, attendant_id: row.attendant_id })
  }

  const handleUpdateShift = async () => {
    setEditSaving(true)
    try {
      await api.put(`/shifts/${editingShift.id}`, editForm)
      showToast('success', 'Shift updated', editForm.shift_date)
      setEditingShift(null)
      const res = await api.get('/shifts')
      setShifts(res.data)
    } catch (err) {
      showToast('error', 'Update failed', err.response?.data?.error)
    } finally {
      setEditSaving(false)
    }
  }

  const handleDeleteShift = async (id, label) => {
    if (!confirm(`Delete this shift assignment (${label})? This cannot be undone.`)) return
    try {
      await api.delete(`/shifts/${id}`)
      showToast('success', 'Shift deleted', label)
      if (editingShift?.id === id) setEditingShift(null)
      const res = await api.get('/shifts')
      setShifts(res.data)
    } catch (err) {
      showToast('error', 'Delete failed', err.response?.data?.error)
    }
  }

  useEffect(() => {
    // Same bug as MeterBook.jsx had: /attendants is admin/manager-only,
    // so Viewer's unconditional call 403'd, Promise.all rejected as a
    // whole, and .then() never ran — meaning setShifts() never fired and
    // Viewer saw an empty screen, even though GET /shifts itself succeeds
    // fine for Viewer and already carries attendant names via a join
    // (.select('*, attendants(name)') server-side). The separate
    // attendants list is only actually used in the assignment form below,
    // which Viewer can't see anyway.
    Promise.all([
      api.get('/shifts'),
      isAdminOrManager ? api.get('/attendants') : Promise.resolve({ data: [] })
    ])
      .then(([sRes, aRes]) => { setShifts(sRes.data); setAttendants(aRes.data) })
      .catch(console.error).finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaving(true)
    try {
      for (const [pump, attendant_id] of [['P1',form.P1],['P2',form.P2],['P3',form.P3]]) {
        if (!attendant_id) continue
        await api.post('/shifts', { shift_date: form.shift_date, pump_id: pump, attendant_id })
      }
      showToast('success', 'Shifts assigned', form.shift_date)
      const res = await api.get('/shifts')
      setShifts(res.data)
    } catch (err) { showToast('error', 'Save failed', err.response?.data?.error) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="loading-screen">Loading shifts...</div>

  return (
    <div>
      <div className="page-header"><div><h2>Shifts</h2><p>Attendant rotation log · one attendant per pump</p></div></div>
      <div className="card mb-16">
        <div className="card-header"><div className="card-title">Attendants</div></div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {attendants.filter(a => a.is_active).map(a => (
            <div key={a.id} style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'8px 14px', background:'var(--navy-light)', border:'1px solid var(--navy-border)', borderRadius:'var(--r-md)' }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--navy)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'#fff' }}>
                {a.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
              </div>
              <span style={{ fontSize:13, fontWeight:500, color:'var(--navy)' }}>{a.name}</span>
            </div>
          ))}
        </div>
      </div>

      {isAdminOrManager && (
        <div className="card mb-16">
          <div className="card-header"><div className="card-title">Assign shifts</div></div>
          <div className="form-group" style={{ marginBottom:14, maxWidth:220 }}>
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={form.shift_date} onChange={e => setForm(p=>({...p,shift_date:e.target.value}))} />
          </div>
          <div className="form-row-3">
            {['P1','P2','P3'].map(pump => (
              <div key={pump} className="form-group">
                <label className="form-label">{pump} attendant</label>
                <select className="form-select" value={form[pump]} onChange={e => setForm(p=>({...p,[pump]:e.target.value}))}>
                  <option value="">Select attendant</option>
                  {attendants.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}><i className="ph ph-floppy-disk"></i> {saving?'Saving...':'Save shifts'}</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><div className="card-title">Shift history</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Pump</th><th>Attendant</th>{isAdminOrManager && <th>Actions</th>}</tr></thead>
            <tbody>
              {shifts.slice(0,30).map(s => (
                <tr key={s.id}>
                  <td>{s.shift_date}</td>
                  <td><span className="badge badge-navy">{s.pump_id}</span></td>
                  <td>{s.attendants?.name}</td>
                  {isAdminOrManager && (
                    <td style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditShift(s)}><i className="ph ph-pencil-simple"></i></button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleDeleteShift(s.id, `${s.pump_id} — ${s.shift_date}`)}><i className="ph ph-trash"></i></button>
                    </td>
                  )}
                </tr>
              ))}
              {shifts.length===0 && <tr><td colSpan={isAdminOrManager ? 4 : 3} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>No shifts yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editingShift && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,28,68,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 380 }}>
            <div className="card-header">
              <div className="card-title">Edit shift assignment</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingShift(null)}><i className="ph ph-x"></i></button>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={editForm.shift_date}
                onChange={e => setEditForm(p => ({ ...p, shift_date: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Pump</label>
              <select className="form-select" value={editForm.pump_id}
                onChange={e => setEditForm(p => ({ ...p, pump_id: e.target.value }))}>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Attendant</label>
              <select className="form-select" value={editForm.attendant_id}
                onChange={e => setEditForm(p => ({ ...p, attendant_id: e.target.value }))}>
                <option value="">Select attendant</option>
                {attendants.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setEditingShift(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpdateShift} disabled={editSaving}>
                <i className="ph ph-check"></i> {editSaving ? 'Saving...' : 'Update shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}