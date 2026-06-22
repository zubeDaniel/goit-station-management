import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'

export default function TankStock() {
  const { showToast } = useToast()
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    stock_date: new Date().toISOString().split('T')[0],
    TANK_A: { opening_stock:'', litres_sold:'', delivery_litres:'0', closing_stock_dip:'', expected_variance:'0' },
    TANK_B: { opening_stock:'', litres_sold:'', delivery_litres:'0', closing_stock_dip:'', expected_variance:'0' },
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/tank-stock').then(res => setStocks(res.data)).catch(console.error).finally(() => setLoading(false))
  }, [])

  const calcVariance = (tank) => {
    const closing = parseFloat(tank.closing_stock_dip) || 0
    const opening = parseFloat(tank.opening_stock) || 0
    const delivery = parseFloat(tank.delivery_litres) || 0
    const sold = parseFloat(tank.litres_sold) || 0
    return (closing - (opening + delivery - sold)).toFixed(2)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      for (const [tankId, fuelType] of [['TANK_A','SXP'],['TANK_B','DXP']]) {
        const tank = form[tankId]
        if (!tank.closing_stock_dip) continue
        await api.post('/tank-stock', {
          stock_date: form.stock_date,
          tank_id: tankId, fuel_type: fuelType,
          opening_stock: parseFloat(tank.opening_stock) || 0,
          litres_sold: parseFloat(tank.litres_sold) || 0,
          delivery_litres: parseFloat(tank.delivery_litres) || 0,
          closing_stock_dip: parseFloat(tank.closing_stock_dip),
          expected_variance: parseFloat(calcVariance(tank))
        })
      }
      showToast('success', 'Tank stock saved', form.stock_date)
      const res = await api.get('/tank-stock')
      setStocks(res.data)
    } catch (err) {
      showToast('error', 'Save failed', err.response?.data?.error || 'Check your connection')
    } finally {
      setSaving(false)
    }
  }

  const updateTank = (tank, field, value) => {
    setForm(prev => ({ ...prev, [tank]: { ...prev[tank], [field]: value } }))
  }

  if (loading) return <div className="loading-screen">Loading tank stock...</div>

  return (
    <div>
      <div className="page-header">
        <div><h2>Tank Stock</h2><p>Daily supervisor dip readings · Tank A (SXP) · Tank B (DXP)</p></div>
      </div>

      <div className="grid-2 mb-16">
        {[['TANK_A','SXP','Tank A',' — SXP'],['TANK_B','DXP','Tank B',' — DXP']].map(([tankId, fuel, label, sub]) => {
          const tank = form[tankId]
          const variance = calcVariance(tank)
          const isNeg = parseFloat(variance) < 0
          return (
            <div key={tankId} className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">{label}{sub}</div>
                  <div className="card-subtitle">Capacity: 10,000 L</div>
                </div>
              </div>
              <div className="form-row" style={{ marginBottom:12 }}>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input className="form-input" type="date" value={form.stock_date}
                    onChange={e => setForm(prev => ({ ...prev, stock_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Opening stock (L)</label>
                  <input className="form-input" type="number" value={tank.opening_stock}
                    onChange={e => updateTank(tankId, 'opening_stock', e.target.value)} />
                </div>
              </div>
              <div className="form-row" style={{ marginBottom:12 }}>
                <div className="form-group">
                  <label className="form-label">Litres sold (L)</label>
                  <input className="form-input" type="number" value={tank.litres_sold}
                    onChange={e => updateTank(tankId, 'litres_sold', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Delivery litres (L)</label>
                  <input className="form-input" type="number" value={tank.delivery_litres}
                    onChange={e => updateTank(tankId, 'delivery_litres', e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom:12 }}>
                <label className="form-label">Closing stock — dip reading (L)</label>
                <input className="form-input" type="number" value={tank.closing_stock_dip}
                  onChange={e => updateTank(tankId, 'closing_stock_dip', e.target.value)}
                  placeholder="Enter dip reading" />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div style={{ background: isNeg ? 'var(--red-subtle)' : 'var(--green-subtle)', border:`1px solid ${isNeg ? 'var(--red-border)' : 'var(--green-border)'}`, borderRadius:'var(--r-md)', padding:'12px 14px' }}>
                  <div style={{ fontSize:10, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', marginBottom:4 }}>Actual variance</div>
                  <div style={{ fontSize:20, fontWeight:700, fontFamily:'var(--font-mono)', color: isNeg ? 'var(--red)' : 'var(--green)' }}>{variance} L</div>
                </div>
                <div style={{ background: isNeg ? 'var(--red-subtle)' : 'var(--green-subtle)', border:`1px solid ${isNeg ? 'var(--red-border)' : 'var(--green-border)'}`, borderRadius:'var(--r-md)', padding:'12px 14px' }}>
                  <div style={{ fontSize:10, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', marginBottom:4 }}>Expected variance</div>
                  <div style={{ fontSize:20, fontWeight:700, fontFamily:'var(--font-mono)', color: isNeg ? 'var(--red)' : 'var(--green)' }}>{variance} L</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:20 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <i className="ph ph-floppy-disk"></i> {saving ? 'Saving...' : 'Save tank stock'}
        </button>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Recent stock entries</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Tank</th><th>Fuel</th><th>Opening</th><th>Sold</th><th>Delivery</th><th>Closing (dip)</th><th>Variance</th></tr></thead>
            <tbody>
              {stocks.slice(0,20).map(s => (
                <tr key={s.id}>
                  <td>{s.stock_date}</td>
                  <td><span className="badge badge-navy">{s.tank_id}</span></td>
                  <td><span className={`badge ${s.fuel_type === 'SXP' ? 'badge-blue' : 'badge-amber'}`}>{s.fuel_type}</span></td>
                  <td className="td-calc">{parseFloat(s.opening_stock).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.litres_sold).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.delivery_litres).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.closing_stock_dip).toFixed(2)}</td>
                  <td><span className={`badge ${parseFloat(s.actual_variance) < 0 ? 'badge-red' : 'badge-green'}`}>{parseFloat(s.actual_variance).toFixed(2)} L</span></td>
                </tr>
              ))}
              {stocks.length === 0 && <tr><td colSpan={8} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>No entries yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}