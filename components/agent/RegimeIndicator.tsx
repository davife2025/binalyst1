'use client'

/**
 * components/agent/RegimeIndicator.tsx
 * Session M — Live market regime indicator widget.
 *
 * Shows:
 *   - Regime pill: TRENDING UP / TRENDING DOWN / RANGING / FLAT
 *   - Confidence bar (0-100%)
 *   - ADX reading
 *   - Active mode label: Trend Following / Mean Reversion / Flat
 *   - Key indicator row: RSI · MACD · BB%B · EMA Cross
 *
 * Props:
 *   symbol    — e.g. 'BTC' (default)
 *   interval  — e.g. '1h' (default)
 *   compact   — renders a smaller inline version for embedding in headers
 */

import { useEffect, useState } from 'react'
import type { TechnicalSnapshot, MarketRegime } from '@/lib/skills/bitget-technicals'
import { regimeLabel, regimeColor, regimeBg, modeLabel } from '@/lib/adaptiveStrategy'
import type { RegimeDecision } from '@/lib/adaptiveStrategy'
import { AdaptiveStrategy } from '@/lib/adaptiveStrategy'

const strategy = new AdaptiveStrategy()

interface Props {
  symbol?:   string
  interval?: string
  compact?:  boolean
}

export default function RegimeIndicator({ symbol = 'BTC', interval = '1h', compact = false }: Props) {
  const [snap,     setSnap]     = useState<TechnicalSnapshot | null>(null)
  const [decision, setDecision] = useState<RegimeDecision | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(false)
      try {
        const res  = await fetch(`/api/technicals?symbol=${symbol}&interval=${interval}`)
        const data = await res.json()
        if (cancelled) return
        if (data.snapshot) {
          setSnap(data.snapshot)
          setDecision(strategy.getDecision(data.snapshot))
        } else {
          setError(true)
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 120_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [symbol, interval])

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
        <span className="w-3 h-3 rounded-full border-2 border-yellow-400/30 border-t-yellow-400 animate-spin-slow" />
        <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>
          Loading {symbol} regime…
        </span>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !snap || !decision) {
    return (
      <div className="px-3 py-2 rounded-xl mono text-[10px]"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
        Regime data unavailable
      </div>
    )
  }

  const rColor = regimeColor(decision.regime)
  const rBg    = regimeBg(decision.regime)

  // ── Compact mode — single pill row ───────────────────────────────────────
  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{ background: rBg, border: `1px solid ${rColor}40` }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: rColor }} />
          <span className="mono text-[10px] font-bold" style={{ color: rColor }}>
            {regimeLabel(decision.regime)}
          </span>
          <span className="mono text-[9px]" style={{ color: rColor, opacity: 0.8 }}>
            {decision.regimeConf.toFixed(0)}%
          </span>
        </div>
        <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>
          ADX {decision.adx.toFixed(0)} · RSI {snap.momentum.rsi14.toFixed(0)}
        </span>
        <span className="mono text-[10px]" style={{ color: 'var(--yellow)' }}>
          {modeLabel(decision.mode)}
        </span>
      </div>
    )
  }

  // ── Full mode ─────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl flex flex-col gap-3 p-4"
      style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>

      {/* Title row */}
      <div className="flex items-center justify-between">
        <span className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
          {symbol} Market Regime · {interval}
        </span>
        <span className="mono text-[9px]" style={{ color: 'var(--text3)' }}>
          {new Date(snap.updatedAt).toLocaleTimeString()}
        </span>
      </div>

      {/* Regime pill + mode */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{ background: rBg, border: `1px solid ${rColor}40` }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: rColor }} />
          <span className="mono text-sm font-extrabold" style={{ color: rColor }}>
            {regimeLabel(decision.regime)}
          </span>
        </div>
        <div className="mono text-[10px] px-2 py-1 rounded-lg"
          style={{ background: 'var(--bg3)', color: 'var(--yellow)' }}>
          {modeLabel(decision.mode)}
        </div>
        <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>
          ADX {decision.adx.toFixed(0)}
        </span>
      </div>

      {/* Confidence bar */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between">
          <span className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
            Regime Confidence
          </span>
          <span className="mono text-[10px] font-bold" style={{ color: rColor }}>
            {decision.regimeConf.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg4)' }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${decision.regimeConf}%`, background: rColor }} />
        </div>
      </div>

      {/* 4-indicator row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          {
            label: 'RSI 14',
            value: snap.momentum.rsi14.toFixed(0),
            sub:   snap.momentum.rsi14 < 30 ? 'Oversold'
                 : snap.momentum.rsi14 > 70 ? 'Overbought' : 'Neutral',
            color: snap.momentum.rsi14 < 30 ? 'var(--green)'
                 : snap.momentum.rsi14 > 70 ? 'var(--red)' : 'var(--text)',
          },
          {
            label: 'MACD',
            value: snap.momentum.macdCross !== 'NONE'
              ? `${snap.momentum.macdCross.slice(0, 4)}`
              : snap.momentum.macdHist > 0 ? 'Pos' : 'Neg',
            sub:   snap.momentum.macdHist > 0 ? 'Bullish' : 'Bearish',
            color: snap.momentum.macdHist > 0 ? 'var(--green)' : 'var(--red)',
          },
          {
            label: 'BB %B',
            value: `${(snap.volatility.bbPct * 100).toFixed(0)}%`,
            sub:   snap.volatility.bbPct > 0.8 ? 'Upper zone'
                 : snap.volatility.bbPct < 0.2 ? 'Lower zone' : 'Mid zone',
            color: snap.volatility.bbPct > 0.8 ? 'var(--red)'
                 : snap.volatility.bbPct < 0.2 ? 'var(--green)' : 'var(--text)',
          },
          {
            label: 'EMA Cross',
            value: snap.trend.emaCross === 'BULLISH' ? '↑ Bull'
                 : snap.trend.emaCross === 'BEARISH' ? '↓ Bear' : '→ Mixed',
            sub:   `E20 ${snap.trend.ema20 > 0 ? snap.trend.ema20.toFixed(0) : '—'}`,
            color: snap.trend.emaCross === 'BULLISH' ? 'var(--green)'
                 : snap.trend.emaCross === 'BEARISH' ? 'var(--red)' : 'var(--text3)',
          },
        ].map(item => (
          <div key={item.label} className="rounded-lg p-2 text-center"
            style={{ background: 'var(--bg3)' }}>
            <div className="mono text-[8px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--text3)' }}>
              {item.label}
            </div>
            <div className="mono text-sm font-bold leading-none" style={{ color: item.color }}>
              {item.value}
            </div>
            <div className="mono text-[8px] mt-0.5" style={{ color: 'var(--text3)' }}>
              {item.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Active rules */}
      <div className="mono text-[9px] px-2 py-1.5 rounded-lg"
        style={{ background: 'rgba(240,185,11,0.06)', border: '1px solid rgba(240,185,11,0.12)', color: 'var(--text3)' }}>
        ⚡ {decision.rules.length} adaptive rules active · {decision.reasoning.slice(0, 80)}…
      </div>
    </div>
  )
}
