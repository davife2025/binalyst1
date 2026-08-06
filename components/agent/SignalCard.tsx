'use client'

/**
 * components/agent/SignalCard.tsx
 * Single token signal card — shows score bar, direction badge, tags, reasoning.
 */

import type { SignalSnapshot, SignalTag } from '@/lib/signalEngine'
const TAG_CONFIG: Record<SignalTag, { label: string; color: string }> = {
  // Sentiment signals
  extreme_fear:    { label: 'Extreme Fear',     color: '#F6465D' },
  extreme_greed:   { label: 'Extreme Greed',    color: '#1abc9c' },
  volume_spike:    { label: 'Vol Spike',        color: '#9b59b6' },
  strong_momentum: { label: 'Strong Momentum',  color: '#3498db' },
  reversal_watch:  { label: 'Reversal Watch',   color: '#f39c12' },
  dca_zone:        { label: 'DCA Zone',         color: '#2ecc71' },
  overbought:      { label: 'Overbought',       color: '#e74c3c' },
  oversold:        { label: 'Oversold',         color: '#27ae60' },
  breakout:        { label: 'Breakout',         color: '#e67e22' },
  trending_cmc:    { label: 'Trending CMC',     color: '#16a085' },

  // Technical indicators
  rsi_oversold:    { label: 'RSI Oversold',     color: '#27ae60' },
  rsi_overbought:  { label: 'RSI Overbought',   color: '#e74c3c' },
  macd_bull_cross: { label: 'MACD Bull Cross',  color: '#2ecc71' },
  macd_bear_cross: { label: 'MACD Bear Cross',  color: '#c0392b' },
  bb_squeeze:      { label: 'BB Squeeze',       color: '#8e44ad' },
  bb_breakout_up:  { label: 'BB Breakout Up',   color: '#27ae60' },
  bb_breakout_down:{ label: 'BB Breakout Down', color: '#c0392b' },
  trending_up:     { label: 'Trending Up',      color: '#1abc9c' },
  trending_down:   { label: 'Trending Down',    color: '#e74c3c' },
  ranging:         { label: 'Ranging',          color: '#95a5a6' },
  near_support:    { label: 'Near Support',     color: '#3498db' },
  near_resistance: { label: 'Near Resistance',  color: '#e67e22' },
}
const DIR_CONFIG = {
  BUY:  { color: 'var(--green)', bg: 'rgba(14,203,129,0.12)',  border: 'rgba(14,203,129,0.3)'  },
  SELL: { color: 'var(--red)',   bg: 'rgba(246,70,93,0.12)',   border: 'rgba(246,70,93,0.3)'   },
  HOLD: { color: 'var(--text2)', bg: 'var(--bg3)',              border: 'var(--border)'          },
}

const CONF_COLOR = {
  HIGH:   'var(--green)',
  MEDIUM: 'var(--yellow)',
  LOW:    'var(--text3)',
}

function fmtPrice(n: number) {
  if (!n) return '—'
  if (n > 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (n > 1)    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return '$' + n.toFixed(6)
}

function fmtChange(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

interface Props {
  signal:    SignalSnapshot
  compact?:  boolean
  selected?: boolean
  onClick?:  () => void
}

export default function SignalCard({ signal, compact = false, selected = false, onClick }: Props) {
  const dir  = DIR_CONFIG[signal.signalDir]
  const score = signal.signalScore

  // Score bar fill color
  const scoreColor =
    score >= 65 ? 'var(--green)' :
    score <= 35 ? 'var(--red)'   : 'var(--yellow)'

  if (compact) {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
        style={{
          background: selected ? 'var(--yellow-glow)' : 'var(--bg2)',
          border: `1px solid ${selected ? 'rgba(240,185,11,0.3)' : 'var(--border)'}`,
        }}
      >
        {/* Direction dot */}
        <span className="w-2 h-2 rounded-full shrink-0"
          style={{ background: dir.color }} />

        {/* Symbol */}
        <span className="mono text-xs font-bold w-12 shrink-0"
          style={{ color: selected ? 'var(--yellow)' : 'var(--text)' }}>
          {signal.symbol}
        </span>

        {/* Score bar */}
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg4)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${score}%`, background: scoreColor }} />
        </div>

        {/* Score number */}
        <span className="mono text-[10px] w-8 text-right shrink-0"
          style={{ color: scoreColor }}>
          {score.toFixed(0)}
        </span>

        {/* Change */}
        <span className="mono text-[10px] w-14 text-right shrink-0"
          style={{ color: signal.change24h >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {fmtChange(signal.change24h)}
        </span>
      </button>
    )
  }

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3 transition-all cursor-pointer"
      style={{
        background: selected ? 'rgba(240,185,11,0.06)' : 'var(--bg2)',
        border: `1px solid ${selected ? 'rgba(240,185,11,0.25)' : 'var(--border)'}`,
      }}
      onClick={onClick}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-extrabold text-sm" style={{ color: 'var(--text)' }}>
            {signal.symbol}
          </div>
          <div className="mono text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
            {fmtPrice(signal.price)}
          </div>
        </div>

        {/* Direction badge */}
        <div className="flex flex-col items-end gap-1">
          <span className="mono text-[10px] font-bold px-2.5 py-1 rounded-full"
            style={{ background: dir.bg, border: `1px solid ${dir.border}`, color: dir.color }}>
            {signal.signalDir}
          </span>
          <span className="mono text-[9px]" style={{ color: CONF_COLOR[signal.confidence] }}>
            {signal.confidence} confidence
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
            Signal Score
          </span>
          <span className="mono text-xs font-bold" style={{ color: scoreColor }}>
            {score.toFixed(0)}/100
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg4)' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${score}%`, background: scoreColor }} />
        </div>
      </div>

      {/* Change grid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: '1h',  v: signal.change1h  },
          { label: '24h', v: signal.change24h },
          { label: '7d',  v: signal.change7d  },
        ].map(({ label, v }) => (
          <div key={label} className="rounded-lg px-2 py-1.5 text-center"
            style={{ background: 'var(--bg3)' }}>
            <div className="mono text-[9px]" style={{ color: 'var(--text3)' }}>{label}</div>
            <div className="mono text-[10px] font-bold"
              style={{ color: v >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {fmtChange(v)}
            </div>
          </div>
        ))}
      </div>

      {/* Tags */}
      {signal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {signal.tags.map(tag => {
            const cfg = TAG_CONFIG[tag]
            return (
              <span key={tag} className="mono text-[9px] px-2 py-0.5 rounded-full"
                style={{ background: cfg.color + '18', color: cfg.color, border: `1px solid ${cfg.color}35` }}>
                {cfg.label}
              </span>
            )
          })}
        </div>
      )}

      {/* Reasoning */}
      <div className="mono text-[10px] leading-snug" style={{ color: 'var(--text3)' }}>
        {signal.reasoning}
      </div>
    </div>
  )
}
