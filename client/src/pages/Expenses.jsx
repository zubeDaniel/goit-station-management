import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'

export default function Expenses() {
  const { showToast } = useToast()
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ expense_date: new Date().toISOString().split('T')[0], category:'Salaries', amount_ghs:'', description:'', receipt_number:'' })

  useEffect(() => {
    api.get('/expenses').then(res => setExpenses(res.data)).catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.post('/expenses', form)
      showToast('success', 'Expense saved', form.description)
      const res = await api.get('/expenses')
      setExpenses(res.data)
      setForm(p => ({ ...p, amount_ghs:'', description:'', receipt_number:'' }))
    } catch (err) { showToast('error', 'Save failed', err.response?.data?.error) }
    finally { setSaving(false) }
  }

  const totalExpenses = expenses.reduce((s,e) => s+parseFloat(e.amount_ghs||0), 0)

  if (loading) return <div className="loading-screen">Loading expenses...</div>

  return (
    <div>
      <div className="page-header"><div><h2>Expenses</h2><p>Operational cost tracking for profitability analysis</p></div></div>
      <div className="kpi-grid" style={{ gridTemplateColumns:'repeat(3,1fr)', marginBottom:16 }}>
        <div className="kpi-card kpi-red"><div className="kpi-label">Total expenses</div><div className="kpi-value">GHS {totalExpenses.toLocaleString(undefined,{minimumFractionDigits:2})}</div></div>
        <div className="kpi-card kpi-blue"><div className="kpi-label">Total entries</div><div className="kpi-value">{expenses.length}</div></div>
        <div className="kpi-card kpi-amber"><div className="kpi-label">Latest category</div><div className="kpi-value" style={{ fontSize:16 }}>{expenses[0]?.category || '—'}</div></div>
      </div>
      <div className="card mb-16">
        <div className="card-header"><div className="card-title">Log new expense</div></div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={form.expense_date} onChange={e => setForm(p=>({...p,expense_date:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Category</label><select className="form-select" value={form.category} onChange={e => setForm(p=>({...p,category:e.target.value}))}>{['Salaries','Maintenance','Utilities','Supplies','Transport','Other'].map(c => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Amount (GHS)</label><input className="form-input" type="number" value={form.amount_ghs} onChange={e => setForm(p=>({...p,amount_ghs:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Receipt no.</label><input className="form-input" value={form.receipt_number} onChange={e => setForm(p=>({...p,receipt_number:e.target.value}))} placeholder="Optional" /></div>
        </div>
        <div className="form-group" style={{ marginBottom:14 }}>
          <label className="form-label">Description</label>
          <input className="form-input" value={form.description} onChange={e => setForm(p=>({...p,description:e.target.value}))} placeholder="Brief description" />
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}><i className="ph ph-floppy-disk"></i> {saving?'Saving...':'Save expense'}</button>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Expense history</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount (GHS)</th><th>Receipt</th></tr></thead>
            <tbody>
              {expenses.slice(0,20).map(e => (
                <tr key={e.id}><td>{e.expense_date}</td><td><span className="badge badge-neutral">{e.category}</span></td><td>{e.description}</td><td className="td-calc">{parseFloat(e.amount_ghs).toFixed(2)}</td><td style={{ fontSize:11, color:'var(--text-3)' }}>{e.receipt_number||'—'}</td></tr>
              ))}
              {expenses.length===0 && <tr><td colSpan={5} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>No expenses yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}