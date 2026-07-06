import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'

const TANKS = [
  { tankId: 'TANK_A', fuel: 'SXP', label: 'Tank A', sub: 'SXP — Super XP 91', dotColor: 'var(--orange)' },
  { tankId: 'TANK_B', fuel: 'DXP', label: 'Tank B', sub: 'DXP — Diesel XP',   dotColor: 'var(--amber)' },
]

const emptyTank = () => ({
  opening_stock:     '',
  litres_sold:       '',
  closing_stock_dip: '',
})

const emptyDelivery = () => ({
  checked:         false,
  fetching:        false,
  actual_litres:   0,   // from tanker_deliveries.actual_litres
  expected_litres: 0,   // from tanker_deliveries.expected_litres (waybill)
  record:          null,
})

export default function TankStock() {
  const { showToast } = useToast()
  const [stocks, setStocks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  const [form, setForm] = useState({
    stock_date: new Date().toISOString().split('T')[0],
    TANK_A: emptyTank(),
    TANK_B: emptyTank(),
  })

  // Per-tank delivery state — kept separate so each tank is independent
  const [delivery, setDelivery] = useState({
    TANK_A: emptyDelivery(),
    TANK_B: emptyDelivery(),
  })

  useEffect(() => {
    api.get('/tank-stock')
      .then(res => setStocks(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // ── Auto-fill opening stock (from previous closing dip) and litres sold
  //    (from actual pump meter readings for this date) — stays editable so
  //    a supervisor can correct it if Meter Book wasn't entered yet that day.
  useEffect(() => {
    if (loading) return

    setForm(prev => {
      const updated = { ...prev }
      TANKS.forEach(({ tankId }) => {
        const prior = stocks
          .filter(s => s.tank_id === tankId && s.stock_date < prev.stock_date)
          .sort((a, b) => b.stock_date.localeCompare(a.stock_date))[0]
        if (prior) {
          updated[tankId] = { ...updated[tankId], opening_stock: parseFloat(prior.closing_stock_dip).toFixed(2) }
        }
      })
      return updated
    })

    api.get(`/meter?start_date=${form.stock_date}&end_date=${form.stock_date}`)
      .then(res => {
        const readings = res.data || []
        const sxpTotal = readings.filter(r => r.fuel_type === 'SXP').reduce((s, r) => s + (parseFloat(r.litres_sold) || 0), 0)
        const dxpTotal = readings.filter(r => r.fuel_type === 'DXP').reduce((s, r) => s + (parseFloat(r.litres_sold) || 0), 0)
        setForm(prev => ({
          ...prev,
          TANK_A: { ...prev.TANK_A, litres_sold: sxpTotal.toFixed(2) },
          TANK_B: { ...prev.TANK_B, litres_sold: dxpTotal.toFixed(2) },
        }))
      })
      .catch(console.error)
  }, [stocks, form.stock_date, loading])

  // ── Variance calculations ──────────────────────────────────
  // actual_variance  = closing_dip − (opening + actual_delivery  − sold)
  // expected_variance = closing_dip − (opening + waybill_expected − sold)
  // On non-delivery days both are identical (delivery = 0 for both)

  const calcActualVariance = (tankId) => {
    const t = form[tankId]
    const d = delivery[tankId]
    const closing  = parseFloat(t.closing_stock_dip) || 0
    const opening  = parseFloat(t.opening_stock)     || 0
    const sold     = parseFloat(t.litres_sold)        || 0
    const actual   = d.checked ? d.actual_litres      : 0
    return (closing - (opening + actual - sold)).toFixed(2)
  }

  const calcExpectedVariance = (tankId) => {
    const t = form[tankId]
    const d = delivery[tankId]
    const closing   = parseFloat(t.closing_stock_dip) || 0
    const opening   = parseFloat(t.opening_stock)     || 0
    const sold      = parseFloat(t.litres_sold)        || 0
    const expected  = d.checked ? d.expected_litres    : 0
    return (closing - (opening + expected - sold)).toFixed(2)
  }

  // ── Delivery toggle per tank — Option A ───────────────────
  const handleDeliveryToggle = async (tankId, checked) => {
    // Optimistically update checked state
    setDelivery(prev => ({
      ...prev,
      [tankId]: { ...prev[tankId], checked, fetching: checked },
    }))

    if (!checked) {
      // Uncheck — reset delivery figures
      setDelivery(prev => ({ ...prev, [tankId]: emptyDelivery() }))
      return
    }

    try {
      const res = await api.get(`/deliveries?date=${form.stock_date}&tank_id=${tankId}`)
      const records = res.data

      if (!records || records.length === 0) {
        showToast(
          'warning',
          'No delivery record found',
          `No tanker delivery logged for ${tankId} on ${form.stock_date}. Log it in Deliveries first.`
        )
        setDelivery(prev => ({ ...prev, [tankId]: emptyDelivery() }))
        return
      }

      // Use the first matching record (one delivery per tank per day is the norm)
      const rec = records[0]
      const actualLitres   = parseFloat(rec.actual_litres)   || 0
      const expectedLitres = parseFloat(rec.expected_litres) || 0

      setDelivery(prev => ({
        ...prev,
        [tankId]: {
          checked:         true,
          fetching:        false,
          actual_litres:   actualLitres,
          expected_litres: expectedLitres,
          record:          rec,
        },
      }))

      showToast(
        'info',
        `Delivery found — ${tankId}`,
        `Expected: ${expectedLitres.toFixed(0)} L · Actual: ${actualLitres.toFixed(0)} L · BOL: ${rec.bol_number}`
      )
    } catch (err) {
      showToast('error', 'Could not fetch deliveries', err.response?.data?.error || 'Check your connection')
      setDelivery(prev => ({ ...prev, [tankId]: emptyDelivery() }))
    }
  }

  // Reset delivery state when date changes
  const handleDateChange = (newDate) => {
    setForm(prev => ({ ...prev, stock_date: newDate }))
    setDelivery({ TANK_A: emptyDelivery(), TANK_B: emptyDelivery() })
  }

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    try {
      for (const { tankId, fuel } of TANKS) {
        const tank = form[tankId]
        if (!tank.closing_stock_dip) continue

        const actualVariance   = parseFloat(calcActualVariance(tankId))
        const expectedVariance = parseFloat(calcExpectedVariance(tankId))
        const d = delivery[tankId]

        await api.post('/tank-stock', {
          stock_date:        form.stock_date,
          tank_id:           tankId,
          fuel_type:         fuel,
          opening_stock:     parseFloat(tank.opening_stock)     || 0,
          litres_sold:       parseFloat(tank.litres_sold)        || 0,
          delivery_litres:   d.checked ? d.actual_litres         : 0,
          closing_stock_dip: parseFloat(tank.closing_stock_dip),
          actual_variance:   actualVariance,
          expected_variance: expectedVariance,
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

  const updateTank = (tankId, field, value) => {
    setForm(prev => ({ ...prev, [tankId]: { ...prev[tankId], [field]: value } }))
  }

  if (loading) return <div className="loading-screen">Loading tank stock…</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Tank Stock</h2>
          <p>Daily supervisor dip readings · Tank A (SXP → P1+P2) · Tank B (DXP → P1+P2+P3)</p>
        </div>
      </div>

      {/* Shared date picker */}
      <div style={{ marginBottom:16, maxWidth:220 }}>
        <div className="form-group">
          <label className="form-label">Date</label>
          <input
            className="form-input"
            type="date"
            value={form.stock_date}
            onChange={e => handleDateChange(e.target.value)}
          />
        </div>
      </div>

      <div className="grid-2 mb-16">
        {TANKS.map(({ tankId, fuel, label, sub, dotColor }) => {
          const tank          = form[tankId]
          const del           = delivery[tankId]
          const actualVar     = calcActualVariance(tankId)
          const expectedVar   = calcExpectedVariance(tankId)
          const actualNeg     = parseFloat(actualVar) < 0
          const expectedNeg   = parseFloat(expectedVar) < 0
          const varsDiffer    = del.checked && actualVar !== expectedVar

          return (
            <div key={tankId} className="card">
              {/* Tank header */}
              <div className="card-header">
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:10, height:10, background:dotColor, borderRadius:'50%' }}></div>
                    <div className="card-title">{label} — {sub}</div>
                  </div>
                  <div className="card-subtitle">Capacity: 10,000 L</div>
                </div>
              </div>

              {/* Delivery checkbox */}
              <div
                style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding:'8px 14px',
                  background: del.checked ? 'var(--amber-subtle)' : 'var(--surface-2)',
                  border:`1px solid ${del.checked ? 'var(--amber-border)' : 'var(--border)'}`,
                  borderRadius:'var(--r-md)',
                  cursor: del.fetching ? 'wait' : 'pointer',
                  marginBottom:14,
                  transition:'all 0.12s',
                  userSelect:'none',
                }}
                onClick={() => !del.fetching && handleDeliveryToggle(tankId, !del.checked)}
              >
                <div style={{
                  width:16, height:16,
                  border:`2px solid ${del.checked ? 'var(--amber)' : 'var(--border-strong)'}`,
                  borderRadius:3,
                  background: del.checked ? 'var(--amber)' : 'transparent',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  flexShrink:0,
                  transition:'all 0.12s',
                }}>
                  {del.checked && (
                    <svg viewBox="0 0 10 8" fill="none" width={10} height={10}>
                      <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span style={{ fontSize:13, fontWeight:500, color: del.checked ? 'var(--amber)' : 'var(--text-2)' }}>
                  {del.fetching ? 'Checking deliveries…' : 'Delivery received today'}
                </span>
                {del.checked && del.record && (
                  <span style={{ marginLeft:'auto', fontSize:11, color:'var(--amber)', fontFamily:'var(--font-mono)' }}>
                    {del.actual_litres.toFixed(0)} L actual · {del.expected_litres.toFixed(0)} L waybill
                  </span>
                )}
              </div>

              {/* Shortage note — shown when delivery has shortage */}
              {del.checked && del.record && parseFloat(del.record.shortage_litres) > 0 && (
                <div style={{
                  padding:'8px 12px',
                  background:'var(--red-subtle)',
                  border:'1px solid var(--red-border)',
                  borderRadius:'var(--r-md)',
                  marginBottom:14,
                  fontSize:12,
                  color:'var(--red)',
                  display:'flex', alignItems:'center', gap:8,
                }}>
                  <i className="ph ph-warning"></i>
                  Tanker shortage: {parseFloat(del.record.shortage_litres).toFixed(0)} L — this causes actual and expected variances to differ
                </div>
              )}

              {/* Form fields */}
              <div className="form-row" style={{ marginBottom:12 }}>
                <div className="form-group">
                  <label className="form-label">Opening stock (L)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={tank.opening_stock}
                    onChange={e => updateTank(tankId, 'opening_stock', e.target.value)}
                    placeholder="From previous dip"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Litres sold (L)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={tank.litres_sold}
                    onChange={e => updateTank(tankId, 'litres_sold', e.target.value)}
                    placeholder="From pump meters"
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom:14 }}>
                <label className="form-label">Closing stock — dip reading (L)</label>
                <input
                  className="form-input"
                  type="number"
                  value={tank.closing_stock_dip}
                  onChange={e => updateTank(tankId, 'closing_stock_dip', e.target.value)}
                  placeholder="Physically measured by supervisor"
                />
              </div>

              {/* Variance pair */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {/* Actual variance */}
                <div style={{
                  background: actualNeg ? 'var(--red-subtle)' : 'var(--green-subtle)',
                  border:`1px solid ${actualNeg ? 'var(--red-border)' : 'var(--green-border)'}`,
                  borderRadius:'var(--r-md)',
                  padding:'12px 14px',
                }}>
                  <div style={{ fontSize:10, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>
                    Actual variance
                  </div>
                  <div style={{ fontSize:20, fontWeight:700, fontFamily:'var(--font-mono)', color: actualNeg ? 'var(--red)' : 'var(--green)' }}>
                    {actualVar} L
                  </div>
                  {del.checked && (
                    <div style={{ fontSize:10, color:'var(--text-3)', marginTop:4 }}>
                      Uses actual delivery: {del.actual_litres.toFixed(0)} L
                    </div>
                  )}
                </div>

                {/* Expected variance */}
                <div style={{
                  background: expectedNeg ? 'var(--red-subtle)' : 'var(--green-subtle)',
                  border:`1px solid ${expectedNeg ? 'var(--red-border)' : 'var(--green-border)'}`,
                  borderRadius:'var(--r-md)',
                  padding:'12px 14px',
                }}>
                  <div style={{ fontSize:10, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>
                    Expected variance
                  </div>
                  <div style={{ fontSize:20, fontWeight:700, fontFamily:'var(--font-mono)', color: expectedNeg ? 'var(--red)' : 'var(--green)' }}>
                    {expectedVar} L
                  </div>
                  {del.checked && (
                    <div style={{ fontSize:10, color:'var(--text-3)', marginTop:4 }}>
                      Uses waybill: {del.expected_litres.toFixed(0)} L
                    </div>
                  )}
                </div>
              </div>

              {/* Explain the difference when variances diverge */}
              {varsDiffer && (
                <div style={{ marginTop:8, fontSize:11, color:'var(--amber)', fontWeight:500 }}>
                  Difference of {Math.abs(parseFloat(actualVar) - parseFloat(expectedVar)).toFixed(2)} L = tanker shortage on waybill
                </div>
              )}
              {!del.checked && (
                <div style={{ marginTop:8, fontSize:11, color:'var(--text-3)' }}>
                  No delivery today — both variances are identical
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:20 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <i className="ph ph-floppy-disk"></i>
          {saving ? 'Saving…' : 'Save tank stock'}
        </button>
      </div>

      {/* History table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent stock entries</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Tank</th><th>Fuel</th>
                <th>Opening</th><th>Sold</th><th>Delivery</th>
                <th>Closing (dip)</th><th>Actual var.</th><th>Expected var.</th>
              </tr>
            </thead>
            <tbody>
              {stocks.slice(0, 20).map(s => (
                <tr key={s.id}>
                  <td>{s.stock_date}</td>
                  <td><span className="badge badge-navy">{s.tank_id}</span></td>
                  <td><span className={`badge ${s.fuel_type === 'SXP' ? 'badge-blue' : 'badge-amber'}`}>{s.fuel_type}</span></td>
                  <td className="td-calc">{parseFloat(s.opening_stock).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.litres_sold).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.delivery_litres).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(s.closing_stock_dip).toFixed(2)}</td>
                  <td>
                    <span className={`badge ${parseFloat(s.actual_variance) < 0 ? 'badge-red' : 'badge-green'}`}>
                      {parseFloat(s.actual_variance).toFixed(2)} L
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${parseFloat(s.expected_variance) < 0 ? 'badge-red' : 'badge-green'}`}>
                      {parseFloat(s.expected_variance).toFixed(2)} L
                    </span>
                  </td>
                </tr>
              ))}
              {stocks.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>
                    No entries yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}