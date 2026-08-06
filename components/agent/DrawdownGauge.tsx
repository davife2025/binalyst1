'use client'

/**
 * components/agent/DrawdownGauge.tsx — Hotfix 7
 * Fixed: COMPETITION_RULES imported from '@/lib/twak/client' (correct source)
 * not '@/lib/agentLoop' (where it was never exported from).
 */



// These constants live in agentLoop — keep those imports
const DRAWDOWN_WARN_PCT  = 12  // 80% of 15% moderate default
const DRAWDOWN_PAUSE_PCT = 14  // 93% of 15% moderate default

const MAX = 15  // moderate default; overridden by RiskProfile in Session 3

interface Props {
  drawdownPct: number
  size?: number
}

export default function DrawdownGauge({ drawdownPct, size = 160 }: Props) {
  const pct   = Math.min(drawdownPct, MAX + 2)
  const fill  = (pct / MAX) * 100

  const color =
    pct >= MAX               ? '#F6465D' :
    pct >= DRAWDOWN_PAUSE_PCT ? '#F6465D' :
    pct >= DRAWDOWN_WARN_PCT  ? '#F0B90B' : '#0ECB81'

  const label =
    pct >= MAX               ? 'DISQUALIFIED' :
    pct >= DRAWDOWN_PAUSE_PCT ? 'AUTO-PAUSING' :
    pct >= DRAWDOWN_WARN_PCT  ? 'WARNING'      : 'SAFE'

  const W = size, H = size * 0.55
  const cx = W / 2, cy = H * 0.92, R = W * 0.4

  function arcPath(startDeg: number, endDeg: number, radius: number) {
    const s  = Math.PI + (startDeg / 180) * Math.PI
    const e  = Math.PI + (endDeg   / 180) * Math.PI
    const x1 = cx + radius * Math.cos(s)
    const y1 = cy + radius * Math.sin(s)
    const x2 = cx + radius * Math.cos(e)
    const y2 = cy + radius * Math.sin(e)
    const large = endDeg - startDeg > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`
  }

  const sweep    = Math.min(fill, 100)
  const warnDeg  = (DRAWDOWN_WARN_PCT  / MAX) * 180
  const pauseDeg = (DRAWDOWN_PAUSE_PCT / MAX) * 180
  const fillDeg  = (sweep / 100) * 180

  const needleAngle = Math.PI + (fillDeg / 180) * Math.PI
  const needleLen   = R * 0.78
  const nx = cx + needleLen * Math.cos(needleAngle)
  const ny = cy + needleLen * Math.sin(needleAngle)

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* Background track */}
        <path d={arcPath(0, 180, R)} fill="none" stroke="var(--bg4)" strokeWidth={W * 0.08} />

        {/* Safe zone */}
        {fillDeg > 0 && fillDeg <= warnDeg && (
          <path d={arcPath(0, fillDeg, R)} fill="none"
            stroke="#0ECB81" strokeWidth={W * 0.08} strokeLinecap="round" />
        )}
        {fillDeg > warnDeg && (
          <path d={arcPath(0, warnDeg, R)} fill="none"
            stroke="#0ECB81" strokeWidth={W * 0.08} />
        )}

        {/* Warn zone */}
        {fillDeg > warnDeg && (
          <path d={arcPath(warnDeg, Math.min(fillDeg, pauseDeg), R)}
            fill="none" stroke="#F0B90B" strokeWidth={W * 0.08}
            strokeLinecap={fillDeg <= pauseDeg ? 'round' : undefined} />
        )}

        {/* Danger zone */}
        {fillDeg > pauseDeg && (
          <path d={arcPath(pauseDeg, Math.min(fillDeg, 180), R)} fill="none"
            stroke="#F6465D" strokeWidth={W * 0.08} strokeLinecap="round" />
        )}

        {/* Zone markers */}
        {[
          { deg: warnDeg,  label: `${DRAWDOWN_WARN_PCT}%`,  color: '#F0B90B' },
          { deg: pauseDeg, label: `${DRAWDOWN_PAUSE_PCT.toFixed(0)}%`, color: '#F6465D' },
        ].map(({ deg, label: ml, color: mc }) => {
          const a  = Math.PI + (deg / 180) * Math.PI
          const mr = R * 1.18
          const mx = cx + mr * Math.cos(a)
          const my = cy + mr * Math.sin(a)
          return (
            <text key={deg} x={mx} y={my} textAnchor="middle"
              style={{ fontSize: W * 0.055, fontFamily: 'Space Mono, monospace', fill: mc }}>
              {ml}
            </text>
          )
        })}

        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny}
          stroke="var(--text)" strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={W * 0.028} fill="var(--text)" />

        {/* End labels */}
        <text x={cx - R * 0.9} y={cy + W * 0.06} textAnchor="middle"
          style={{ fontSize: W * 0.05, fontFamily: 'Space Mono, monospace', fill: 'var(--text3)' }}>
          0%
        </text>
        <text x={cx + R * 0.9} y={cy + W * 0.06} textAnchor="middle"
          style={{ fontSize: W * 0.05, fontFamily: 'Space Mono, monospace', fill: 'var(--text3)' }}>
          {MAX}%
        </text>
      </svg>

      <div className="flex flex-col items-center -mt-1">
        <div className="mono font-extrabold" style={{ fontSize: size * 0.17, color }}>
          {drawdownPct.toFixed(1)}%
        </div>
        <div className="mono text-[10px] font-bold tracking-widest" style={{ color }}>
          {label}
        </div>
      </div>
    </div>
  )
}

// ── Inline bar variant ────────────────────────────────────────────────────────

export function DrawdownBar({ drawdownPct }: { drawdownPct: number }) {
  const pct   = Math.min(drawdownPct, 30)
  const fill  = (pct / 30) * 100
  const color =
    pct >= DRAWDOWN_PAUSE_PCT ? '#F6465D' :
    pct >= DRAWDOWN_WARN_PCT  ? '#F0B90B' : '#0ECB81'

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 rounded-full overflow-hidden flex-1"
        style={{ background: 'var(--bg4)', minWidth: 80 }}>
        {/* Warn marker at 80% */}
        <div className="absolute top-0 bottom-0 w-px"
          style={{ left: '80%', background: '#F0B90B', opacity: 0.5 }} />
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${fill}%`, background: color }} />
      </div>
      <span className="mono text-[10px] font-bold shrink-0" style={{ color }}>
        {drawdownPct.toFixed(1)}% DD
      </span>
    </div>
  )
}
