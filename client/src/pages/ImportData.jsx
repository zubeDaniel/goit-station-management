import { useState, useRef } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'

const SHEET_MAP = {
  'meter book': 'meter',
  'meterbook': 'meter',
  'meter': 'meter',
  'sales book': 'sales',
  'salesbook': 'sales',
  'sales': 'sales',
  'banking': 'banking',
  'bank': 'banking',
  'creditors': 'creditors',
  'merka wood': 'creditors',
  'credit sales': 'creditors',
  'expenses': 'expenses',
  'expense': 'expenses',
}

const SHEET_LABELS = {
  meter: 'Meter Book',
  sales: 'Sales Book',
  banking: 'Banking',
  creditors: 'Merka Wood Credit Sales',
  expenses: 'Expenses',
}

export default function ImportData() {
  const XLSX = window.XLSX
  const { showToast } = useToast()
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [workbook, setWorkbook] = useState(null)
  const [sheets, setSheets] = useState([])
  const [detectedSheets, setDetectedSheets] = useState([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [preview, setPreview] = useState([])
  const [headers, setHeaders] = useState([])
  const [importType, setImportType] = useState('meter')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [tab, setTab] = useState('all')

  const detectSheets = (wb) => {
    const detected = []
    const unrecognised = []
    for (const name of wb.SheetNames) {
      const key = name.toLowerCase().trim()
      const type = SHEET_MAP[key]
      if (type) {
        detected.push({ name, type, label: SHEET_LABELS[type] })
      } else {
        unrecognised.push(name)
      }
    }
    return { detected, unrecognised }
  }

  const handleFileSelect = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setResult(null)
    setPreview([])

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        setWorkbook(wb)
        setSheets(wb.SheetNames)
        setSelectedSheet(wb.SheetNames[0])
        const { detected, unrecognised } = detectSheets(wb)
        setDetectedSheets(detected)
        loadSheetPreview(wb, wb.SheetNames[0])
      } catch (err) {
        showToast('error', 'Failed to read file', err.message)
      }
    }
    reader.readAsBinaryString(f)
  }

  const loadSheetPreview = (wb, sheetName) => {
    const sheet = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    if (rows.length === 0) return
    const hdrs = rows[0].map(String)
    const dataRows = rows.slice(1).filter(row => row.some(cell => cell !== ''))
    setHeaders(hdrs)
    setPreview(dataRows.slice(0, 5))
  }

  const handleSheetChange = (sheetName) => {
    setSelectedSheet(sheetName)
    if (workbook) loadSheetPreview(workbook, sheetName)
  }

  const parseExcelDate = (val) => {
    if (!val) return null
    if (typeof val === 'number') {
      const date = new Date((val - 25569) * 86400 * 1000)
      return date.toISOString().split('T')[0]
    }
    const str = String(val).trim()
    const parts = str.split('/')
    if (parts.length === 3) {
      const [d, m, y] = parts
      return `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
    const parsed = new Date(str)
    if (!isNaN(parsed)) return parsed.toISOString().split('T')[0]
    return null
  }

  const importSheet = async (wb, sheetName, type, creditorId) => {
    const sheet = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
    let imported = 0
    let skipped = 0
    const warnings = []

    for (const row of rows) {
      try {
        const dateVal = row['Date'] || row['date'] || row['DATE']
        if (!dateVal) { skipped++; continue }
        const date = parseExcelDate(dateVal)
        if (!date) { skipped++; warnings.push(`Invalid date: ${dateVal}`); continue }

        if (type === 'meter') {
          const pumpConfigs = [
            { pump: 'P1', fuel: 'SXP', open: 'P1 SXP Open', close: 'P1 SXP Close', amt: 'P1 SXP Amount', rtt: 'P1 SXP RTT' },
            { pump: 'P1', fuel: 'DXP', open: 'P1 DXP Open', close: 'P1 DXP Close', amt: 'P1 DXP Amount', rtt: 'P1 DXP RTT' },
            { pump: 'P2', fuel: 'SXP', open: 'P2 SXP Open', close: 'P2 SXP Close', amt: 'P2 SXP Amount', rtt: 'P2 SXP RTT' },
            { pump: 'P2', fuel: 'DXP', open: 'P2 DXP Open', close: 'P2 DXP Close', amt: 'P2 DXP Amount', rtt: 'P2 DXP RTT' },
            { pump: 'P3', fuel: 'DXP', open: 'P3 DXP Open', close: 'P3 DXP Close', amt: 'P3 DXP Amount', rtt: 'P3 DXP RTT' },
          ]
          for (const cfg of pumpConfigs) {
            if (row[cfg.open] === undefined && row[cfg.close] === undefined) continue
            await api.post('/meter', {
              reading_date: date,
              pump_id: cfg.pump,
              fuel_type: cfg.fuel,
              opening_meter: parseFloat(row[cfg.open]) || 0,
              closing_meter: parseFloat(row[cfg.close]) || 0,
              rtt_litres: parseFloat(row[cfg.rtt]) || 0
            }).then(() => imported++).catch(err => { skipped++; warnings.push(`${date} ${cfg.pump} ${cfg.fuel}: ${err.response?.data?.error || err.message}`) })
          }
        }

        if (type === 'sales') {
          await api.post('/sales', {
            entry_date: date,
            coupons_ghs: parseFloat(row['Coupons'] || row['coupons'] || 0),
            gocard_ghs: parseFloat(row['GoCard'] || row['gocard'] || row['Go Card'] || 0),
            momo_ghs: parseFloat(row['MoMo'] || row['momo'] || row['Mobile Money'] || 0),
            merka_wood_ghs: parseFloat(row['Merka Wood'] || row['merka_wood'] || row['Merka'] || 0),
            genset_ghs: parseFloat(row['Genset'] || row['genset'] || 0),
            lubricant_ghs: parseFloat(row['Lubricant'] || row['lubricant'] || 0),
            meter_amount_ghs: parseFloat(row['Meter Amount'] || row['meter_amount'] || row['Meter'] || 0),
          }).then(() => imported++).catch(err => { skipped++; warnings.push(`${date}: ${err.response?.data?.error || err.message}`) })
        }

        if (type === 'banking') {
          await api.post('/banking', {
            entry_date: date,
            nib_ghs: parseFloat(row['NIB'] || row['nib'] || 0),
            umb_momo_ghs: parseFloat(row['MoMo'] || row['UMB'] || row['UMB/MoMo'] || row['momo'] || 0),
            gocard_ghs: parseFloat(row['GoCard'] || row['gocard'] || row['Go Card'] || 0),
            coupons_50_ghs: parseFloat(row['Coupons 50'] || row['Coupons @50'] || row['coupons_50'] || 0),
            coupons_100_ghs: parseFloat(row['Coupons 100'] || row['Coupons @100'] || row['coupons_100'] || 0),
          }).then(() => imported++).catch(err => { skipped++; warnings.push(`${date}: ${err.response?.data?.error || err.message}`) })
        }

        if (type === 'creditors' && creditorId) {
          const dxpLitres = parseFloat(row['DXP Litres'] || row['DXP'] || row['dxp_litres'] || row['Litres'] || 0)
          const sxpLitres = parseFloat(row['SXP Litres'] || row['SXP'] || row['sxp_litres'] || 0)
          if (dxpLitres === 0 && sxpLitres === 0) { skipped++; continue }
          await api.post('/creditors/credit-sales', {
            sale_date: date,
            creditor_id: creditorId,
            sxp_litres: sxpLitres,
            dxp_litres: dxpLitres,
          }).then(() => imported++).catch(err => { skipped++; warnings.push(`${date}: ${err.response?.data?.error || err.message}`) })
        } else if (type === 'creditors' && !creditorId) {
          skipped++
          warnings.push(`${date}: skipped — Merka Wood creditor not found, add it in Creditors first`)
        }

        if (type === 'expenses') {
          await api.post('/expenses', {
            expense_date: date,
            category: row['Category'] || row['category'] || 'Other',
            amount_ghs: parseFloat(row['Amount'] || row['amount'] || row['Amount (GHS)'] || 0),
            description: row['Description'] || row['description'] || row['Details'] || 'Imported',
            receipt_number: row['Receipt'] || row['receipt'] || row['Receipt No'] || '',
          }).then(() => imported++).catch(err => { skipped++; warnings.push(`${date}: ${err.response?.data?.error || err.message}`) })
        }

      } catch (err) {
        skipped++
        warnings.push(`Row error: ${err.message}`)
      }
    }

    return { imported, skipped, warnings }
  }

  const handleImportAll = async () => {
    if (!file || !workbook) return
    setImporting(true)
    setResult(null)

    try {
      // Get Merka Wood creditor id for creditor sheets
      let creditorId = null
      try {
        const credRes = await api.get('/creditors')
        const merka = credRes.data.find(c => c.name.toLowerCase().includes('merka'))
        if (merka) creditorId = merka.id
      } catch {}

      const { detected, unrecognised } = detectSheets(workbook)
      const results = []

      for (const sheet of detected) {
        showToast('info', `Importing ${sheet.label}...`, `Sheet: ${sheet.name}`)
        const res = await importSheet(workbook, sheet.name, sheet.type, creditorId)
        results.push({ ...sheet, ...res })
      }

      setResult({ results, unrecognised })

      const totalImported = results.reduce((s, r) => s + r.imported, 0)
      const totalSkipped = results.reduce((s, r) => s + r.skipped, 0)
      showToast(
        totalImported > 0 ? 'success' : 'warning',
        'Import complete',
        `${totalImported} rows imported across ${results.length} sheets`
      )
    } catch (err) {
      showToast('error', 'Import failed', err.message)
    } finally {
      setImporting(false)
    }
  }

  const handleImportSingle = async () => {
    if (!file || !workbook) return
    setImporting(true)
    setResult(null)

    try {
      let creditorId = null
      if (importType === 'creditors') {
        const credRes = await api.get('/creditors')
        const merka = credRes.data.find(c => c.name.toLowerCase().includes('merka'))
        if (merka) creditorId = merka.id
        else {
          showToast('error', 'Merka Wood creditor not found', 'Add it in Creditors first')
          setImporting(false)
          return
        }
      }

      const res = await importSheet(workbook, selectedSheet, importType, creditorId)
      setResult({ results: [{ name: selectedSheet, label: SHEET_LABELS[importType], ...res }], unrecognised: [] })
      showToast(
        res.imported > 0 ? 'success' : 'warning',
        'Import complete',
        `${res.imported} rows imported, ${res.skipped} skipped`
      )
    } catch (err) {
      showToast('error', 'Import failed', err.message)
    } finally {
      setImporting(false)
    }
  }

  const importTypes = [
    { key: 'meter', label: 'Meter Book' },
    { key: 'sales', label: 'Sales Book' },
    { key: 'banking', label: 'Banking' },
    { key: 'creditors', label: 'Merka Wood Credit Sales' },
    { key: 'expenses', label: 'Expenses' },
  ]

  return (
    <div>
      <div className="page-header">
        <div><h2>Import Data</h2><p>Historical migration from Excel — all sheets or individual</p></div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden', width: 'fit-content' }}>
        {[
          { key: 'all', label: 'Import all sheets' },
          { key: 'single', label: 'Single sheet' },
        ].map(t => (
          <div key={t.key} onClick={() => setTab(t.key)} style={{ padding: '8px 20px', fontSize: 13, fontWeight: tab === t.key ? 500 : 400, cursor: 'pointer', background: tab === t.key ? 'var(--navy)' : 'var(--surface)', color: tab === t.key ? '#fff' : 'var(--text-2)' }}>
            {t.label}
          </div>
        ))}
      </div>

      {/* Upload zone — shared between tabs */}
      <div className="card mb-16">
        <div className="card-header"><div className="card-title">Upload Excel file</div></div>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            const f = e.dataTransfer.files[0]
            if (f) handleFileSelect({ target: { files: [f] } })
          }}
          style={{ border: '2px dashed var(--border)', borderRadius: 'var(--r-md)', padding: '36px 20px', textAlign: 'center', cursor: 'pointer', background: 'var(--surface-2)', marginBottom: file ? 12 : 0 }}>
          <i className="ph ph-file-xls" style={{ fontSize: 40, color: 'var(--green)', display: 'block', marginBottom: 12 }}></i>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', marginBottom: 6 }}>
            {file ? file.name : 'Drag and drop your Excel file here'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
            {file ? `${(file.size / 1024).toFixed(0)} KB · ${sheets.length} sheets detected` : 'or click to browse — .xlsx and .xls supported'}
          </div>
          {!file && <button className="btn btn-ghost btn-sm"><i className="ph ph-upload-simple"></i> Browse file</button>}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileSelect} />
        </div>

        {file && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setFile(null); setWorkbook(null); setSheets([]); setPreview([]); setHeaders([]); setResult(null); setDetectedSheets([]) }}>
              <i className="ph ph-x"></i> Clear file
            </button>
          </div>
        )}
      </div>

      {/* Import all sheets tab */}
      {tab === 'all' && (
        <>
          {detectedSheets.length > 0 && (
            <div className="card mb-16">
              <div className="card-header">
                <div className="card-title">Detected sheets</div>
                <span className="badge badge-green">{detectedSheets.length} recognised</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {detectedSheets.map(sheet => (
                  <div key={sheet.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--green-border)', borderRadius: 'var(--r-sm)', background: 'var(--green-subtle)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{sheet.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Sheet: "{sheet.name}"</div>
                    </div>
                    <span className="badge badge-green"><i className="ph ph-check"></i> Matched</span>
                  </div>
                ))}
              </div>

              {/* Unrecognised sheets */}
              {result?.unrecognised?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>Unrecognised sheets — skipped</div>
                  {result.unrecognised.map(name => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>"{name}"</span>
                      <span className="badge badge-neutral">Skipped</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleImportAll} disabled={importing || detectedSheets.length === 0}>
                  <i className="ph ph-upload-simple"></i> {importing ? 'Importing...' : `Import all ${detectedSheets.length} sheets`}
                </button>
              </div>
            </div>
          )}

          {!file && (
            <div className="alert alert-info">
              <div className="alert-body">
                <div className="alert-title">How it works</div>
                <div className="alert-desc">Upload your KUNTUNSO_GOIL_DATABASE.xlsx file. The system will automatically detect Meter Book, Sales Book, Banking, Creditors, and Expenses sheets and import them all in one go. Unrecognised sheets are skipped safely.</div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Single sheet tab */}
      {tab === 'single' && (
        <>
          {sheets.length > 0 && (
            <div className="grid-2 mb-16">
              <div className="card">
                <div className="card-header"><div className="card-title">Select sheet</div></div>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Sheet</label>
                  <select className="form-select" value={selectedSheet} onChange={e => handleSheetChange(e.target.value)}>
                    {sheets.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><div className="card-title">Import type</div></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {importTypes.map(t => (
                    <div key={t.key} onClick={() => setImportType(t.key)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: `1px solid ${importType === t.key ? 'var(--navy-border)' : 'var(--border)'}`, borderRadius: 'var(--r-sm)', cursor: 'pointer', background: importType === t.key ? 'var(--navy-light)' : 'var(--surface)' }}>
                      <span style={{ fontSize: 13, fontWeight: importType === t.key ? 500 : 400 }}>{t.label}</span>
                      {importType === t.key && <span className="badge badge-navy"><i className="ph ph-check"></i></span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="card mb-16">
              <div className="card-header">
                <div className="card-title">Preview — {selectedSheet} (first 5 rows)</div>
                <span className="badge badge-blue">{headers.length} columns</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i}>{headers.map((_, j) => <td key={j} style={{ fontSize: 11 }}>{String(row[j] || '')}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {sheets.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
              <button className="btn btn-primary" onClick={handleImportSingle} disabled={!file || importing}>
                <i className="ph ph-upload-simple"></i> {importing ? 'Importing...' : 'Import this sheet'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Results */}
      {result && (
        <div className="card" style={{ borderColor: 'var(--green-border)' }}>
          <div className="card-header"><div className="card-title">Import results</div></div>
          {result.results.map((r, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>{r.label} — "{r.name}"</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: r.warnings?.length > 0 ? 8 : 0 }}>
                <div style={{ textAlign: 'center', padding: 12, background: 'var(--green-subtle)', border: '1px solid var(--green-border)', borderRadius: 'var(--r-md)' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{r.imported}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', marginTop: 4 }}>Imported</div>
                </div>
                <div style={{ textAlign: 'center', padding: 12, background: 'var(--amber-subtle)', border: '1px solid var(--amber-border)', borderRadius: 'var(--r-md)' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--amber)' }}>{r.skipped}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', marginTop: 4 }}>Skipped</div>
                </div>
                <div style={{ textAlign: 'center', padding: 12, background: 'var(--navy-light)', border: '1px solid var(--navy-border)', borderRadius: 'var(--r-md)' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>{r.warnings?.length || 0}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', marginTop: 4 }}>Warnings</div>
                </div>
              </div>
              {r.warnings?.length > 0 && (
                <div style={{ background: 'var(--amber-subtle)', border: '1px solid var(--amber-border)', borderRadius: 'var(--r-sm)', padding: '8px 12px' }}>
                  {r.warnings.slice(0, 5).map((w, j) => (
                    <div key={j} style={{ fontSize: 11, color: 'var(--amber)', padding: '2px 0' }}>{w}</div>
                  ))}
                </div>
              )}
              {i < result.results.length - 1 && <div style={{ borderBottom: '1px solid var(--border)', marginTop: 16 }}></div>}
            </div>
          ))}

          {result.unrecognised?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
                Skipped unrecognised sheets: {result.unrecognised.join(', ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}