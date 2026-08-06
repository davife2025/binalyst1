'use client'

/**
 * components/tabs/BacktestTab.tsx
 * Session L — Backtester UI
 *
 * Features:
 *  - Symbol, interval, lookback, capital pickers
 *  - Run backtest → live loading state
 *  - Metrics cards: total return, Sharpe, max drawdown, win rate, trades, profit factor
 *  - Equity curve SVG chart (inline, no recharts dependency)
 *  - Trade log table with PnL colouring
 *  - Uses rules from agentStore (parsed by StrategyBuilder) or raw strategy text
 */

import { useState } from 'react'
import { useAgentStore } from '@/lib/agentStore'
import type { BacktestResult, BacktestTrade } from '@/lib/backtester'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals)
}

function fmtUsd(n: number): string {
  return n >= 1000
    ? `$${(n / 1000).toFixed(2)}k`
    : `$${n.toFixed(2)}`
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function colorForPnl(v: number): string {
  return v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text3)'
}

// ─────────────────────────────────────────────────────────────────────────────
// Equity Curve — pure SVG, no deps
// ─────────────────────────────────────────────────────────────────────────────

function EquityCurve({ curve, initial }: { curve: BacktestResult['equityCurve']; initial: number }) {
  if (!curve || curve.length < 2) return (
    <div className="flex items-center justify-center h-48 mono text-xs" style={{ color: 'var(--text3)' }}>
      No equity data
    </div>
  )

  const W = 700, H = 200, PAD = { t: 16, r: 16, b: 32, l: 56 }
  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b

  const vals  = curve.map(p => p.equity)
  const minV  = Math.min(...vals)
  const maxV  = Math.max(...vals)
  const range = maxV - minV || 1

  function xOf(i: number)  { return PAD.l + (i / (curve.length - 1)) * iW }
  function yOf(v: number)  { return PAD.t + (1 - (v - minV) / range) * iH }

  const polyline = curve.map((p, i) => `${xOf(i)},${yOf(p.equity)}`).join(' ')

  // Area fill path
  const area = [
    `M ${xOf(0)} ${yOf(curve[0].equity)}`,
    ...curve.map((p, i) => `L ${xOf(i)} ${yOf(p.equity)}`),
    `L ${xOf(curve.length - 1)} ${PAD.t + iH}`,
    `L ${xOf(0)} ${PAD.t + iH} Z`,
  ].join(' ')

  const isProfit = vals[vals.length - 1] >= initial
  const lineColor = isProfit ? '#0ECB81' : '#F6465D'
  const areaColor = isProfit ? 'rgba(14,203,129,0.1)' : 'rgba(246,70,93,0.1)'

  // Y-axis labels
  const yLabels = [minV, (minV + maxV) / 2, maxV]

  // X-axis: ~5 date labels
  const xStep = Math.floor(curve.length / 5)
  const xLabels = curve.filter((_, i) => i % xStep === 0 || i === curve.length - 1)

  // Initial capital line
  const initY = yOf(initial)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yLabels.map((v, i) => (
        <g key={i}>
          <line x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)}
            stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 3" />
          <text x={PAD.l - 6} y={yOf(v) + 4} textAnchor="end"
            style={{ fontSize: 10, fill: 'var(--text3)', fontFamily: 'monospace' }}>
            {fmtUsd(v)}
          </text>
        </g>
      ))}

      {/* Initial capital baseline */}
      {initial >= minV && initial <= maxV && (
        <line x1={PAD.l} x2={W - PAD.r} y1={initY} y2={initY}
          stroke="var(--text3)" strokeWidth="0.7" strokeDasharray="4 4" opacity={0.5} />
      )}

      {/* Area */}
      <path d={area} fill="url(#eqGrad)" />

      {/* Line */}
      <polyline points={polyline} fill="none" stroke={lineColor} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />

      {/* X-axis labels */}
      {xLabels.map((p, i) => {
        const idx = curve.indexOf(p)
        return (
          <text key={i} x={xOf(idx)} y={H - 6} textAnchor="middle"
            style={{ fontSize: 10, fill: 'var(--text3)', fontFamily: 'monospace' }}>
            {fmtDate(p.time)}
          </text>
        )
      })}
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric Card
// ─────────────────────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, color, big,
}: { label: string; value: string; sub?: string; color?: string; big?: boolean }) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-1"
      style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
        {label}
      </div>
      <div className={`mono font-extrabold ${big ? 'text-2xl' : 'text-lg'}`}
        style={{ color: color ?? 'var(--text)' }}>
        {value}
      </div>
      {sub && (
        <div className="mono text-[10px]" style={{ color: 'var(--text3)' }}>{sub}</div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Trade Row
// ─────────────────────────────────────────────────────────────────────────────

function TradeRow({ trade, i }: { trade: BacktestTrade; i: number }) {
  return (
    <div className="grid items-center mono text-[10px] py-2 border-b"
      style={{ gridTemplateColumns: '28px 80px 80px 70px 70px 60px 60px 60px', borderColor: 'var(--border)', color: 'var(--text2)' }}>
      <span style={{ color: 'var(--text3)' }}>{i + 1}</span>
      <span>{fmtDate(trade.openTime)}</span>
      <span>{fmtDate(trade.closeTime)}</span>
      <span style={{ color: 'var(--text)' }}>${fmt(trade.entryPrice, 0)}</span>
      <span style={{ color: 'var(--text)' }}>${fmt(trade.exitPrice, 0)}</span>
      <span style={{ color: colorForPnl(trade.pnlUsd) }}>
        {trade.pnlUsd >= 0 ? '+' : ''}{fmtUsd(trade.pnlUsd)}
      </span>
      <span style={{ color: colorForPnl(trade.pnlPct) }}>
        {trade.pnlPct >= 0 ? '+' : ''}{fmt(trade.pnlPct)}%
      </span>
      <span style={{ color: 'var(--text3)' }}>{trade.holdBars}b</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

const INTERVALS = ['15m', '1h', '4h', '1d']
const SYMBOLS   = ['BTC', 'ETH', 'SOL', 'ADA', 'AVAX', 'DOT', 'LINK', 'MATIC', 'DOGE', 'ARB']
const LOOKBACKS = [
  { label: '1 month',  value: 30  },
  { label: '3 months', value: 90  },
  { label: '6 months', value: 180 },
  { label: '1 year',   value: 365 },
]

export default function BacktestTab() {
  const { strategyText, strategyParsed } = useAgentStore()

  const [symbol,       setSymbol]       = useState('BTC')
  const [interval,     setInterval]     = useState('1h')
  const [lookbackDays, setLookbackDays] = useState(90)
  const [capital,      setCapital]      = useState(10_000)
  const [fearGreed,    setFearGreed]    = useState(50)
  const [loading,      setLoading]      = useState(false)
  const [result,       setResult]       = useState<BacktestResult | null>(null)
  const [error,        setError]        = useState('')
  const [showTrades,   setShowTrades]   = useState(false)
  const [tradePage,    setTradePage]    = useState(0)

  const TRADES_PER_PAGE = 20

  async function runBacktest() {
    if (!strategyParsed || strategyParsed.length === 0) {
      setError('No strategy loaded. Go to Strategy Builder, write and parse a strategy first.')
      return
    }
    setLoading(true); setError(''); setResult(null)
    try {
      const res  = await fetch('/api/backtest', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          rules:         strategyParsed,
          symbol,
          interval,
          lookbackDays,
          initialCapital: capital,
          mockFearGreed:  fearGreed,
        }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.error ?? 'Backtest failed'); return }
      setResult(data.result)
    } catch (e: any) {
      setError(e.message ?? 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const pagedTrades = result
    ? result.trades.slice(tradePage * TRADES_PER_PAGE, (tradePage + 1) * TRADES_PER_PAGE)
    : []

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col gap-6">

      {/* Header */}
      <div>
        <h2 className="text-lg font-extrabold" style={{ color: 'var(--text)' }}>Backtester</h2>
        <p className="mono text-xs mt-1" style={{ color: 'var(--text3)' }}>
          Validate your strategy against real historical OHLCV data · No lookahead bias
        </p>
      </div>

      {/* Strategy status */}
      <div className="rounded-xl px-4 py-3 flex items-center gap-3"
        style={{
          background: strategyParsed?.length > 0 ? 'rgba(14,203,129,0.06)' : 'rgba(246,70,93,0.06)',
          border: `1px solid ${strategyParsed?.length > 0 ? 'rgba(14,203,129,0.2)' : 'rgba(246,70,93,0.2)'}`,
        }}>
        <span style={{ color: strategyParsed?.length > 0 ? 'var(--green)' : 'var(--red)' }}>
          {strategyParsed?.length > 0 ? '✓' : '✗'}
        </span>
        <span className="mono text-xs" style={{ color: 'var(--text2)' }}>
          {strategyParsed?.length > 0
            ? `${strategyParsed.length} rules loaded from StrategyBuilder`
            : 'No strategy loaded — go to Strategy Builder and parse a strategy first'}
        </span>
      </div>

      {/* Config row */}
      <div className="rounded-xl p-5 flex flex-col gap-5"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
        <div className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
          Backtest Parameters
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>

          {/* Symbol */}
          <div className="flex flex-col gap-1.5">
            <label className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
              Symbol
            </label>
            <select value={symbol} onChange={e => setSymbol(e.target.value)}
              className="mono text-xs px-3 py-2 rounded-lg outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}>
              {SYMBOLS.map(s => <option key={s} value={s}>{s}/USDT</option>)}
            </select>
          </div>

          {/* Interval */}
          <div className="flex flex-col gap-1.5">
            <label className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
              Candle Interval
            </label>
            <div className="flex gap-1">
              {INTERVALS.map(iv => (
                <button key={iv} onClick={() => setInterval(iv)}
                  className="flex-1 py-2 rounded-lg mono text-[10px] font-bold transition-all"
                  style={{
                    background: interval === iv ? 'var(--yellow)' : 'var(--bg3)',
                    color:      interval === iv ? '#000' : 'var(--text3)',
                    border:     '1px solid var(--border)',
                  }}>
                  {iv}
                </button>
              ))}
            </div>
          </div>

          {/* Lookback */}
          <div className="flex flex-col gap-1.5">
            <label className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
              Lookback Period
            </label>
            <div className="flex gap-1">
              {LOOKBACKS.map(l => (
                <button key={l.value} onClick={() => setLookbackDays(l.value)}
                  className="flex-1 py-2 rounded-lg mono text-[10px] font-bold transition-all"
                  style={{
                    background: lookbackDays === l.value ? 'var(--yellow)' : 'var(--bg3)',
                    color:      lookbackDays === l.value ? '#000' : 'var(--text3)',
                    border:     '1px solid var(--border)',
                  }}>
                  {l.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Capital */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between">
              <label className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
                Initial Capital
              </label>
              <span className="mono text-xs font-bold" style={{ color: 'var(--text)' }}>
                {fmtUsd(capital)}
              </span>
            </div>
            <input type="range" min={1000} max={100000} step={1000} value={capital}
              onChange={e => setCapital(parseInt(e.target.value))}
              style={{ accentColor: 'var(--yellow)' }} />
          </div>

          {/* Mock Fear & Greed */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between">
              <label className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
                Mock Fear & Greed
              </label>
              <span className="mono text-xs font-bold" style={{
                color: fearGreed <= 25 ? 'var(--green)' : fearGreed >= 75 ? 'var(--red)' : 'var(--yellow)',
              }}>
                {fearGreed} — {fearGreed <= 25 ? 'Extreme Fear' : fearGreed >= 75 ? 'Extreme Greed' : fearGreed <= 45 ? 'Fear' : fearGreed >= 55 ? 'Greed' : 'Neutral'}
              </span>
            </div>
            <input type="range" min={0} max={100} step={1} value={fearGreed}
              onChange={e => setFearGreed(parseInt(e.target.value))}
              style={{ accentColor: 'var(--yellow)' }} />
            <div className="mono text-[9px]" style={{ color: 'var(--text3)' }}>
              Historical F&G not available — set a fixed value to test sentiment-based rules
            </div>
          </div>

        </div>

        {error && (
          <div className="mono text-xs px-3 py-2 rounded-lg"
            style={{ background: 'rgba(246,70,93,0.08)', border: '1px solid rgba(246,70,93,0.2)', color: 'var(--red)' }}>
            {error}
          </div>
        )}

        <button onClick={runBacktest}
          disabled={loading || !strategyParsed?.length}
          className="py-3 rounded-xl mono text-sm font-bold flex items-center justify-center gap-2 transition-all"
          style={{
            background: loading || !strategyParsed?.length ? 'var(--bg4)' : 'var(--yellow)',
            color:      loading || !strategyParsed?.length ? 'var(--text3)' : '#000',
            cursor:     loading || !strategyParsed?.length ? 'not-allowed' : 'pointer',
          }}>
          {loading && (
            <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin-slow" />
          )}
          {loading ? `Fetching ${symbol} candles & running backtest…` : `▶ Run Backtest on ${symbol}/${interval} (${lookbackDays}d)`}
        </button>
      </div>

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      {result && (
        <>
          {/* Headline metrics */}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <MetricCard
              label="Total Return"
              value={`${result.totalReturn >= 0 ? '+' : ''}${fmt(result.totalReturn)}%`}
              sub={`${fmtUsd(result.initialCapital)} → ${fmtUsd(result.finalCapital)}`}
              color={result.totalReturn >= 0 ? 'var(--green)' : 'var(--red)'}
              big
            />
            <MetricCard
              label="Sharpe Ratio"
              value={fmt(result.sharpeRatio)}
              sub={result.sharpeRatio >= 1 ? 'Good' : result.sharpeRatio >= 0 ? 'Acceptable' : 'Poor'}
              color={result.sharpeRatio >= 1 ? 'var(--green)' : result.sharpeRatio >= 0 ? 'var(--yellow)' : 'var(--red)'}
            />
            <MetricCard
              label="Max Drawdown"
              value={`${fmt(result.maxDrawdown)}%`}
              sub={fmtUsd(result.maxDrawdownUsd)}
              color={result.maxDrawdown <= 15 ? 'var(--green)' : result.maxDrawdown <= 25 ? 'var(--yellow)' : 'var(--red)'}
            />
            <MetricCard
              label="Win Rate"
              value={`${fmt(result.winRate)}%`}
              sub={`${result.winningTrades}W / ${result.losingTrades}L`}
              color={result.winRate >= 55 ? 'var(--green)' : result.winRate >= 45 ? 'var(--yellow)' : 'var(--red)'}
            />
            <MetricCard
              label="Total Trades"
              value={`${result.totalTrades}`}
              sub={`Avg hold: ${fmt(result.avgHoldBars, 0)} bars`}
            />
            <MetricCard
              label="Profit Factor"
              value={result.profitFactor === Infinity ? '∞' : fmt(result.profitFactor)}
              sub={`Avg W: +${fmt(result.avgWin)}% / Avg L: -${fmt(result.avgLoss)}%`}
              color={result.profitFactor >= 1.5 ? 'var(--green)' : result.profitFactor >= 1 ? 'var(--yellow)' : 'var(--red)'}
            />
          </div>

          {/* Equity curve */}
          <div className="rounded-xl p-5"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="mono text-[10px] uppercase tracking-widest mb-4" style={{ color: 'var(--text3)' }}>
              Equity Curve — {result.symbol}/{interval} · {result.barCount} bars
            </div>
            <EquityCurve curve={result.equityCurve} initial={result.initialCapital} />
          </div>

          {/* Trade log */}
          <div className="rounded-xl p-5"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
                Trade Log ({result.trades.length} trades)
              </div>
              <button onClick={() => setShowTrades(v => !v)}
                className="mono text-[10px] px-3 py-1 rounded-lg"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
                {showTrades ? '▲ Hide' : '▼ Show'}
              </button>
            </div>

            {showTrades && (
              <>
                {/* Header row */}
                <div className="grid mono text-[9px] uppercase tracking-wider pb-2 border-b"
                  style={{ gridTemplateColumns: '28px 80px 80px 70px 70px 60px 60px 60px', borderColor: 'var(--border)', color: 'var(--text3)' }}>
                  <span>#</span>
                  <span>Opened</span>
                  <span>Closed</span>
                  <span>Entry</span>
                  <span>Exit</span>
                  <span>PnL $</span>
                  <span>PnL %</span>
                  <span>Hold</span>
                </div>

                {pagedTrades.map((t, i) => (
                  <TradeRow key={i} trade={t} i={tradePage * TRADES_PER_PAGE + i} />
                ))}

                {/* Pagination */}
                {result.trades.length > TRADES_PER_PAGE && (
                  <div className="flex items-center justify-between mt-3">
                    <button onClick={() => setTradePage(p => Math.max(0, p - 1))}
                      disabled={tradePage === 0}
                      className="mono text-[10px] px-3 py-1 rounded-lg"
                      style={{ background: 'var(--bg3)', color: tradePage === 0 ? 'var(--text3)' : 'var(--text)', border: '1px solid var(--border)' }}>
                      ← Prev
                    </button>
                    <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>
                      Page {tradePage + 1} of {Math.ceil(result.trades.length / TRADES_PER_PAGE)}
                    </span>
                    <button
                      onClick={() => setTradePage(p => Math.min(Math.ceil(result.trades.length / TRADES_PER_PAGE) - 1, p + 1))}
                      disabled={tradePage >= Math.ceil(result.trades.length / TRADES_PER_PAGE) - 1}
                      className="mono text-[10px] px-3 py-1 rounded-lg"
                      style={{ background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Summary footer */}
          <div className="rounded-xl p-4 mono text-[10px] leading-relaxed"
            style={{ background: 'rgba(240,185,11,0.05)', border: '1px solid rgba(240,185,11,0.15)', color: 'var(--text3)' }}>
            <span style={{ color: 'var(--yellow)' }}>Backtest summary: </span>
            {result.symbol} {result.interval} over {lookbackDays}d ·{' '}
            {result.totalTrades} trades · Return {result.totalReturn >= 0 ? '+' : ''}{fmt(result.totalReturn)}% ·{' '}
            Sharpe {fmt(result.sharpeRatio)} · Max DD {fmt(result.maxDrawdown)}% · Win rate {fmt(result.winRate)}% ·{' '}
            {result.rulesEvaluated.toLocaleString()} rule evaluations across {result.barCount} bars.
          </div>
        </>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-xl"
          style={{ background: 'var(--bg2)', border: '1px dashed var(--border)' }}>
          <div className="text-5xl opacity-20">📈</div>
          <div className="mono text-sm font-bold" style={{ color: 'var(--text3)' }}>
            Configure parameters above and run a backtest
          </div>
          <div className="mono text-xs text-center max-w-xs" style={{ color: 'var(--text3)' }}>
            Fetches real Binance OHLCV data, replays your strategy bar-by-bar, fills at next-bar open.
            No lookahead bias.
          </div>
        </div>
      )}
    </div>
  )
}
