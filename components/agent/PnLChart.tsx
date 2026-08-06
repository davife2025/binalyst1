'use client'

/**
 * components/agent/PnLChart.tsx
 * Session G: Hourly PnL chart for the agent competition session.
 * SVG sparkline + performance summary bars.
 */

import type { HourlyPnL } from '@/hooks/usePortfolio'

interface Props {
  history:   HourlyPnL[]
  startUSD:  number
  currentUSD: number
  peakUSD:   number
  width?:    number
  height?:   number
}

function fmtHour(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function PnLChart({ history, startUSD, currentUSD, peakUSD, width = 600, height = 120 }: Props) {
  if (history.length < 2) {
    return (
      <div className="flex items-center justify-center rounded-xl"
        style={{ height, background: 'var(--bg3)', border: '1px dashed var(--border)' }}>
        <span className="mono text-xs" style={{ color: 'var(--text3)' }}>
          Collecting hourly data — check back after the first hour
        </span>
      </div>
    )
  }

  const pnlValues = history.map(h => h.pnlPct)
  const minPnL    = Math.min(...pnlValues, 0)
  const maxPnL    = Math.max(...pnlValues, 0)
  const range     = maxPnL - minPnL || 1

  const pad = { top: 12, bottom: 24, left: 8, right: 48 }
  const W   = width, H = height
  const cW  = W - pad.left - pad.right
  const cH  = H - pad.top  - pad.bottom

  // Zero line Y position
  const zeroY = pad.top + cH - ((-minPnL) / range) * cH

  // Build polyline points
  const pts = history.map((h, i) => {
    const x = pad.left + (i / (history.length - 1)) * cW
    const y = pad.top  + cH - ((h.pnlPct - minPnL) / range) * cH
    return `${x},${y}`
  }).join(' ')

  // Fill polygon (area under/over zero)
  const firstX = pad.left
  const lastX  = pad.left + cW
  const area   = `${firstX},${zeroY} ${pts} ${lastX},${zeroY}`

  const lastPnL  = pnlValues[pnlValues.length - 1]
  const lineColor = lastPnL >= 0 ? '#0ECB81' : '#F6465D'
  const fillColor = lastPnL >= 0 ? 'rgba(14,203,129,0.08)' : 'rgba(246,70,93,0.08)'

  return (
    <div className="flex flex-col gap-2">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        {/* Zero line */}
        <line x1={pad.left} y1={zeroY} x2={W - pad.right} y2={zeroY}
          stroke="var(--border2)" strokeWidth="0.5" strokeDasharray="4 4" />

        {/* Area fill */}
        <polygon points={area} fill={fillColor} />

        {/* Line */}
        <polyline points={pts} fill="none"
          stroke={lineColor} strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Y axis labels */}
        {[minPnL, 0, maxPnL].map((v, i) => {
          const y = pad.top + cH - ((v - minPnL) / range) * cH
          return (
            <text key={i} x={W - pad.right + 4} y={y + 3} textAnchor="start"
              style={{ fontSize: 8, fontFamily: 'Space Mono,monospace', fill: 'var(--text3)' }}>
              {v >= 0 ? '+' : ''}{v.toFixed(1)}%
            </text>
          )
        })}

        {/* X axis: first + last date */}
        <text x={pad.left} y={H - 4} textAnchor="start"
          style={{ fontSize: 8, fontFamily: 'Space Mono,monospace', fill: 'var(--text3)' }}>
          {fmtDate(history[0].hour)}
        </text>
        <text x={W - pad.right} y={H - 4} textAnchor="end"
          style={{ fontSize: 8, fontFamily: 'Space Mono,monospace', fill: 'var(--text3)' }}>
          {fmtDate(history[history.length - 1].hour)}
        </text>

        {/* Last value dot */}
        {(() => {
          const lastH = history[history.length - 1]
          const lx    = pad.left + cW
          const ly    = pad.top + cH - ((lastH.pnlPct - minPnL) / range) * cH
          return <circle cx={lx} cy={ly} r="3" fill={lineColor} />
        })()}
      </svg>

      {/* Stats row */}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[
          { label: 'Start',   value: '$' + startUSD.toFixed(2),   color: 'var(--text2)'  },
          { label: 'Current', value: '$' + currentUSD.toFixed(2), color: lastPnL >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Peak',    value: '$' + peakUSD.toFixed(2),    color: 'var(--yellow)' },
          { label: 'Return',  value: (lastPnL >= 0 ? '+' : '') + lastPnL.toFixed(2) + '%', color: lastPnL >= 0 ? 'var(--green)' : 'var(--red)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg p-2 text-center"
            style={{ background: 'var(--bg3)' }}>
            <div className="mono text-[9px] mb-0.5" style={{ color: 'var(--text3)' }}>{label}</div>
            <div className="mono text-xs font-bold" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini inline sparkline (for dashboard cards)
// ─────────────────────────────────────────────────────────────────────────────

export function PnLSparkline({ history }: { history: HourlyPnL[] }) {
  if (history.length < 2) return <div style={{ width: 80, height: 24 }} />

  const vals  = history.map(h => h.pnlPct)
  const min   = Math.min(...vals)
  const max   = Math.max(...vals)
  const range = max - min || 1
  const W = 80, H = 24

  const pts = vals.map((v, i) =>
    `${(i / (vals.length - 1)) * W},${H - ((v - min) / range) * H}`
  ).join(' ')

  const last  = vals[vals.length - 1]
  const color = last >= 0 ? '#0ECB81' : '#F6465D'

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polyline points={pts} fill="none" stroke={color}
        strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
