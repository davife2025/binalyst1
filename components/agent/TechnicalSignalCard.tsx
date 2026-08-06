'use client'

/**
 * components/agent/TechnicalSignalCard.tsx
 * Session M — Technical indicator card for a single symbol.
 *
 * Displays:
 *   - RSI semicircle gauge (pure SVG)
 *   - MACD histogram bars (pure SVG)
 *   - Bollinger Band %B position bar
 *   - Tech score badge
 *   - OBV trend arrow + stochastic reading
 *   - Key signal pills from TechnicalSummary.signals
 *
 * Used in AgentTab (BTC) and SignalDashboard (any symbol detail panel).
 *
 * Props:
 *   snapshot — TechnicalSnapshot from /api/technicals
 *   minimal  — single-row compact variant for the signal list
 */

import type { TechnicalSnapshot } from '@/lib/skills/bitget-technicals'

interface Props {
  snapshot: TechnicalSnapshot
  minimal?: boolean
}

// ── RSI semicircle gauge ────────────────────────────────────────────────────
function RsiGauge({ value }: { value: number }) {
  // 180° arc: 0 at left, 100 at right, 50 at top
  const clamped  = Math.max(0, Math.min(100, value))
  const angle    = (clamped / 100) * 180 - 90  // -90=left, 0=top, 90=right
  const rad      = (angle * Math.PI) / 180
  const r        = 36
  const cx = 44, cy = 44
  const nx = cx + r * Math.sin(rad)
  const ny = cy - r * Math.cos(rad)

  const color = value < 30 ? '#0ECB81' : value > 70 ? '#F6465D' : '#F0B90B'

  // Arc path: left semicircle
  const arcD = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`

  return (
    <svg width="88" height="50" viewBox="0 0 88 50">
      {/* Track */}
      <path d={arcD} fill="none" stroke="var(--bg4)" strokeWidth="6" strokeLinecap="round" />
      {/* Zones */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx - r * 0.866} ${cy - r * 0.5}`}
        fill="none" stroke="rgba(14,203,129,0.25)" strokeWidth="6" strokeLinecap="round" />
      <path d={`M ${cx + r * 0.866} ${cy - r * 0.5} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="rgba(246,70,93,0.25)" strokeWidth="6" strokeLinecap="round" />
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="3" fill={color} />
      {/* Value */}
      <text x={cx} y={cy + 14} textAnchor="middle"
        style={{ fontSize: 13, fontWeight: 700, fill: color, fontFamily: 'monospace' }}>
        {value.toFixed(0)}
      </text>
      {/* Labels */}
      <text x={cx - r - 2} y={cy + 10} textAnchor="end"
        style={{ fontSize: 7, fill: 'var(--text3)', fontFamily: 'monospace' }}>0</text>
      <text x={cx + r + 2} y={cy + 10}
        style={{ fontSize: 7, fill: 'var(--text3)', fontFamily: 'monospace' }}>100</text>
    </svg>
  )
}

// ── MACD micro histogram ────────────────────────────────────────────────────
function MacdBar({ hist, cross }: { hist: number; cross: 'BULLISH' | 'BEARISH' | 'NONE' }) {
  const W = 72, H = 40, MID = H / 2
  // Normalise: show a single bar representing current hist value
  const barH  = Math.min(MID - 4, Math.abs(hist) * 800)   // scale factor
  const isPos = hist >= 0
  const color = isPos ? '#0ECB81' : '#F6465D'
  const y     = isPos ? MID - barH : MID

  const crossColor = cross === 'BULLISH' ? '#0ECB81' : cross === 'BEARISH' ? '#F6465D' : 'transparent'
  const crossLabel = cross !== 'NONE' ? cross.slice(0, 4) : ''

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Zero line */}
      <line x1={0} x2={W} y1={MID} y2={MID} stroke="var(--border)" strokeWidth="0.5" />
      {/* Bar */}
      <rect x={W / 2 - 6} y={y} width={12} height={Math.max(barH, 2)}
        fill={color} rx="2" opacity="0.85" />
      {/* Cross label */}
      {crossLabel && (
        <text x={W / 2} y={isPos ? MID - barH - 4 : MID + barH + 10} textAnchor="middle"
          style={{ fontSize: 8, fill: crossColor, fontFamily: 'monospace', fontWeight: 700 }}>
          {crossLabel}↑
        </text>
      )}
      {/* Hist value */}
      <text x={W / 2} y={H - 2} textAnchor="middle"
        style={{ fontSize: 8, fill: 'var(--text3)', fontFamily: 'monospace' }}>
        {hist > 0 ? '+' : ''}{hist.toFixed(4)}
      </text>
    </svg>
  )
}

// ── BB %B position bar ──────────────────────────────────────────────────────
function BbBar({ pct, width: bbWidth }: { pct: number; width: number }) {
  const W      = 100
  const clamp  = Math.max(-0.1, Math.min(1.1, pct))
  const xPct   = ((clamp + 0.1) / 1.2) * 100   // map -0.1..1.1 → 0..100%
  const color  = pct > 0.8 ? '#F6465D' : pct < 0.2 ? '#0ECB81' : '#F0B90B'
  const isSqueeze = bbWidth < 0.03

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="relative h-2 rounded-full overflow-visible" style={{ background: 'var(--bg4)' }}>
        {/* Lower zone */}
        <div className="absolute top-0 left-0 h-full rounded-l-full"
          style={{ width: '16%', background: 'rgba(14,203,129,0.2)' }} />
        {/* Upper zone */}
        <div className="absolute top-0 right-0 h-full rounded-r-full"
          style={{ width: '16%', background: 'rgba(246,70,93,0.2)' }} />
        {/* Pointer */}
        <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 transition-all duration-500"
          style={{ left: `calc(${xPct}% - 5px)`, background: color, borderColor: 'var(--bg)' }} />
      </div>
      <div className="flex justify-between mono text-[8px]" style={{ color: 'var(--text3)' }}>
        <span>Lower</span>
        {isSqueeze && (
          <span style={{ color: 'var(--yellow)' }}>⚡ Squeeze</span>
        )}
        <span>Upper</span>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function TechnicalSignalCard({ snapshot: s, minimal = false }: Props) {
  const m   = s.momentum
  const v   = s.volatility
  const vol = s.volume

  // ── Minimal row (for signal list) ─────────────────────────────────────────
  if (minimal) {
    const scoreColor = s.summary.overallScore > 65 ? 'var(--green)'
                     : s.summary.overallScore < 35 ? 'var(--red)' : 'var(--yellow)'
    return (
      <div className="flex items-center gap-3 flex-wrap mono text-[10px]" style={{ color: 'var(--text3)' }}>
        <span>RSI <span style={{ color: m.rsi14 < 30 ? 'var(--green)' : m.rsi14 > 70 ? 'var(--red)' : 'var(--text)' }}>
          {m.rsi14.toFixed(0)}</span></span>
        <span>MACD <span style={{ color: m.macdHist > 0 ? 'var(--green)' : 'var(--red)' }}>
          {m.macdHist > 0 ? '▲' : '▼'}</span></span>
        <span>BB <span style={{ color: v.bbPct > 0.8 ? 'var(--red)' : v.bbPct < 0.2 ? 'var(--green)' : 'var(--text)' }}>
          {(v.bbPct * 100).toFixed(0)}%</span></span>
        <span className="px-1.5 py-0.5 rounded-full font-bold"
          style={{ background: `${scoreColor}18`, color: scoreColor }}>
          {s.summary.overallScore}/100
        </span>
      </div>
    )
  }

  // ── Full card ─────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl p-4 flex flex-col gap-4"
      style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="mono text-xs font-extrabold" style={{ color: 'var(--text)' }}>
            {s.symbol}
          </span>
          <span className="mono text-[10px] ml-2" style={{ color: 'var(--text3)' }}>
            Technical Indicators
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Tech score badge */}
          <div className="mono text-[10px] font-bold px-2 py-1 rounded-full"
            style={{
              background: s.summary.overallScore > 65 ? 'rgba(14,203,129,0.12)'
                        : s.summary.overallScore < 35 ? 'rgba(246,70,93,0.12)'
                        : 'rgba(240,185,11,0.12)',
              color:      s.summary.overallScore > 65 ? 'var(--green)'
                        : s.summary.overallScore < 35 ? 'var(--red)' : 'var(--yellow)',
            }}>
            {s.summary.overallScore}/100
          </div>
        </div>
      </div>

      {/* 3-column visual row: RSI + MACD + BB */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>

        {/* RSI */}
        <div className="flex flex-col items-center gap-1 rounded-lg py-3 px-2"
          style={{ background: 'var(--bg3)' }}>
          <span className="mono text-[8px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
            RSI 14
          </span>
          <RsiGauge value={m.rsi14} />
          <span className="mono text-[9px]" style={{
            color: m.rsi14 < 30 ? 'var(--green)' : m.rsi14 > 70 ? 'var(--red)' : 'var(--text3)',
          }}>
            {m.rsi14 < 30 ? 'Oversold' : m.rsi14 > 70 ? 'Overbought' : 'Neutral'}
          </span>
        </div>

        {/* MACD */}
        <div className="flex flex-col items-center gap-1 rounded-lg py-3 px-2"
          style={{ background: 'var(--bg3)' }}>
          <span className="mono text-[8px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
            MACD Hist
          </span>
          <MacdBar hist={m.macdHist} cross={m.macdCross} />
          <span className="mono text-[9px]" style={{ color: m.macdHist > 0 ? 'var(--green)' : 'var(--red)' }}>
            {m.macdCross !== 'NONE' ? `${m.macdCross} cross` : m.macdHist > 0 ? 'Positive' : 'Negative'}
          </span>
        </div>

        {/* Stoch */}
        <div className="flex flex-col items-center gap-2 rounded-lg py-3 px-2"
          style={{ background: 'var(--bg3)' }}>
          <span className="mono text-[8px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
            Stoch K/D
          </span>
          <div className="flex gap-3 items-end">
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-5 rounded-t-sm" style={{
                height: `${Math.max(4, m.stochK * 0.4)}px`,
                background: m.stochK < 20 ? 'var(--green)' : m.stochK > 80 ? 'var(--red)' : 'var(--yellow)',
              }} />
              <span className="mono text-[8px]" style={{ color: 'var(--text3)' }}>K</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-5 rounded-t-sm" style={{
                height: `${Math.max(4, m.stochD * 0.4)}px`,
                background: 'var(--text3)',
              }} />
              <span className="mono text-[8px]" style={{ color: 'var(--text3)' }}>D</span>
            </div>
          </div>
          <div className="mono text-xs font-bold" style={{
            color: m.stochK < 20 ? 'var(--green)' : m.stochK > 80 ? 'var(--red)' : 'var(--text)',
          }}>
            {m.stochK.toFixed(0)} / {m.stochD.toFixed(0)}
          </div>
          <span className="mono text-[9px]" style={{
            color: m.stochK < 20 ? 'var(--green)' : m.stochK > 80 ? 'var(--red)' : 'var(--text3)',
          }}>
            {m.stochK < 20 ? 'Oversold' : m.stochK > 80 ? 'Overbought' : 'Neutral'}
          </span>
        </div>
      </div>

      {/* BB %B position */}
      <div className="rounded-lg p-3" style={{ background: 'var(--bg3)' }}>
        <div className="flex justify-between mb-2">
          <span className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
            Bollinger Band Position (%B)
          </span>
          <span className="mono text-[10px] font-bold" style={{
            color: v.bbPct > 0.8 ? 'var(--red)' : v.bbPct < 0.2 ? 'var(--green)' : 'var(--text)',
          }}>
            {(v.bbPct * 100).toFixed(0)}%
          </span>
        </div>
        <BbBar pct={v.bbPct} width={v.bbWidth} />
        <div className="flex justify-between mt-2 mono text-[9px]" style={{ color: 'var(--text3)' }}>
          <span>${s.volatility.bbLower.toFixed(0)}</span>
          <span>${s.volatility.bbMid.toFixed(0)}</span>
          <span>${s.volatility.bbUpper.toFixed(0)}</span>
        </div>
      </div>

      {/* Volume row: OBV + MFI */}
      <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="rounded-lg px-3 py-2.5 flex items-center gap-3"
          style={{ background: 'var(--bg3)' }}>
          <span className="text-lg">
            {s.volume.obvTrend === 'UP' ? '↑' : s.volume.obvTrend === 'DOWN' ? '↓' : '→'}
          </span>
          <div>
            <div className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
              OBV Trend
            </div>
            <div className="mono text-xs font-bold" style={{
              color: s.volume.obvTrend === 'UP' ? 'var(--green)'
                   : s.volume.obvTrend === 'DOWN' ? 'var(--red)' : 'var(--text3)',
            }}>
              {s.volume.obvTrend}
            </div>
          </div>
        </div>
        <div className="rounded-lg px-3 py-2.5 flex items-center gap-3"
          style={{ background: 'var(--bg3)' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center mono text-[10px] font-bold"
            style={{
              background: s.volume.mfi14 > 80 ? 'rgba(246,70,93,0.15)'
                        : s.volume.mfi14 < 20 ? 'rgba(14,203,129,0.15)' : 'var(--bg4)',
              color: s.volume.mfi14 > 80 ? 'var(--red)'
                   : s.volume.mfi14 < 20 ? 'var(--green)' : 'var(--text)',
            }}>
            {s.volume.mfi14.toFixed(0)}
          </div>
          <div>
            <div className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
              MFI 14
            </div>
            <div className="mono text-[10px]" style={{ color: 'var(--text3)' }}>
              {s.volume.mfi14 > 80 ? 'Overbought' : s.volume.mfi14 < 20 ? 'Oversold' : 'Neutral'}
            </div>
          </div>
        </div>
      </div>

      {/* Signal pills */}
      {s.summary.signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {s.summary.signals.slice(0, 6).map((sig, i) => {
            const isBull = sig.startsWith('↑')
            return (
              <span key={i} className="mono text-[9px] px-2 py-0.5 rounded-full"
                style={{
                  background: isBull ? 'rgba(14,203,129,0.1)' : 'rgba(246,70,93,0.1)',
                  color:      isBull ? 'var(--green)' : 'var(--red)',
                  border:     `1px solid ${isBull ? 'rgba(14,203,129,0.2)' : 'rgba(246,70,93,0.2)'}`,
                }}>
                {sig}
              </span>
            )
          })}
          {s.summary.signals.length > 6 && (
            <span className="mono text-[9px] px-2 py-0.5 rounded-full"
              style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>
              +{s.summary.signals.length - 6} more
            </span>
          )}
        </div>
      )}

      {/* Footer: support/resistance */}
      <div className="flex gap-4 mono text-[9px]" style={{ color: 'var(--text3)' }}>
        <span>S1 <span style={{ color: 'var(--green)' }}>${s.structure.support1.toFixed(0)}</span></span>
        <span>S2 <span style={{ color: 'var(--green)' }}>${s.structure.support2.toFixed(0)}</span></span>
        <span>R1 <span style={{ color: 'var(--red)' }}>${s.structure.resistance1.toFixed(0)}</span></span>
        <span>R2 <span style={{ color: 'var(--red)' }}>${s.structure.resistance2.toFixed(0)}</span></span>
        <span>Pivot <span style={{ color: 'var(--text)' }}>${s.structure.pivotPoint.toFixed(0)}</span></span>
      </div>
    </div>
  )
}
