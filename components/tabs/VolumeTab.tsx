'use client'
/**
 * components/tabs/VolumeTab.tsx — Session 8
 *
 * Cross-chain, cross-market volume dashboard.
 * Replaces the 'volume' placeholder in app/page.tsx.
 * Reads from Supabase trades table via /api/volume.
 */

import { useState, useEffect, useCallback } from 'react'
import type { VolumeStats }                 from '@/lib/supabase/trades'
import type { TradeRow }                    from '@/lib/supabase/trades'

// ─────────────────────────────────────────────────────────────────────────────
// Colour helpers
// ─────────────────────────────────────────────────────────────────────────────

const CHAIN_COLORS: Record<string, string> = {
  'goat-mainnet':  '#F0B90B',
  'goat-testnet':  '#F0B90B88',
  'bsc-mainnet':   '#0ECB81',
  'bsc-testnet':   '#0ECB8188',
}

const MARKET_COLORS: Record<string, string> = {
  crypto:  '#3498db',
  forex:   '#9b59b6',
  stocks:  '#0ECB81',
  meme:    '#F6465D',
}

function colorFor(key: string, map: Record<string, string>): string {
  return map[key] ?? 'var(--text3)'
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'var(--text)' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>{label}</div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="font-mono text-[10px] mt-1" style={{ color: 'var(--text3)' }}>{sub}</div>}
    </div>
  )
}

function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.max(2, (value / total) * 100) : 2
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="font-mono text-[10px] w-28 shrink-0" style={{ color: 'var(--text2)' }}>{label}</div>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg3)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="font-mono text-[10px] w-20 text-right" style={{ color: 'var(--text)' }}>
        ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
    </div>
  )
}

