'use client'

/**
 * components/agent/FearGreedGauge.tsx
 * Animated SVG arc gauge for the Fear & Greed index.
 * Used in SignalDashboard and CompetitionTab.
 */

import { useEffect, useRef } from 'react'
import type { FearAndGreed } from '@/lib/skills/cmc'

const ZONE_COLORS = [
  { max: 20,  color: '#F6465D', label: 'Extreme Fear'  },
  { max: 44,  color: '#e67e22', label: 'Fear'          },
  { max: 55,  color: '#F0B90B', label: 'Neutral'       },
  { max: 74,  color: '#0ECB81', label: 'Greed'         },
  { max: 100, color: '#1abc9c', label: 'Extreme Greed' },
]

function getZoneColor(value: number) {
  return ZONE_COLORS.find(z => value <= z.max)?.color ?? '#F0B90B'
}

interface Props {
  data:    FearAndGreed | null
  size?:   number
  showHistory?: boolean
  history?: FearAndGreed[]
}

export default function FearGreedGauge({ data, size = 180, showHistory = false, history = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef   = useRef<number | null>(null)
  const currentRef = useRef(50)

  const value  = data?.value ?? 50
  const color  = getZoneColor(value)
  const label  = data?.label ?? 'Loading...'

  // Animate needle
  useEffect(() => {
    let start: number | null = null
    const from = currentRef.current
    const to   = value

    function step(ts: number) {
      if (!start) start = ts
      const p    = Math.min((ts - start) / 800, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      currentRef.current = from + (to - from) * ease
      drawGauge(currentRef.current)
      if (p < 1) animRef.current = requestAnimationFrame(step)
    }

    animRef.current = requestAnimationFrame(step)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [value])

  function drawGauge(v: number) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx  = canvas.getContext('2d')
    if (!ctx)  return
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H * 0.62
    const R  = W * 0.38

    ctx.clearRect(0, 0, W, H)

    // Arc zones (180° sweep from left to right)
    const startAngle = Math.PI
    const endAngle   = 2 * Math.PI
    const sweep      = endAngle - startAngle

    let prev = startAngle
    ZONE_COLORS.forEach(zone => {
      const zEnd = startAngle + sweep * (zone.max / 100)
      ctx.beginPath()
      ctx.arc(cx, cy, R, prev, zEnd)
      ctx.lineWidth = W * 0.095
      ctx.strokeStyle = zone.color + '55'
      ctx.stroke()
      prev = zEnd
    })

    // Active arc (filled to current value)
    const fillEnd = startAngle + sweep * (v / 100)
    ctx.beginPath()
    ctx.arc(cx, cy, R, startAngle, fillEnd)
    ctx.lineWidth = W * 0.095
    ctx.strokeStyle = getZoneColor(v)
    ctx.lineCap = 'round'
    ctx.stroke()

    // Needle
    const angle    = startAngle + sweep * (v / 100)
    const needleL  = R * 0.82
    const nx = cx + needleL * Math.cos(angle)
    const ny = cy + needleL * Math.sin(angle)

    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(nx, ny)
    ctx.strokeStyle = '#EAECEF'
    ctx.lineWidth   = 2
    ctx.lineCap     = 'round'
    ctx.stroke()

    // Center dot
    ctx.beginPath()
    ctx.arc(cx, cy, W * 0.03, 0, Math.PI * 2)
    ctx.fillStyle = '#EAECEF'
    ctx.fill()

    // Zone labels
    ctx.font        = `${W * 0.055}px Space Mono, monospace`
    ctx.fillStyle   = '#474D57'
    ctx.textAlign   = 'center'
    ctx.fillText('0',   cx - R * 0.98, cy + W * 0.06)
    ctx.fillText('50',  cx,            cy - R * 1.08)
    ctx.fillText('100', cx + R * 0.98, cy + W * 0.06)
  }

  // Mini sparkline for F&G history
  function renderHistory() {
    if (!showHistory || history.length < 2) return null
    const W = 200, H = 36
    const vals = history.map(h => h.value)
    const min  = Math.min(...vals)
    const max  = Math.max(...vals)
    const rng  = max - min || 1
    const pts  = vals.map((v, i) =>
      `${(i / (vals.length - 1)) * W},${H - ((v - min) / rng) * H}`
    ).join(' ')
    const lastVal = vals[vals.length - 1]
    const lineColor = getZoneColor(lastVal)

    return (
      <div className="flex flex-col items-center gap-1 mt-1">
        <div className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
          30d history
        </div>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.5"
            strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />
        </svg>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <canvas
        ref={canvasRef}
        width={size}
        height={size * 0.62}
        style={{ width: size, height: size * 0.62 }}
      />
      <div className="flex flex-col items-center -mt-1">
        <div className="mono font-extrabold" style={{ fontSize: size * 0.18, color }}>
          {data ? Math.round(value) : '—'}
        </div>
        <div className="mono font-bold" style={{ fontSize: size * 0.072, color, letterSpacing: '0.04em' }}>
          {label.toUpperCase()}
        </div>
      </div>
      {renderHistory()}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini inline version for headers / cards
// ─────────────────────────────────────────────────────────────────────────────

export function FearGreedMini({ value, label }: { value: number; label: string }) {
  const color = getZoneColor(value)
  const pct   = `${value}%`
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-16 h-2 rounded-full overflow-hidden"
        style={{ background: 'var(--bg4)' }}>
        <div className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{ width: pct, background: color }} />
      </div>
      <span className="mono text-xs font-bold" style={{ color }}>{value}</span>
      <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>{label}</span>
    </div>
  )
}
