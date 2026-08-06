'use client'
/**
 * components/tabs/LivePricesTab.tsx — Session 9
 *
 * Unified live price feed dashboard — crypto, forex, stocks, meme coins.
 * Replaces the 'live-prices' placeholder in app/page.tsx.
 * Polls /api/livefeed every 15 seconds per active market type.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { LiveQuote } from '@/app/api/livefeed/route'
import {
  FOREX_SYMBOLS, STOCKS_SYMBOLS, MEME_SYMBOLS
} from '@/lib/skills/twelvedata'

const POLL_MS      = 15_000
const MARKET_TYPES = ['crypto', 'forex', 'stocks', 'meme'] as const
type  MarketType   = typeof MARKET_TYPES[number]

const MARKET_META: Record<MarketType, { icon: string; label: string; color: string }> = {
  crypto: { icon: '₿', label: 'Crypto',     color: '#3498db' },
  forex:  { icon: '💱', label: 'Forex',      color: '#9b59b6' },
  stocks: { icon: '📈', label: 'Stocks',     color: '#0ECB81' },
  meme:   { icon: '🐸', label: 'Meme coins', color: '#F6465D' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ChangeCell({ value }: { value: number }) {
  const pos = value >= 0
  return (
    <span className="font-mono text-xs font-bold"
      style={{ color: pos ? 'var(--green)' : 'var(--red)' }}>
      {pos ? '+' : ''}{value.toFixed(2)}%
    </span>
  )
}

function PriceCell({ price, source }: { price: number; source: string }) {
  // Format: forex has 4-5 decimals, crypto/stocks use compact notation
  const fmt = source === 'twelvedata' && price < 100
    ? price.toFixed(4)
    : price >= 1000
      ? price.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : price.toFixed(3)
  return <span className="font-mono text-xs font-bold" style={{ color: 'var(--text)' }}>${fmt}</span>
}

function SourceBadge({ source }: { source: string }) {
  const labels: Record<string, string> = {
    cmc:         'CMC',
    binance:     'BNC',
    twelvedata:  'TD',
    dexscreener: 'DEX',
  }
  return (
    <span className="font-mono text-[8px] px-1.5 py-0.5 rounded"
      style={{ background: 'var(--bg3)', color: 'var(--text3)', border: '1px solid var(--border)' }}>
      {labels[source] ?? source}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function LivePricesTab() {
  const [activeMarket, setActiveMarket] = useState<MarketType>('crypto')
  const [quotes,       setQuotes]       = useState<LiveQuote[]>([])
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [lastUpdate,   setLastUpdate]   = useState<number | null>(null)
  const [countdown,    setCountdown]    = useState(POLL_MS / 1000)
  const [search,       setSearch]       = useState('')

  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastFetchRef = useRef<number>(0)

  const fetchQuotes = useCallback(async (market: MarketType) => {
    setLoading(true); setError('')
    lastFetchRef.current = Date.now()
    try {
      const res = await fetch('/api/livefeed', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ marketType: market }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Feed error')
      setQuotes(data.quotes ?? [])
      setLastUpdate(data.updatedAt)
      setCountdown(POLL_MS / 1000)
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }, [])

  // Start polling when market changes
  useEffect(() => {
    if (pollRef.current)      clearInterval(pollRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    setQuotes([])
    fetchQuotes(activeMarket)
    pollRef.current = setInterval(() => fetchQuotes(activeMarket), POLL_MS)
    countdownRef.current = setInterval(() => {
      const elapsed = (Date.now() - lastFetchRef.current) / 1000
      setCountdown(Math.max(0, Math.round(POLL_MS / 1000 - elapsed)))
    }, 1000)
    return () => {
      if (pollRef.current)      clearInterval(pollRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [activeMarket, fetchQuotes])

  const filtered = quotes.filter(q =>
    !search || q.symbol.toLowerCase().includes(search.toLowerCase())
      || q.name.toLowerCase().includes(search.toLowerCase())
  )

  const meta = MARKET_META[activeMarket]

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Live Prices</h2>
          <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
            {lastUpdate ? `Updated ${new Date(lastUpdate).toLocaleTimeString()} · next in ${countdown}s` : 'Loading…'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="font-mono text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', width: 100 }}
          />
          <button onClick={() => fetchQuotes(activeMarket)} disabled={loading}
            className="font-mono text-[10px] px-3 py-1.5 rounded-full"
            style={{ background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
            {loading ? '…' : '↻'}
          </button>
        </div>
      </div>

      {/* Market type tabs */}
      <div className="flex gap-2 flex-wrap">
        {MARKET_TYPES.map(m => {
          const mt = MARKET_META[m]
          const active = activeMarket === m
          return (
            <button key={m} onClick={() => setActiveMarket(m)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full font-mono text-[11px] font-bold transition-all"
              style={{
                background:  active ? `${mt.color}18` : 'var(--bg2)',
                color:       active ? mt.color : 'var(--text3)',
                border:      `${active ? 2 : 1}px solid ${active ? mt.color : 'var(--border)'}`,
              }}>
              <span>{mt.icon}</span>
              <span>{mt.label}</span>
            </button>
          )
        })}
      </div>

      {error && (
        <div className="rounded-lg px-4 py-2.5 font-mono text-[10px]"
          style={{ background: 'rgba(246,70,93,.07)', border: '1px solid rgba(246,70,93,.2)', color: 'var(--red)' }}>
          {error}
          {(error.includes('TWELVE_DATA') || error.includes('API_KEY')) && (
            <span className="block mt-1" style={{ color: 'var(--text3)' }}>
              Add TWELVE_DATA_API_KEY to .env.local (Session 4 README).
            </span>
          )}
        </div>
      )}

      {/* Quotes table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
        {/* Table header */}
        <div className="grid px-4 py-2.5 font-mono text-[9px] uppercase tracking-widest"
          style={{ gridTemplateColumns: '1fr 100px 90px 80px 60px 40px', borderBottom: '1px solid var(--border)', color: 'var(--text3)' }}>
          <span>Asset</span>
          <span className="text-right">Price</span>
          <span className="text-right">24h %</span>
          <span className="text-right">Volume 24h</span>
          <span className="text-right">Market cap</span>
          <span className="text-right">Src</span>
        </div>

        {loading && !filtered.length && (
          <div className="px-4 py-8 text-center font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
            Loading {meta.label} prices…
          </div>
        )}

        {!loading && !filtered.length && !error && (
          <div className="px-4 py-8 text-center font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
            No data{search ? ` matching "${search}"` : ''}
          </div>
        )}

        {filtered.map((q, i) => (
          <div key={q.symbol}
            className="grid items-center px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
            style={{
              gridTemplateColumns: '1fr 100px 90px 80px 60px 40px',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
            {/* Name */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-[10px]"
                style={{ background: `${meta.color}18`, color: meta.color }}>
                {q.symbol.slice(0, 2)}
              </div>
              <div className="min-w-0">
                <div className="font-mono text-xs font-bold truncate" style={{ color: 'var(--text)' }}>{q.symbol}</div>
                <div className="font-mono text-[9px] truncate" style={{ color: 'var(--text3)' }}>{q.name}</div>
              </div>
            </div>

            {/* Price */}
            <div className="text-right">
              <PriceCell price={q.price} source={q.source} />
            </div>

            {/* 24h change */}
            <div className="text-right">
              <ChangeCell value={q.change24h} />
            </div>

            {/* Volume */}
            <div className="text-right font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
              {q.volume24h >= 1_000_000
                ? `$${(q.volume24h / 1_000_000).toFixed(1)}M`
                : q.volume24h >= 1_000
                  ? `$${(q.volume24h / 1_000).toFixed(0)}K`
                  : `$${q.volume24h.toFixed(0)}`}
            </div>

            {/* Market cap */}
            <div className="text-right font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
              {q.marketCap && q.marketCap >= 1_000_000_000
                ? `$${(q.marketCap / 1_000_000_000).toFixed(1)}B`
                : q.marketCap && q.marketCap >= 1_000_000
                  ? `$${(q.marketCap / 1_000_000).toFixed(0)}M`
                  : '—'}
            </div>

            {/* Source */}
            <div className="text-right">
              <SourceBadge source={q.source} />
            </div>
          </div>
        ))}
      </div>

      {/* Data source legend */}
      <div className="flex gap-4 flex-wrap font-mono text-[9px]" style={{ color: 'var(--text3)' }}>
        <span><strong style={{ color: 'var(--text2)' }}>CMC</strong> CoinMarketCap</span>
        <span><strong style={{ color: 'var(--text2)' }}>TD</strong> Twelve Data</span>
        <span><strong style={{ color: 'var(--text2)' }}>DEX</strong> DexScreener</span>
        <span>· Refreshes every 15s</span>
      </div>
    </div>
  )
}
