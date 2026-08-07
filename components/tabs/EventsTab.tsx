'use client'

import { useEffect, useState } from 'react'

type BinanceEvent = {
  id: string; title: string; datetime: string
  type: 'listing' | 'trading' | 'airdrop' | 'launchpool' | 'other'
  description: string; url: string; scannedAt: string
}

const TYPE_CONFIG = {
  listing:    { icon: '', label: 'Listing',    bg: 'rgba(240,185,11,0.12)',  color: 'var(--yellow)' },
  trading:    { icon: '', label: 'Trading',    bg: 'rgba(14,203,129,0.12)', color: 'var(--green)'  },
  airdrop:    { icon: '', label: 'Airdrop',    bg: 'rgba(114,137,218,0.15)',color: '#7289da'       },
  launchpool: { icon: '', label: 'Launchpool', bg: 'rgba(52,152,219,0.12)', color: '#3498db'       },
  other:      { icon: '',  label: 'Other',      bg: 'var(--bg4)',            color: 'var(--text2)'  },
}

function pad(n: number) { return String(n).padStart(2, '0') }
function fmtICS(dt: string) {
  const d = new Date(dt)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
}
function makeICS(events: BinanceEvent[]) {
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Binalyst//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH']
  events.forEach(ev => {
    const s = fmtICS(ev.datetime), e = fmtICS(new Date(new Date(ev.datetime).getTime() + 3600000).toISOString())
    lines.push('BEGIN:VEVENT',`UID:${ev.id}@binalyst`,`DTSTART:${s}`,`DTEND:${e}`,
      `SUMMARY:${ev.title}`,`DESCRIPTION:${(ev.description ?? '').replace(/\n/g, '\\n')}`,
      `URL:${ev.url || 'https://binance.com'}`,
      'BEGIN:VALARM','TRIGGER:-PT10M','ACTION:DISPLAY',`DESCRIPTION:10 min: ${ev.title}`,'END:VALARM',
      'BEGIN:VALARM','TRIGGER:-PT5M','ACTION:DISPLAY',`DESCRIPTION:5 min: ${ev.title}`,'END:VALARM',
      'END:VEVENT')
  })
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
function downloadICS(events: BinanceEvent[], name: string) {
  const blob = new Blob([makeICS(events)], { type: 'text/calendar' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = name + '.ics'; a.click()
}
function getCountdown(dt: string) {
  const diff = new Date(dt).getTime() - Date.now()
  if (diff < 0) return { text: 'started', hot: false, live: true }
  const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000), m = Math.floor((diff % 3600000) / 60000)
  if (d > 0) return { text: `${d}d ${h}h`, hot: false, live: false }
  if (h > 0) return { text: `${h}h ${m}m`, hot: diff < 3600000, live: false }
  return { text: `${m}m`, hot: true, live: false }
}
function fmtDT(dt: string) {
  try { return new Date(dt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }) }
  catch { return dt }
}

export default function EventsTab() {
  const [events, setEvents]         = useState<BinanceEvent[]>([])
  const [filter, setFilter]         = useState<string>('all')
  const [scanning, setScanning]     = useState(false)
  const [error, setError]           = useState('')
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const [tick, setTick]             = useState(0)

  // Countdown refresh every 30s
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  async function scan(force = false) {
    setScanning(true); setError('')
    try {
      const res = await fetch('/api/events/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const d = await res.json()
      if (d.success) { setEvents(d.data); setLastScanned(new Date().toISOString()) }
      else setError(d.error)
    } catch (e: any) { setError(e.message) }
    setScanning(false)
  }

  const filtered  = filter === 'all' ? events : events.filter(e => e.type === filter)
  const counts    = {
    listing: events.filter(e => e.type === 'listing').length,
    airdrop: events.filter(e => e.type === 'airdrop').length,
    launchpool: events.filter(e => e.type === 'launchpool').length,
    trading: events.filter(e => e.type === 'trading').length,
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{background:"var(--bg)"}}>
    <div className="max-w-4xl mx-auto px-6 py-6">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-extrabold uppercase tracking-tight" style={{ color: 'var(--text)' }}>Events <span style={{color:"var(--yellow)"}}>Radar</span></h2>
          <p className="mono text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
            Binance listings, airdrops, launchpool · auto-scanned hourly
            {lastScanned && <span> · last scan {new Date(lastScanned).toLocaleTimeString()}</span>}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {events.length > 0 && (
            <button onClick={() => downloadICS(events, 'binalyst_events')}
              className="mono text-xs px-3 py-2 rounded-md transition-all"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
              ⬇ Export all (.ics)
            </button>
          )}
          <button onClick={() => scan(true)} disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all"
            style={{ background: scanning ? 'var(--bg4)' : 'var(--yellow)', color: scanning ? 'var(--text3)' : '#000', cursor: scanning ? 'not-allowed' : 'pointer' }}>
            {scanning && <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin-slow" />}
            {scanning ? 'Scanning...' : 'Scan Binance'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total',      value: events.length,         yellow: true  },
          { label: 'Listings',   value: counts.listing,        yellow: false },
          { label: 'Airdrops',   value: counts.airdrop,        yellow: false },
          { label: 'Launchpool', value: counts.launchpool,     yellow: false },
        ].map(({ label, value, yellow }) => (
          <div key={label} className="rounded-md p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="mono text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>{label}</div>
            <div className="mono text-2xl font-extrabold" style={{ color: yellow ? 'var(--yellow)' : 'var(--text)' }}>{value || '—'}</div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md p-3 mb-4 mono text-xs" style={{ background: 'rgba(246,70,93,0.08)', border: '1px solid rgba(246,70,93,0.25)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {/* Filters */}
      {events.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {['all', 'listing', 'trading', 'airdrop', 'launchpool', 'other'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="mono text-xs px-3 py-1.5 rounded transition-all capitalize"
              style={{
                background: filter === f ? 'var(--yellow)' : 'var(--bg2)',
                color: filter === f ? '#000' : 'var(--text2)',
                border: filter === f ? 'none' : '1px solid var(--border)',
              }}>
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Events list */}
      {filtered.length > 0 ? (
        <div className="flex flex-col gap-3">
          {filtered.map(ev => {
            const cfg = TYPE_CONFIG[ev.type] ?? TYPE_CONFIG.other
            const cd  = getCountdown(ev.datetime)
            return (
              <div key={ev.id} className="flex items-center gap-4 rounded-md p-4 transition-all"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                <div className="w-10 h-10 rounded-md flex items-center justify-center text-xl shrink-0" style={{ background: cfg.bg }}>{cfg.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="mono text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest"
                      style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{ev.title}</span>
                  </div>
                  {ev.description && <p className="text-xs mb-1" style={{ color: 'var(--text2)' }}>{ev.description}</p>}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>{fmtDT(ev.datetime)}</span>
                    {ev.url && <a href={ev.url} target="_blank" rel="noreferrer" className="mono text-[10px]" style={{ color: 'var(--text3)' }}>source ↗</a>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="mono text-[10px] px-2 py-1 rounded"
                    style={{
                      background: cd.live ? 'rgba(14,203,129,0.12)' : cd.hot ? 'rgba(240,185,11,0.12)' : 'var(--bg3)',
                      color: cd.live ? 'var(--green)' : cd.hot ? 'var(--yellow)' : 'var(--text2)',
                      border: `1px solid ${cd.live ? 'rgba(14,203,129,0.25)' : cd.hot ? 'rgba(240,185,11,0.25)' : 'var(--border)'}`,
                    }}>
                    {cd.text}
                  </span>
                  <button onClick={() => downloadICS([ev], ev.title.slice(0, 20).replace(/\s/g, '_'))}
                    className="mono text-[10px] px-3 py-1 rounded-md transition-all"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
                    + calendar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : !scanning ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div style={{width:36,height:36,borderRadius:6,border:"2px solid rgba(240,185,11,.25)",opacity:.4,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(240,185,11,.8)" strokeWidth="1.8" strokeLinecap="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <div>
            <div className="font-bold mb-1" style={{ color: 'var(--text)' }}>No events loaded</div>
            <div className="mono text-xs max-w-xs" style={{ color: 'var(--text3)' }}>Click "Scan Binance" to pull the latest listings, airdrops, and launchpool events.</div>
          </div>
        </div>
      ) : null}
    </div>
  </div>
  )
}