function MiniChart({ daily }: { daily: Array<{ date: string; usd: number }> }) {
  if (!daily.length) return null
  const max = Math.max(...daily.map(d => d.usd), 1)
  const W = 600, H = 80, pad = 4
  const pts = daily.map((d, i) => {
    const x = pad + (i / (daily.length - 1 || 1)) * (W - pad * 2)
    const y = H - pad - (d.usd / max) * (H - pad * 2)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }}>
      <polyline points={pts} fill="none" stroke="var(--yellow)" strokeWidth="1.5" opacity="0.8" />
      <polyline
        points={`${pad},${H} ${pts} ${W - pad},${H}`}
        fill="var(--yellow)" opacity="0.08"
      />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function VolumeTab() {
  const [stats,    setStats]    = useState<VolumeStats | null>(null)
  const [trades,   setTrades]   = useState<TradeRow[]>([])
  const [daily,    setDaily]    = useState<Array<{ date: string; usd: number; count: number }>>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [days,     setDays]     = useState(30)
  const [filter,   setFilter]   = useState<{ chain?: string; market?: string }>({})

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [statsRes, tradesRes, dailyRes] = await Promise.all([
        fetch('/api/volume', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stats', days }) }),
        fetch('/api/volume', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'recent', limit: 20, chain: filter.chain, marketType: filter.market }) }),
        fetch('/api/volume', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'daily', days }) }),
      ])

      if (statsRes.ok) {
        const d = await statsRes.json()
        if (d.success) setStats(d.stats)
        else setError(d.error ?? 'Failed to load stats')
      }
      if (tradesRes.ok) {
        const d = await tradesRes.json()
        if (d.success) setTrades(d.trades)
      }
      if (dailyRes.ok) {
        const d = await dailyRes.json()
        if (d.success) setDaily(d.daily)
      }
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }, [days, filter])

  useEffect(() => { load() }, [load])

  const noData = !loading && !stats

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Volume Dashboard</h2>
          <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
            Cross-chain · cross-market · persisted to Supabase
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className="font-mono text-[10px] px-3 py-1.5 rounded-full"
              style={{
                background: days === d ? 'var(--yellow)' : 'var(--bg2)',
                color:      days === d ? '#000' : 'var(--text2)',
                border:     '1px solid var(--border)',
              }}>
              {d}d
            </button>
          ))}
          <button onClick={load} disabled={loading}
            className="font-mono text-[10px] px-3 py-1.5 rounded-full"
            style={{ background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
            {loading ? '…' : '↻'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-2.5 font-mono text-[10px]"
          style={{ background: 'rgba(246,70,93,.07)', border: '1px solid rgba(246,70,93,.2)', color: 'var(--red)' }}>
          {error}
          {error.includes('authenticated') && (
            <span className="block mt-1" style={{ color: 'var(--text3)' }}>
              Sign in to view your volume data (Settings → Account).
            </span>
          )}
        </div>
      )}

      {noData && !error && (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <div className="text-3xl mb-2">📊</div>
          <div className="font-mono text-xs mb-1" style={{ color: 'var(--text)' }}>No trades recorded yet</div>
          <div className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
            Start the agent (Live Agent tab) and execute a trade to see volume here.
            Requires Supabase credentials in .env.local and the trades migration applied.
          </div>
        </div>
      )}

      {stats && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total volume"  value={`$${stats.total_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`last ${days} days`} color="var(--yellow)" />
            <StatCard label="Total trades"  value={stats.trade_count.toString()} sub={`${stats.confirmed} confirmed · ${stats.simulated} simulated`} />
            <StatCard label="Total PnL"     value={`${stats.pnl_usd >= 0 ? '+' : ''}$${stats.pnl_usd.toFixed(2)}`} color={stats.pnl_usd >= 0 ? 'var(--green)' : 'var(--red)'} />
          </div>

          {/* Chart */}
          {daily.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="font-mono text-[9px] uppercase tracking-widest mb-3" style={{ color: 'var(--text3)' }}>
                Daily volume ({days}d)
              </div>
              <MiniChart daily={daily} />
              <div className="flex justify-between font-mono text-[9px] mt-1" style={{ color: 'var(--text3)' }}>
                <span>{daily[0]?.date}</span>
                <span>{daily[daily.length - 1]?.date}</span>
              </div>
            </div>
          )}

          {/* By chain */}
          {Object.keys(stats.by_chain).length > 0 && (
            <div className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="font-mono text-[9px] uppercase tracking-widest mb-3" style={{ color: 'var(--text3)' }}>By chain</div>
              {Object.entries(stats.by_chain)
                .sort(([,a],[,b]) => b - a)
                .map(([chain, usd]) => (
                  <BarRow key={chain} label={chain} value={usd} total={stats.total_usd} color={colorFor(chain, CHAIN_COLORS)} />
                ))}
            </div>
          )}

          {/* By market type */}
          {Object.keys(stats.by_market_type).length > 0 && (
            <div className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="font-mono text-[9px] uppercase tracking-widest mb-3" style={{ color: 'var(--text3)' }}>By market type</div>
              {Object.entries(stats.by_market_type)
                .sort(([,a],[,b]) => b - a)
                .map(([market, usd]) => (
                  <BarRow key={market} label={market} value={usd} total={stats.total_usd} color={colorFor(market, MARKET_COLORS)} />
                ))}
            </div>
          )}
        </>
      )}

      {/* Recent trades */}
      {trades.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="font-mono text-[10px] font-bold" style={{ color: 'var(--text)' }}>Recent trades</span>
            <div className="flex gap-2">
              {/* Chain filter */}
              <select value={filter.chain ?? ''} onChange={e => setFilter(f => ({ ...f, chain: e.target.value || undefined }))}
                className="font-mono text-[9px] px-2 py-1 rounded"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
                <option value="">All chains</option>
                <option value="goat-mainnet">GOAT Mainnet</option>
                <option value="goat-testnet">GOAT Testnet</option>
                <option value="bsc-mainnet">BSC Mainnet</option>
              </select>
              {/* Market filter */}
              <select value={filter.market ?? ''} onChange={e => setFilter(f => ({ ...f, market: e.target.value || undefined }))}
                className="font-mono text-[9px] px-2 py-1 rounded"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
                <option value="">All markets</option>
                <option value="crypto">Crypto</option>
                <option value="forex">Forex</option>
                <option value="stocks">Stocks</option>
                <option value="meme">Meme</option>
              </select>
            </div>
          </div>
          {trades.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-2 px-4 py-2.5 font-mono text-[10px]"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text3)', width: 72 }}>{(t.executed_at ?? '').slice(5, 16).replace('T', ' ')}</span>
              <span className="font-bold w-20" style={{ color: 'var(--text)' }}>{t.symbol}</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                style={{
                  background: t.side.toLowerCase() === 'buy' ? 'rgba(14,203,129,.12)' : 'rgba(246,70,93,.12)',
                  color:      t.side.toLowerCase() === 'buy' ? 'var(--green)'         : 'var(--red)',
                }}>
                {t.side.toUpperCase()}
              </span>
              <span style={{ color: 'var(--text2)' }}>${Number(t.amount_usd).toFixed(2)}</span>
              <span style={{ color: colorFor(t.chain, CHAIN_COLORS), width: 72 }}>{t.chain.replace('goat-', 'GOAT ').replace('bsc-', 'BSC ')}</span>
              <span style={{ color: colorFor(t.market_type, MARKET_COLORS) }}>{t.market_type}</span>
              <span style={{
                color: t.status === 'confirmed' ? 'var(--green)' : t.status === 'simulated' ? 'var(--yellow)' : 'var(--text3)',
              }}>{t.status}</span>
              {t.tx_hash && (
                <span style={{ color: 'var(--text3)' }}>{t.tx_hash.slice(0, 8)}…</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}