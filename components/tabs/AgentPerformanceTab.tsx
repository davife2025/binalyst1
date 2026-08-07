'use client'

/**
 * components/tabs/AgentPerformanceTab.tsx
 * Session G: Live agent portfolio, PnL chart, and price alert manager.
 * Replaces the placeholder PortfolioTab for agent-connected users.
 *
 * Fixed:
 * - Alert interval no longer resets on every state change (race condition eliminated)
 * - alertsRef keeps the interval stable; state updates via setAlerts still work normally
 * - Notification.requestPermission() called on mount so browser alerts actually fire
 * - Alert API errors are now logged (empty catch replaced)
 */

import { useState, useEffect, useRef } from 'react'
import { useAgentStore }               from '@/lib/agentStore'
import { usePortfolio }                from '@/hooks/usePortfolio'
import PnLChart, { PnLSparkline }      from '@/components/agent/PnLChart'
import PortfolioBreakdown              from '@/components/agent/PortfolioBreakdown'
import { DrawdownBar }                 from '@/components/agent/DrawdownGauge'


interface PriceAlert {
  id:        string
  symbol:    string
  condition: 'above' | 'below'
  target:    number
  note:      string
  active:    boolean
  createdAt: number
  triggered?: boolean
}

const ALERT_STORAGE_KEY = 'binalyst_agent_alerts'

function loadAlerts(): PriceAlert[] {
  try { return JSON.parse(localStorage.getItem(ALERT_STORAGE_KEY) || '[]') } catch { return [] }
}
function saveAlerts(a: PriceAlert[]) { localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(a)) }

