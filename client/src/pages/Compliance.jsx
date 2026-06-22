import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useRole } from '../hooks/useRole'

export default function Compliance() {
  const { showToast } = useToast()
  const { isAdmin } = useRole()
  const [certs, setCerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ certificate_name:'', issuing_authority:'', reference_number:'', issue_date:'', expiry_date:'', status:'valid', alert_days_before:30 })

  useEffect(() => {
    api.get('/compliance').then(res => setCerts(res.data)).catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.post('/compliance', form)
      showToast('success', 'Certificate added', form.certificate_name)
      const res = await api.get('/compliance')
      setCerts(res.data)
      setForm({ certificate_name:'', issuing_authority:'', reference_number:'', issue_date:'', expiry_date:'', status:'valid', alert_days_before:30 })
    } catch (err) { showToast('error', 'Save failed', err.response?.data?.error) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!isAdmin) return
    try {
      await api.delete(`/compliance/${id}`)
      showToast('success', 'Certificate deleted')
      setCerts(prev => prev.filter(c => c.id !== id))
    } catch (err) { showToast('error', 'Delete failed') }
  }

  const statusColor = { valid:'badge-green', warning:'badge-amber', expired:'badge-red', archived:'badge-neutral' }

  if (loading) return <div className="loading-screen">Loading compliance...</div>

  return (
    <div>
      <div className="page-header"><div><h2>Compliance</h2><p>Certificates, licences, and regulatory records</p></div></div>
      <div className="card mb-16">
        <div className="card-header"><div className="card-title">Add certificate</div></div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Certificate name</label><input className="form-input" value={form.certificate_name} onChange={e => setForm(p=>({...p,certificate_name:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Issuing authority</label><input className="form-input" value={form.issuing_authority} onChange={e => setForm(p=>({...p,issuing_authority:e.target.value}))} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Reference number</label><input className="form-input" value={form.reference_number} onChange={e => setForm(p=>({...p,reference_number:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={form.status} onChange={e => setForm(p=>({...p,status:e.target.value}))}><option value="valid">Valid</option><option value="warning">Warning</option><option value="expired">Expired</option><option value="archived">Archived</option></select></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Issue date</label><input className="form-input" type="date" value={form.issue_date} onChange={e => setForm(p=>({...p,issue_date:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Expiry date</label><input className="form-input" type="date" value={form.expiry_date} onChange={e => setForm(p=>({...p,expiry_date:e.target.value}))} /></div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}><i className="ph ph-floppy-disk"></i> {saving?'Saving...':'Save certificate'}</button>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">All certificates</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Certificate</th><th>Authority</th><th>Reference</th><th>Issue date</th><th>Expiry</th><th>Status</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>
              {certs.map(c => (
                <tr key={c.id} style={{ background: c.status==='expired'?'var(--red-subtle)':c.status==='warning'?'var(--amber-subtle)':'' }}>
                  <td style={{ fontWeight:500 }}>{c.certificate_name}</td>
                  <td style={{ fontSize:12 }}>{c.issuing_authority}</td>
                  <td style={{ fontSize:11, color:'var(--text-3)' }}>{c.reference_number}</td>
                  <td>{c.issue_date}</td>
                  <td>{c.expiry_date}</td>
                  <td><span className={`badge ${statusColor[c.status]||'badge-neutral'}`}>{c.status}</span></td>
                  {isAdmin && <td><button className="btn btn-ghost btn-sm" onClick={() => handleDelete(c.id)} style={{ color:'var(--red)' }}><i className="ph ph-trash"></i></button></td>}
                </tr>
              ))}
              {certs.length===0 && <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>No certificates yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}