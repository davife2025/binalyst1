'use client'

/**
 * components/agent/PortfolioBreakdown.tsx
 * Session G: Visual portfolio allocation + token balance table.
 * Shows on-chain BSC holdings for the agent wallet.
 */

import type { PortfolioItem } from '@/hooks/usePortfolio'

const COLORS = [
  '#F0B90B', '#0ECB81', '#3498db', '#9b59b6',
  '#e67e22', '#F6465D', '#1abc9c', '#e74c3c',
]

function fmtUSD(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtBal(n: number, sym: string) {
  if (n > 1000)  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n > 1)     return n.toFixed(4)
  if (n > 0.001) return n.toFixed(6)
  return n.toExponential(2)
}

interface Props {
  items:    PortfolioItem[]
  totalUSD: number
  network:  string
}

export default function PortfolioBreakdown({ items, totalUSD, network }: Props) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3"
        style={{ background: 'var(--bg2)', border: '1px dashed var(--border)', borderRadius: 12 }}>
        <div className="text-4xl opacity-20">◑</div>
        <div className="mono text-xs" style={{ color: 'var(--text3)' }}>
          No token balances detected on {network}
        </div>
      </div>
    )
  }

  // SVG donut chart
  const W = 120, R = 48, stroke = 22
  const circumference = 2 * Math.PI * R
  let offset = 0

  const segments = items.slice(0, 8).map((item, i) => {
    const dash  = (item.pct / 100) * circumference
    const gap   = circumference - dash
    const seg   = { item, dash, gap, offset, color: COLORS[i % COLORS.length] }
    offset     += dash
    return seg
  })

  return (
    <div className="flex flex-col gap-4">

      {/* Total */}
      <div className="flex items-center justify-between">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
            Total Portfolio Value
          </div>
          <div className="mono text-2xl font-extrabold" style={{ color: 'var(--text)' }}>
            {fmtUSD(totalUSD)}
          </div>
        </div>
        <div className="mono text-[10px] px-3 py-1 rounded-full"
          style={{
            background: network === 'mainnet' ? 'rgba(246,70,93,0.1)' : 'rgba(14,203,129,0.1)',
            color:      network === 'mainnet' ? 'var(--red)' : 'var(--green)',
            border:     `1px solid ${network === 'mainnet' ? 'rgba(246,70,93,0.3)' : 'rgba(14,203,129,0.3)'}`,
          }}>
          {network === 'mainnet' ? '🔴 Mainnet' : '🟢 Testnet'}
        </div>
      </div>

      <div className="flex items-start gap-6">
        {/* Donut */}
        <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`} className="shrink-0">
          <circle cx={W/2} cy={W/2} r={R} fill="none"
            stroke="var(--bg4)" strokeWidth={stroke} />
          {segments.map(({ dash, gap, offset: off, color }, i) => (
            <circle key={i} cx={W/2} cy={W/2} r={R} fill="none"
              stroke={color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-off}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
          ))}
          <text x={W/2} y={W/2 - 4} textAnchor="middle"
            style={{ fontSize: 9, fontFamily: 'Space Mono,monospace', fill: 'var(--text3)' }}>
            {items.length} tokens
          </text>
          <text x={W/2} y={W/2 + 10} textAnchor="middle"
            style={{ fontSize: 10, fontFamily: 'Space Mono,monospace', fill: 'var(--text)', fontWeight: 700 }}>
            {fmtUSD(totalUSD).replace('$', '$')}
          </text>
        </svg>

        {/* Legend */}
        <div className="flex-1 flex flex-col gap-1.5">
          {items.slice(0, 8).map((item, i) => (
            <div key={item.symbol} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: COLORS[i % COLORS.length] }} />
              <span className="mono text-xs font-bold w-14" style={{ color: 'var(--text)' }}>
                {item.symbol}
              </span>
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg4)' }}>
                <div className="h-full rounded-full"
                  style={{ width: `${item.pct}%`, background: COLORS[i % COLORS.length] }} />
              </div>
              <span className="mono text-[10px] w-10 text-right" style={{ color: 'var(--text3)' }}>
                {item.pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Token table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="grid px-4 py-2 mono text-[9px] uppercase tracking-widest border-b"
          style={{
            gridTemplateColumns: '60px 1fr 100px 80px 70px',
            background: 'var(--bg3)', color: 'var(--text3)', borderColor: 'var(--border)',
          }}>
          {['Token', 'Balance', 'Price', 'Value', 'Alloc'].map(h => <span key={h}>{h}</span>)}
        </div>

        {items.map((item, i) => (
          <div key={item.symbol}
            className="grid px-4 py-3 border-b items-center"
            style={{
              gridTemplateColumns: '60px 1fr 100px 80px 70px',
              background: 'var(--bg2)', borderColor: 'var(--border)',
            }}>
            {/* Token */}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full shrink-0"
                style={{ background: COLORS[i % COLORS.length] }} />
              <span className="mono text-xs font-bold" style={{ color: 'var(--text)' }}>
                {item.symbol}
              </span>
            </div>
            {/* Balance */}
            <span className="mono text-xs" style={{ color: 'var(--text2)' }}>
              {fmtBal(item.balance, item.symbol)}
            </span>
            {/* Price */}
            <span className="mono text-xs" style={{ color: 'var(--text3)' }}>
              {item.priceUSD > 0 ? fmtUSD(item.priceUSD) : '—'}
            </span>
            {/* Value */}
            <span className="mono text-xs font-bold" style={{ color: 'var(--text)' }}>
              {fmtUSD(item.valueUSD)}
            </span>
            {/* Allocation bar */}
            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg4)' }}>
                <div className="h-full rounded-full"
                  style={{ width: `${item.pct}%`, background: COLORS[i % COLORS.length] }} />
              </div>
              <span className="mono text-[9px]" style={{ color: 'var(--text3)' }}>
                {item.pct.toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