function fmtUSD(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function AgentPerformanceTab() {
  const { isWalletLoaded, session }  = useAgentStore()
  const network = (useAgentStore() as any).network ?? 'testnet'
  const { snapshot, history, loading, error, pnlPct, drawdownPct, refresh } = usePortfolio()

  const [view,         setView]         = useState<'portfolio' | 'pnl' | 'alerts'>('portfolio')
  const [alerts,       setAlerts]       = useState<PriceAlert[]>([])
  const [alertSymbol,  setAlertSymbol]  = useState('ETH')
  const [alertCond,    setAlertCond]    = useState<'above' | 'below'>('above')
  const [alertTarget,  setAlertTarget]  = useState('')
  const [alertNote,    setAlertNote]    = useState('')
  const [checking,     setChecking]     = useState(false)
  const [triggered,    setTriggered]    = useState<PriceAlert[]>([])

  // FIX: Keep a ref to current alerts so the polling interval never needs to
  // restart when alerts state changes. Without this, the interval was cleared
  // and re-created on every add/remove/toggle, causing double-fire race conditions.
  const alertsRef = useRef<PriceAlert[]>([])

  // Sync ref whenever state changes
  useEffect(() => {
    alertsRef.current = alerts
  }, [alerts])

  // On mount: load persisted alerts and request notification permission
  useEffect(() => {
    setAlerts(loadAlerts())

    // FIX: We must call requestPermission() before we can show notifications.
    // The original code only checked Notification.permission === 'granted' but
    // never prompted the user, so browser alerts silently never fired.
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {
        // Permission denied or browser doesn't support it — fail silently
      })
    }
  }, [])

  // FIX: Poll alerts every 60s using a stable interval that runs for the
  // lifetime of the component. alertsRef always reflects current state so we
  // never need to tear down the interval when alerts change.
  useEffect(() => {
    async function checkAlerts() {
      const active = alertsRef.current.filter(a => a.active)
      if (!active.length) return

      setChecking(true)
      try {
        const params = encodeURIComponent(JSON.stringify(
          active.map(({ id, symbol, condition, target }) => ({ id, symbol, condition, target }))
        ))
        const res = await fetch(`/api/agent/alert?alerts=${params}`)

        // FIX: Surface non-200 responses rather than silently swallowing them
        if (!res.ok) throw new Error(`Alert API returned ${res.status} ${res.statusText}`)

        const data = await res.json()
        if (data.success && data.triggered?.length > 0) {
          const ids = new Set(data.triggered.map((t: any) => t.id))
          setTriggered(data.triggered)

          // Mark triggered alerts in state + persist
          setAlerts(prev => {
            const updated = prev.map(a => ids.has(a.id) ? { ...a, triggered: true } : a)
            saveAlerts(updated)
            return updated
          })

          // Browser notifications (permission already requested on mount)
          if (Notification.permission === 'granted') {
            data.triggered.forEach((t: any) => {
              new Notification(`🔔 Binalyst Alert: ${t.symbol}`, {
                body: `${t.symbol} is ${t.condition} $${t.target} — now $${t.currentPrice?.toFixed(4)}`,
              })
            })
          }
        }
      } catch (err) {
        // FIX: Log errors instead of swallowing them
        console.error('[AgentPerformanceTab] Alert check failed:', err)
      }
      setChecking(false)
    }

    // Run immediately on mount, then every 60s
    checkAlerts()
    const t = setInterval(checkAlerts, 60_000)
    return () => clearInterval(t)
  }, []) // Empty deps — interval is stable; alertsRef provides live data

  function addAlert() {
    if (!alertSymbol || !alertTarget) return
    const alert: PriceAlert = {
      id:        crypto.randomUUID(),
      symbol:    alertSymbol.toUpperCase(),
      condition: alertCond,
      target:    parseFloat(alertTarget),
      note:      alertNote,
      active:    true,
      createdAt: Date.now(),
    }
    const updated = [alert, ...alerts]
    setAlerts(updated)
    saveAlerts(updated)
    setAlertTarget(''); setAlertNote('')
  }

  function removeAlert(id: string) {
    const updated = alerts.filter(a => a.id !== id)
    setAlerts(updated); saveAlerts(updated)
  }

  function toggleAlert(id: string) {
    const updated = alerts.map(a => a.id === id ? { ...a, active: !a.active } : a)
    setAlerts(updated); saveAlerts(updated)
  }

  const pnlColor = pnlPct >= 0 ? 'var(--green)' : 'var(--red)'

  if (!isWalletLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="text-4xl opacity-30">◑</div>
        <div>
          <div className="font-bold mb-1" style={{ color: 'var(--text)' }}>No agent wallet connected</div>
          <div className="mono text-xs" style={{ color: 'var(--text3)' }}>
            Set up your wallet in the Agent Wallet tab to see live portfolio data.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: quick stats ─────────────────────────────────────────────── */}
      <div className="w-56 shrink-0 flex flex-col border-r overflow-y-auto"
        style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}>

        <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="mono text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--text3)' }}>
            Agent Portfolio
          </div>

          {/* Total value */}
          <div className="mb-3">
            <div className="mono text-[10px]" style={{ color: 'var(--text3)' }}>Total Value</div>
            <div className="mono text-xl font-extrabold" style={{ color: 'var(--text)' }}>
              {snapshot ? fmtUSD(snapshot.totalUSD) : '—'}
            </div>
          </div>

          {/* PnL */}
          <div className="mb-3">
            <div className="mono text-[10px]" style={{ color: 'var(--text3)' }}>Total Return</div>
            <div className="mono text-lg font-extrabold" style={{ color: pnlColor }}>
              {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
            </div>
            {history.length > 1 && <PnLSparkline history={history} />}
          </div>

          {/* Drawdown */}
          <div className="mb-3">
            <div className="mono text-[10px] mb-1" style={{ color: 'var(--text3)' }}>Drawdown</div>
            <DrawdownBar drawdownPct={drawdownPct} />
          </div>

          {/* Refresh */}
          <button onClick={refresh} disabled={loading}
            className="w-full mono text-[10px] py-1.5 rounded-lg transition-all"
            style={{
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              color: loading ? 'var(--text3)' : 'var(--text2)',
            }}>
            {loading ? '↻ Loading...' : '↻ Refresh'}
          </button>
        </div>

        {/* Holdings list */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>
            Holdings
          </div>
          {snapshot?.items.length ? snapshot.items.map((item) => (
            <div key={item.symbol} className="flex items-center justify-between py-1.5 border-b"
              style={{ borderColor: 'var(--border)' }}>
              <span className="mono text-xs font-bold" style={{ color: 'var(--text)' }}>{item.symbol}</span>
              <div className="text-right">
                <div className="mono text-xs" style={{ color: 'var(--text2)' }}>
                  {fmtUSD(item.valueUSD)}
                </div>
                <div className="mono text-[9px]" style={{ color: 'var(--text3)' }}>
                  {item.pct.toFixed(1)}%
                </div>
              </div>
            </div>
          )) : (
            <div className="mono text-[10px]" style={{ color: 'var(--text3)' }}>
              No holdings detected
            </div>
          )}
        </div>
      </div>

      {/* ── Main panel ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

        {/* Tab strip */}
        <div className="flex gap-1 px-6 pt-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          {([
            { id: 'portfolio', label: ' Portfolio' },
            { id: 'pnl',       label: ' PnL Chart' },
            { id: 'alerts',    label: ` Alerts (${alerts.filter(a => a.active).length})` },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setView(tab.id)}
              className="mono text-xs px-4 py-2 rounded-t-lg transition-all"
              style={{
                background:   view === tab.id ? 'var(--bg2)' : 'transparent',
                color:        view === tab.id ? 'var(--yellow)' : 'var(--text3)',
                borderBottom: view === tab.id ? '2px solid var(--yellow)' : '2px solid transparent',
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Portfolio view ─────────────────────────────────────────────── */}
        {view === 'portfolio' && (
          <div className="px-6 py-5">
            {error && (
              <div className="mono text-xs p-3 rounded-lg mb-4"
                style={{ background: 'rgba(246,70,93,0.08)', border: '1px solid rgba(246,70,93,0.25)', color: 'var(--red)' }}>
                {error}
              </div>
            )}
            {snapshot ? (
              <PortfolioBreakdown
                items={snapshot.items}
                totalUSD={snapshot.totalUSD}
                network={network}
              />
            ) : loading ? (
              <div className="flex items-center justify-center py-16">
                <span className="w-6 h-6 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin-slow" />
              </div>
            ) : (
              <div className="mono text-xs text-center py-16" style={{ color: 'var(--text3)' }}>
                Click refresh to load portfolio
              </div>
            )}
          </div>
        )}

        {/* ── PnL view ──────────────────────────────────────────────────── */}
        {view === 'pnl' && (
          <div className="px-6 py-5 flex flex-col gap-5">
            <div className="rounded-xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="mono text-[10px] uppercase tracking-widest mb-4" style={{ color: 'var(--text3)' }}>
                Hourly PnL — Agent Session ({history.length} data points)
              </div>
              <PnLChart
                history={history}
                startUSD={session?.startValueUSDT ?? 0}
                currentUSD={snapshot?.totalUSD ?? 0}
                peakUSD={session?.peakValueUSDT ?? 0}
                width={560} height={140}
              />
            </div>

            {/* Agent stats */}
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              {[
                { label: 'Max Drawdown Cap', value: '15%',  color: 'var(--red)'    },  // from RiskProfile
                { label: 'Market Type',      value: 'Crypto', color: 'var(--yellow)' },
                { label: 'Network',          value: 'GOAT',   color: 'var(--yellow)' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-xl p-4"
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                  <div className="mono text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>
                    {label}
                  </div>
                  <div className="mono text-xl font-extrabold" style={{ color }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Alerts view ───────────────────────────────────────────────── */}
        {view === 'alerts' && (
          <div className="px-6 py-5 flex flex-col gap-4">

            {/* Checking indicator */}
            {checking && (
              <div className="mono text-[10px] flex items-center gap-2" style={{ color: 'var(--text3)' }}>
                <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin-slow" />
                Checking prices...
              </div>
            )}

            {/* Triggered banner */}
            {triggered.length > 0 && (
              <div className="rounded-xl p-4"
                style={{ background: 'rgba(240,185,11,0.08)', border: '1px solid rgba(240,185,11,0.3)' }}>
                <div className="mono text-xs font-bold mb-2" style={{ color: 'var(--yellow)' }}>
                  🔔 {triggered.length} alert{triggered.length > 1 ? 's' : ''} triggered!
                </div>
                {triggered.map((t: any) => (
                  <div key={t.id} className="mono text-[10px]" style={{ color: 'var(--text2)' }}>
                    {t.symbol} {t.condition} ${t.target} — now ${t.currentPrice?.toFixed(4)}
                  </div>
                ))}
              </div>
            )}

            {/* Notification permission banner */}
            {'Notification' in window && Notification.permission === 'denied' && (
              <div className="rounded-xl p-3"
                style={{ background: 'rgba(246,70,93,0.06)', border: '1px solid rgba(246,70,93,0.2)' }}>
                <div className="mono text-[10px]" style={{ color: 'var(--red)' }}>
                  ⚠ Browser notifications blocked — enable them in your browser settings to receive alert popups
                </div>
              </div>
            )}

            {/* New alert form */}
            <div className="rounded-xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="mono text-[10px] uppercase tracking-widest mb-4" style={{ color: 'var(--text3)' }}>
                New Price Alert
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="flex flex-col gap-1">
                  <label className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Symbol</label>
                  <input value={alertSymbol} onChange={e => setAlertSymbol(e.target.value.toUpperCase())}
                    placeholder="ETH"
                    className="mono text-sm px-3 py-2 rounded-lg outline-none"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}
                    onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Condition</label>
                  <select value={alertCond} onChange={e => setAlertCond(e.target.value as 'above' | 'below')}
                    className="mono text-xs px-3 py-2 rounded-lg outline-none"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}>
                    <option value="above">Price above</option>
                    <option value="below">Price below</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Target ($)</label>
                  <input type="number" value={alertTarget} onChange={e => setAlertTarget(e.target.value)}
                    placeholder="3500"
                    className="mono text-sm px-3 py-2 rounded-lg outline-none"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}
                    onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
                </div>
              </div>
              <div className="flex gap-3 mt-3">
                <input value={alertNote} onChange={e => setAlertNote(e.target.value)}
                  placeholder="Optional note..."
                  className="flex-1 mono text-sm px-3 py-2 rounded-lg outline-none"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
                <button onClick={addAlert} disabled={!alertSymbol || !alertTarget}
                  className="px-4 py-2 rounded-lg mono text-xs font-bold transition-all"
                  style={{
                    background: alertSymbol && alertTarget ? 'var(--yellow)' : 'var(--bg4)',
                    color:      alertSymbol && alertTarget ? '#000' : 'var(--text3)',
                  }}>
                  + Add Alert
                </button>
              </div>
            </div>

            {/* Alerts list */}
            {alerts.length === 0 ? (
              <div className="mono text-xs text-center py-8" style={{ color: 'var(--text3)' }}>
                No alerts set
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {alerts.map(alert => (
                  <div key={alert.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{
                      background: alert.triggered ? 'rgba(240,185,11,0.06)' : 'var(--bg2)',
                      border: `1px solid ${alert.triggered ? 'rgba(240,185,11,0.3)' : 'var(--border)'}`,
                      opacity: alert.active ? 1 : 0.5,
                    }}>
                    <span className="text-lg shrink-0">{alert.triggered ? '🔔' : '○'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="mono text-xs font-bold" style={{ color: 'var(--text)' }}>
                          {alert.symbol}
                        </span>
                        <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>
                          {alert.condition} ${alert.target.toLocaleString()}
                        </span>
                        {alert.note && (
                          <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>
                            · {alert.note}
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => toggleAlert(alert.id)}
                      className="w-8 h-4 rounded-full relative shrink-0 transition-all"
                      style={{ background: alert.active ? 'var(--green)' : 'var(--bg4)' }}>
                      <span className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                        style={{ background: alert.active ? '#000' : 'var(--text3)', left: alert.active ? '18px' : '2px' }} />
                    </button>
                    <button onClick={() => removeAlert(alert.id)}
                      className="mono text-sm px-2 rounded"
                      style={{ color: 'var(--text3)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}