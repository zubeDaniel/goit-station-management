import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { useRole } from '../hooks/useRole'

const PUMP_CONFIGS = [
  { key: 'P1_SXP', pumpId: 'P1', label: 'Pump 1', fuel: 'SXP', dotColor: 'var(--orange)' },
  { key: 'P1_DXP', pumpId: 'P1', label: 'Pump 1', fuel: 'DXP', dotColor: 'var(--amber)' },
  { key: 'P2_SXP', pumpId: 'P2', label: 'Pump 2', fuel: 'SXP', dotColor: 'var(--orange)' },
  { key: 'P2_DXP', pumpId: 'P2', label: 'Pump 2', fuel: 'DXP', dotColor: 'var(--amber)' },
  { key: 'P3_DXP', pumpId: 'P3', label: 'Pump 3', fuel: 'DXP', dotColor: 'var(--amber)' },
]

const emptyPump = () => ({ opening_meter: '', closing_meter: '', attendant_id: '', rtt_litres: '' })

export default function MeterBook() {
  const { showToast } = useToast()
  const { isAdminOrManager } = useRole()

  const [readings, setReadings]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [prices, setPrices]       = useState({})
  const [attendants, setAttendants] = useState([])
  const [saving, setSaving]       = useState(false)
  const [dealerMargin, setDealerMargin] = useState(0.30)

  // Delivery state — Option A: checkbox only, fetches from tanker_deliveries
  const [deliveryChecked, setDeliveryChecked]   = useState(false)
  const [deliveryFetching, setDeliveryFetching] = useState(false)
  const [deliveryData, setDeliveryData]         = useState(null) // array of delivery records for the date

  const [form, setForm] = useState({
    reading_date: new Date().toISOString().split('T')[0],
    P1_SXP: emptyPump(),
    P1_DXP: emptyPump(),
    P2_SXP: emptyPump(),
    P2_DXP: emptyPump(),
    P3_DXP: emptyPump(),
  })

  // ── Load initial data ──────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/meter'),
      api.get('/prices/current'),
      // Previously fetched unconditionally, which broke this entire screen
      // for Viewer: GET /attendants is admin/manager-only on the backend,
      // so Viewer's call 403'd, Promise.all rejected as a whole, and
      // .then() never ran — meaning setReadings() never fired and Meter
      // Book appeared completely empty for Viewer, even though GET /meter
      // itself would have succeeded fine. Guarded the same way /setup
      // already correctly was.
      isAdminOrManager ? api.get('/attendants') : Promise.resolve({ data: [] }),
      isAdminOrManager ? api.get('/setup') : Promise.resolve(null),
    ]).then(([meterRes, pricesRes, attendantsRes, setupRes]) => {
      setReadings(meterRes.data)
      setPrices(pricesRes.data)
      setAttendants(attendantsRes.data)
      if (setupRes?.data?.dealer_margin_per_litre !== undefined) {
        setDealerMargin(parseFloat(setupRes.data.dealer_margin_per_litre))
      }
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-fill attendant per pump from the Shifts assignment for this
  // date. Previously this screen only ever fetched the full attendant
  // list for a blank dropdown — assigning someone to a pump on the Shifts
  // screen had no effect here at all, so the same assignment had to be
  // manually re-picked from the full staff list on every single entry.
  // Still just a default: the dropdown stays editable so a wrong or
  // missing shift assignment can be corrected here directly.
  const applyShiftAttendants = useCallback(async (date) => {
    try {
      const res = await api.get(`/shifts?start_date=${date}&end_date=${date}`)
      const shiftsForDate = res.data
      setForm(prev => {
        const updated = { ...prev }
        PUMP_CONFIGS.forEach(({ key, pumpId }) => {
          const shift = shiftsForDate.find(s => s.pump_id === pumpId)
          if (shift) {
            updated[key] = { ...updated[key], attendant_id: shift.attendant_id }
          }
        })
        return updated
      })
    } catch (err) {
      console.error('Failed to load shift assignments', err)
    }
  }, [])

  // ── Auto-fill opening meters whenever readings or date changes ──
  const autoFillOpeningMeters = useCallback((allReadings, date) => {
    setForm(prev => {
      const updated = { ...prev }
      PUMP_CONFIGS.forEach(({ key, pumpId, fuel }) => {
        // Find the most recent reading for this pump+fuel strictly before the selected date
        const prior = allReadings
          .filter(r => r.pump_id === pumpId && r.fuel_type === fuel && r.reading_date < date)
          .sort((a, b) => b.reading_date.localeCompare(a.reading_date))[0]

        if (prior) {
          updated[key] = {
            ...updated[key],
            opening_meter: parseFloat(prior.closing_meter).toFixed(2),
          }
        } else {
          // No prior record — leave blank so user can enter opening baseline
          updated[key] = { ...updated[key], opening_meter: '' }
        }
      })
      return updated
    })
  }, [])

  // Run auto-fill on mount (readings available) and on date change
  useEffect(() => {
    if (!loading && readings.length > 0) {
      autoFillOpeningMeters(readings, form.reading_date)
    }
  }, [readings, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Shift-based attendant auto-fill runs once on mount too, independent of
  // the meter-readings load (it doesn't depend on prior readings existing).
  useEffect(() => {
    applyShiftAttendants(form.reading_date)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Date change: re-fill meters + reset delivery ───────────
  const handleDateChange = (newDate) => {
    setDeliveryChecked(false)
    setDeliveryData(null)
    setForm(prev => ({ ...prev, reading_date: newDate }))
    autoFillOpeningMeters(readings, newDate)
    applyShiftAttendants(newDate)
  }

  // ── Delivery checkbox: Option A ────────────────────────────
  const handleDeliveryToggle = async (checked) => {
    setDeliveryChecked(checked)
    setDeliveryData(null)

    if (!checked) return

    setDeliveryFetching(true)
    try {
      const res = await api.get(`/deliveries?date=${form.reading_date}`)
      const records = res.data

      if (!records || records.length === 0) {
        showToast(
          'warning',
          'No delivery record found',
          `No tanker delivery logged for ${form.reading_date}. Log it in Deliveries first.`
        )
        setDeliveryChecked(false)
        return
      }

      setDeliveryData(records)
      // Show a brief confirmation of what was found
      const summary = records
        .map(d => `${d.fuel_type}: ${parseFloat(d.actual_litres).toFixed(0)} L`)
        .join(' · ')
      showToast('info', 'Delivery found', summary)
    } catch (err) {
      showToast('error', 'Could not fetch deliveries', err.response?.data?.error || 'Check your connection')
      setDeliveryChecked(false)
    } finally {
      setDeliveryFetching(false)
    }
  }

  // ── Calculations ───────────────────────────────────────────
  const calcLitres = (opening, closing) => {
    const diff = parseFloat(closing) - parseFloat(opening)
    return isNaN(diff) || diff < 0 ? 0 : diff
  }

  const calcAmount = (litres, fuelType) => {
    const price = parseFloat(prices[fuelType]?.price_per_litre || 0)
    return (litres * price).toFixed(2)
  }

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    try {
      for (const { key, pumpId, fuel } of PUMP_CONFIGS) {
        const pump = form[key]
        if (!pump.closing_meter) continue
        const litres = calcLitres(pump.opening_meter, pump.closing_meter)
        const amount = calcAmount(litres, fuel)
        await api.post('/meter', {
          reading_date:  form.reading_date,
          pump_id:       pumpId,
          fuel_type:     fuel,
          attendant_id:  pump.attendant_id || null,
          opening_meter: parseFloat(pump.opening_meter) || 0,
          closing_meter: parseFloat(pump.closing_meter),
          amount_ghs:    parseFloat(amount),
          rtt_litres:    parseFloat(pump.rtt_litres) || 0,
        })
      }

      showToast('success', 'Meter entry saved', form.reading_date)
      const res = await api.get('/meter')
      setReadings(res.data)
    } catch (err) {
      showToast('error', 'Save failed', err.response?.data?.error || 'Check your connection')
    } finally {
      setSaving(false)
    }
  }

  const updatePump = (key, field, value) => {
    setForm(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  // ── Totals ─────────────────────────────────────────────────
  const totalSXP     = ['P1_SXP','P2_SXP'].reduce((s, k) => s + calcLitres(form[k].opening_meter, form[k].closing_meter), 0)
  const totalDXP     = ['P1_DXP','P2_DXP','P3_DXP'].reduce((s, k) => s + calcLitres(form[k].opening_meter, form[k].closing_meter), 0)
  const totalLitres  = totalSXP + totalDXP
  const dealerEarnings = totalLitres * dealerMargin

  if (loading) return <div className="loading-screen">Loading meter book...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Meter Book</h2>
          <p>Per-pump daily readings · P1 (SXP+DXP) · P2 (SXP+DXP) · P3 (DXP only)</p>
        </div>
      </div>

      {isAdminOrManager && (
        <div className="card mb-16">
          <div className="card-header">
            <div className="card-title">Daily entry — {form.reading_date}</div>
          </div>

          {/* Date picker */}
          <div style={{ display:'flex', alignItems:'flex-end', gap:16, marginBottom:14 }}>
            <div className="form-group" style={{ maxWidth:220 }}>
              <label className="form-label">Date</label>
              <input
                className="form-input"
                type="date"
                value={form.reading_date}
                onChange={e => handleDateChange(e.target.value)}
              />
            </div>

            {/* Delivery toggle — Option A */}
            <div
              style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'8px 14px',
                background: deliveryChecked ? 'var(--amber-subtle)' : 'var(--surface-2)',
                border:`1px solid ${deliveryChecked ? 'var(--amber-border)' : 'var(--border)'}`,
                borderRadius:'var(--r-md)',
                cursor: deliveryFetching ? 'wait' : 'pointer',
                transition:'all 0.12s',
                userSelect:'none',
              }}
              onClick={() => !deliveryFetching && handleDeliveryToggle(!deliveryChecked)}
            >
              {/* Custom checkbox */}
              <div style={{
                width:16, height:16,
                border:`2px solid ${deliveryChecked ? 'var(--amber)' : 'var(--border-strong)'}`,
                borderRadius:3,
                background: deliveryChecked ? 'var(--amber)' : 'transparent',
                display:'flex', alignItems:'center', justifyContent:'center',
                flexShrink:0,
                transition:'all 0.12s',
              }}>
                {deliveryChecked && (
                  <svg viewBox="0 0 10 8" fill="none" width={10} height={10}>
                    <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <span style={{ fontSize:13, fontWeight:500, color: deliveryChecked ? 'var(--amber)' : 'var(--text-2)' }}>
                {deliveryFetching ? 'Checking deliveries…' : 'Delivery received today'}
              </span>
            </div>
          </div>

          {/* Delivery info strip — shown when delivery found */}
          {deliveryChecked && deliveryData && deliveryData.length > 0 && (
            <div style={{
              display:'flex', gap:12, flexWrap:'wrap',
              padding:'10px 14px',
              background:'var(--amber-subtle)',
              border:'1px solid var(--amber-border)',
              borderRadius:'var(--r-md)',
              marginBottom:14,
            }}>
              <span style={{ fontSize:12, fontWeight:600, color:'var(--amber)', marginRight:4 }}>
                <i className="ph ph-truck" style={{ marginRight:4 }}></i>
                Delivery logged for {form.reading_date}:
              </span>
              {deliveryData.map(d => (
                <span key={d.id} style={{ fontSize:12, color:'var(--text-2)' }}>
                  <strong>{d.fuel_type}</strong> — {parseFloat(d.actual_litres).toFixed(0)} L actual
                  {parseFloat(d.shortage_litres) > 0 && (
                    <span style={{ color:'var(--red)', marginLeft:4 }}>
                      ({parseFloat(d.shortage_litres).toFixed(0)} L short)
                    </span>
                  )}
                  &nbsp;· BOL: {d.bol_number}
                </span>
              ))}
              <span style={{ fontSize:11, color:'var(--text-3)', marginLeft:'auto' }}>
                Variance will be adjusted in Tank Stock
              </span>
            </div>
          )}

          {/* Pump sections */}
          {PUMP_CONFIGS.map(({ key, pumpId, label, fuel, dotColor }) => {
            const data    = form[key]
            const litres  = calcLitres(data.opening_meter, data.closing_meter)
            const amount  = calcAmount(litres, fuel)
            const tagBg   = pumpId === 'P3' ? 'var(--amber)' : 'var(--charcoal)'

            return (
              <div key={key} style={{ border:'1px solid var(--border)', borderRadius:'var(--r-md)', overflow:'hidden', marginBottom:12 }}>
                {/* Pump header */}
                <div style={{ background:'var(--surface-2)', padding:'10px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--border)' }}>
                  <span style={{ background:tagBg, color:'#fff', padding:'2px 9px', borderRadius:4, fontSize:11, fontWeight:700 }}>
                    {pumpId}
                  </span>
                  <span style={{ fontSize:13, fontWeight:500, color:'var(--charcoal)' }}>
                    {label} — {fuel}
                  </span>
                  <div style={{ width:8, height:8, background:dotColor, borderRadius:'50%', marginLeft:'auto' }}></div>
                </div>

                {/* Pump body */}
                <div style={{ padding:14 }}>
                  <div className="form-row-4" style={{ marginBottom:8 }}>
                    <div className="form-group">
                      <label className="form-label">Opening meter</label>
                      <input
                        className="form-input is-auto"
                        value={data.opening_meter}
                        readOnly
                        placeholder="Auto-filled"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Closing meter</label>
                      <input
                        className="form-input"
                        type="number"
                        value={data.closing_meter}
                        onChange={e => updatePump(key, 'closing_meter', e.target.value)}
                        placeholder="Enter reading"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Litres sold</label>
                      <input className="form-input is-calc" value={litres.toFixed(2)} readOnly />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Amount (GHS)</label>
                      <input className="form-input is-calc" value={amount} readOnly />
                    </div>
                  </div>

                  <div style={{ display:'flex', gap:14 }}>
                    <div className="form-group" style={{ flex:1, maxWidth:200 }}>
                      <label className="form-label">Attendant</label>
                      <select
                        className="form-select"
                        value={data.attendant_id}
                        onChange={e => updatePump(key, 'attendant_id', e.target.value)}
                      >
                        <option value="">Select attendant</option>
                        {attendants.filter(a => a.is_active).map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ flex:1, maxWidth:200 }}>
                      <label className="form-label" style={{ color:'var(--amber)' }}>RTT litres (optional)</label>
                      <input
                        className="form-input"
                        type="number"
                        placeholder="0.00"
                        style={{ borderColor:'var(--amber-border)' }}
                        value={data.rtt_litres}
                        onChange={e => updatePump(key, 'rtt_litres', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Totals band */}
          <div style={{
            background:'var(--orange-subtle)',
            border:'1px solid var(--orange-border)',
            borderRadius:'var(--r-md)',
            padding:'14px 16px',
            marginTop:12,
          }}>
            <div style={{ fontSize:10, fontWeight:600, color:'var(--charcoal)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:12 }}>
              Daily totals — auto-calculated
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
              {[
                { label:'Total SXP',      value:`${totalSXP.toFixed(2)} L`,    calc:true },
                { label:'Total DXP',      value:`${totalDXP.toFixed(2)} L`,    calc:true },
                { label:'Total litres',   value:`${totalLitres.toFixed(2)} L`, calc:false },
                { label:'SXP revenue',    value:`GHS ${calcAmount(totalSXP,'SXP')}`, calc:true },
                { label:'Total revenue',  value:`GHS ${(parseFloat(calcAmount(totalSXP,'SXP'))+parseFloat(calcAmount(totalDXP,'DXP'))).toFixed(2)}`, calc:false },
                { label:'Dealer earnings ★', value:`GHS ${dealerEarnings.toFixed(2)}`, calc:true, green:true },
              ].map(cell => (
                <div key={cell.label} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'var(--text-3)', marginBottom:4, textTransform:'uppercase', letterSpacing:0.3 }}>
                    {cell.label}
                  </div>
                  <div style={{
                    fontSize:16, fontWeight:700,
                    color: cell.green ? 'var(--green)' : cell.calc ? 'var(--calc-text)' : 'var(--charcoal)',
                    fontFamily: cell.calc ? 'var(--font-mono)' : 'var(--font)',
                  }}>
                    {cell.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
            <button className="btn btn-ghost">Clear form</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <i className="ph ph-floppy-disk"></i>
              {saving ? 'Saving…' : 'Save entry'}
            </button>
          </div>
        </div>
      )}

      {/* History table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent readings</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Pump</th><th>Fuel</th><th>Attendant</th><th>Opening</th>
                <th>Closing</th><th>Litres sold</th><th>Amount (GHS)</th><th>RTT</th>
              </tr>
            </thead>
            <tbody>
              {readings.slice(0, 20).map(r => (
                <tr key={r.id}>
                  <td>{r.reading_date}</td>
                  <td><span className="badge badge-navy">{r.pump_id}</span></td>
                  <td><span className={`badge ${r.fuel_type === 'SXP' ? 'badge-blue' : 'badge-amber'}`}>{r.fuel_type}</span></td>
                  <td>{r.attendants?.name || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                  <td className="td-calc">{parseFloat(r.opening_meter).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(r.closing_meter).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(r.litres_sold).toFixed(2)}</td>
                  <td className="td-calc">{parseFloat(r.amount_ghs).toFixed(2)}</td>
                  <td className="td-calc" style={{ color:'var(--amber)' }}>
                    {parseFloat(r.rtt_litres || 0).toFixed(2)}
                  </td>
                </tr>
              ))}
              {readings.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign:'center', color:'var(--text-3)', padding:24 }}>
                    No readings yet
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