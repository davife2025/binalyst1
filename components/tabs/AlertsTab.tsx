'use client'

import { useEffect, useState } from 'react'

type AlertCondition = 'above' | 'below'
type Alert = {
  id: string
  symbol: string
  condition: AlertCondition
  target: number
  note: string
  active: boolean
  createdAt: number
  triggeredAt?: number
}

const STORAGE_KEY = 'binalyst_alerts'

function loadAlerts(): Alert[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveAlerts(alerts: Alert[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts))
}

async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  const result = await Notification.requestPermission()
  return result === 'granted'
}

function fireNotification(title: string, body: string) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' })
  }
}

export default function AlertsTab() {
  const [alerts,     setAlerts]     = useState<Alert[]>([])
  const [symbol,     setSymbol]     = useState('BTC')
  const [condition,  setCondition]  = useState<AlertCondition>('above')
  const [target,     setTarget]     = useState('')
  const [note,       setNote]       = useState('')
  const [prices,     setPrices]     = useState<Record<string, number>>({})
  const [checking,   setChecking]   = useState(false)
  const [notifPerms, setNotifPerms] = useState<NotificationPermission>('default')
  const [lastCheck,  setLastCheck]  = useState<string | null>(null)

  useEffect(() => {
    setAlerts(loadAlerts())
    if ('Notification' in window) setNotifPerms(Notification.permission)
  }, [])

  // Auto-check every 60 seconds
  useEffect(() => {
    if (!alerts.length) return
    const interval = setInterval(() => checkAlerts(), 60000)
    return () => clearInterval(interval)
  }, [alerts])

  async function enableNotifications() {
    const granted = await requestNotificationPermission()
    setNotifPerms(granted ? 'granted' : 'denied')
    if (granted) fireNotification('Binalyst Alerts', 'Price alerts are now enabled!')
  }

  function addAlert() {
    if (!symbol || !target) return
    const alert: Alert = {
      id: crypto.randomUUID(),
      symbol: symbol.toUpperCase(),
      condition,
      target: parseFloat(target),
      note,
      active: true,
      createdAt: Date.now(),
    }
    const updated = [alert, ...alerts]
    setAlerts(updated); saveAlerts(updated)
    setSymbol('BTC'); setTarget(''); setNote('')
  }

  function removeAlert(id: string) {
    const updated = alerts.filter(a => a.id !== id)
    setAlerts(updated); saveAlerts(updated)
  }

  function toggleAlert(id: string) {
    const updated = alerts.map(a => a.id === id ? { ...a, active: !a.active } : a)
    setAlerts(updated); saveAlerts(updated)
  }

  async function checkAlerts() {
    if (!alerts.length) return
    setChecking(true)

    const activeAlerts = alerts.filter(a => a.active && !a.triggeredAt)
   const symbols = Array.from(new Set(activeAlerts.map(a => a.symbol + 'USDT')))

    try {
      const res = await fetch(`/api/binance/market?action=prices&symbols=${symbols.join(',')}`)
      const d = await res.json()
      if (!d.success) return

      const newPrices: Record<string, number> = {}
      Object.entries(d.data).forEach(([sym, price]) => {
        newPrices[sym.replace('USDT', '')] = price as number
      })
      setPrices(newPrices)
      setLastCheck(new Date().toLocaleTimeString())

      let updated = [...alerts]
      activeAlerts.forEach(alert => {
        const price = newPrices[alert.symbol]
        if (!price) return
        const triggered =
          (alert.condition === 'above' && price >= alert.target) ||
          (alert.condition === 'below' && price <= alert.target)

        if (triggered) {
          const msg = `${alert.symbol} is ${alert.condition} $${alert.target.toLocaleString()}! Current: $${price.toLocaleString()}`
          fireNotification(`🚨 Binalyst Alert: ${alert.symbol}`, msg)
          updated = updated.map(a => a.id === alert.id ? { ...a, triggeredAt: Date.now(), active: false } : a)
        }
      })

      setAlerts(updated); saveAlerts(updated)
    } catch {}
    setChecking(false)
  }

  const activeCount    = alerts.filter(a => a.active && !a.triggeredAt).length
  const triggeredCount = alerts.filter(a => a.triggeredAt).length

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--text)' }}>Price Alerts</h2>
          <p className="mono text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
            Browser push notifications when prices hit your targets
            {lastCheck && <span> · last check {lastCheck}</span>}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {notifPerms !== 'granted' && (
            <button onClick={enableNotifications} className="mono text-xs px-3 py-2 rounded-lg font-bold transition-all"
              style={{ background: 'var(--yellow)', color: '#000' }}>
              Enable Notifications
            </button>
          )}
          <button onClick={() => checkAlerts()} disabled={checking || !alerts.length}
            className="flex items-center gap-2 mono text-xs px-3 py-2 rounded-lg transition-all"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', opacity: !alerts.length ? 0.4 : 1 }}>
            {checking && <span className="w-3 h-3 rounded-full border-2 animate-spin-slow" style={{ borderColor: 'var(--border2)', borderTopColor: 'var(--yellow)' }} />}
            {checking ? 'Checking...' : '↺ Check now'}
          </button>
        </div>
      </div>

      {/* Notification permission banner */}
      {notifPerms !== 'granted' && (
        <div className="rounded-xl p-4 mb-5 flex items-start gap-3"
          style={{ background: 'rgba(240,185,11,0.06)', border: '1px solid rgba(240,185,11,0.2)' }}>
          <span style={{ color: 'var(--yellow)', fontSize: 20, flexShrink: 0 }}>🔔</span>
          <div>
            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--yellow)' }}>Browser notifications required</div>
            <div className="mono text-xs" style={{ color: 'var(--text2)' }}>
              {notifPerms === 'denied'
                ? 'Notifications are blocked. Enable them in your browser settings for this site.'
                : 'Click "Enable Notifications" to get alerted when prices hit your targets. Alerts are checked every 60 seconds while the tab is open.'}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total Alerts',  value: alerts.length,  color: 'var(--text)' },
          { label: 'Active',        value: activeCount,    color: 'var(--green)' },
          { label: 'Triggered',     value: triggeredCount, color: 'var(--yellow)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="mono text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>{label}</div>
            <div className="mono text-2xl font-extrabold" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Add alert form */}
      <div className="rounded-xl p-5 mb-5" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
        <div className="mono text-[10px] uppercase tracking-widest mb-4" style={{ color: 'var(--text3)' }}>New Alert</div>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <span className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Coin</span>
            <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="BTC"
              className="mono text-sm px-3 py-2.5 rounded-lg outline-none w-24"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}
              onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
          </div>

          <div className="flex flex-col gap-1">
            <span className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Condition</span>
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {(['above', 'below'] as AlertCondition[]).map(c => (
                <button key={c} onClick={() => setCondition(c)} className="px-4 py-2.5 mono text-xs font-bold transition-all capitalize"
                  style={{ background: condition === c ? 'var(--yellow)' : 'transparent', color: condition === c ? '#000' : 'var(--text2)' }}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-32">
            <span className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Target Price ($)</span>
            <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="100000"
              className="mono text-sm px-3 py-2.5 rounded-lg outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}
              onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-32">
            <span className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Note (optional)</span>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Take profit level"
              className="mono text-sm px-3 py-2.5 rounded-lg outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}
              onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
          </div>

          <button onClick={addAlert} className="px-5 py-2.5 rounded-lg text-sm font-bold shrink-0"
            style={{ background: 'var(--yellow)', color: '#000' }}>
            + Add Alert
          </button>
        </div>

        {/* Current prices preview */}
        {Object.keys(prices).length > 0 && (
          <div className="flex gap-3 mt-3 flex-wrap">
            {Object.entries(prices).map(([coin, price]) => (
              <div key={coin} className="mono text-[10px] px-2 py-1 rounded"
                style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>
                {coin} <span style={{ color: 'var(--text)' }}>${price.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alerts list */}
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center rounded-xl"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <div className="text-4xl opacity-30">🔔</div>
          <div className="font-bold" style={{ color: 'var(--text)' }}>No alerts set</div>
          <div className="mono text-xs" style={{ color: 'var(--text3)' }}>Add a price alert above to get notified.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map(alert => {
            const currentPrice = prices[alert.symbol]
            const isTriggered  = !!alert.triggeredAt
            return (
              <div key={alert.id} className="flex items-center gap-4 rounded-xl px-4 py-3 transition-all"
                style={{
                  background: 'var(--bg2)',
                  border: `1px solid ${isTriggered ? 'rgba(240,185,11,0.3)' : alert.active ? 'var(--border)' : 'var(--bg4)'}`,
                  opacity: !alert.active && !isTriggered ? 0.5 : 1,
                }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                  style={{ background: isTriggered ? 'rgba(240,185,11,0.15)' : alert.active ? 'rgba(14,203,129,0.1)' : 'var(--bg4)' }}>
                  {isTriggered ? '✓' : alert.active ? '🔔' : '—'}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="mono text-xs font-bold" style={{ color: 'var(--text)' }}>{alert.symbol}</span>
                    <span className="mono text-[10px]" style={{ color: 'var(--text2)' }}>
                      {alert.condition} ${alert.target.toLocaleString()}
                    </span>
                    {alert.note && <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>· {alert.note}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {currentPrice && (
                      <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>
                        now ${currentPrice.toLocaleString()}
                      </span>
                    )}
                    {isTriggered && (
                      <span className="mono text-[10px]" style={{ color: 'var(--yellow)' }}>
                        triggered {new Date(alert.triggeredAt!).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isTriggered && (
                    <button onClick={() => toggleAlert(alert.id)} className="w-8 h-4 rounded-full relative transition-all"
                      style={{ background: alert.active ? 'var(--green)' : 'var(--bg4)' }}>
                      <span className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                        style={{ background: alert.active ? '#000' : 'var(--text3)', left: alert.active ? '18px' : '2px' }} />
                    </button>
                  )}
                  <button onClick={() => removeAlert(alert.id)} className="mono text-xs px-2 py-1 rounded transition-all"
                    style={{ color: 'var(--text3)', background: 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}>×</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}