'use client'

import { useEffect, useRef, useState } from 'react'
import { useStore, type Holding } from '@/lib/store'

const COLORS = ['#F0B90B','#0ECB81','#3498db','#9b59b6','#e67e22','#F6465D','#1abc9c','#e74c3c']

function fmtUSD(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}
function fmtPrice(n: number) {
  if (!n) return '—'
  if (n > 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n > 1)    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return n.toFixed(6)
}

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !data.length) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const S = 160; canvas.width = S; canvas.height = S
    const total = data.reduce((s, d) => s + d.value, 0)
    let angle = -Math.PI / 2
    ctx.clearRect(0, 0, S, S)
    data.forEach(d => {
      const sweep = (d.value / total) * Math.PI * 2
      ctx.beginPath(); ctx.moveTo(S / 2, S / 2)
      ctx.arc(S / 2, S / 2, 68, angle, angle + sweep)
      ctx.closePath(); ctx.fillStyle = d.color; ctx.fill()
      angle += sweep
    })
    ctx.beginPath(); ctx.arc(S / 2, S / 2, 42, 0, Math.PI * 2)
    ctx.fillStyle = '#0B0E11'; ctx.fill()
  }, [data])
  return <canvas ref={ref} style={{ width: 160, height: 160 }} />
}

async function streamAdvice(prompt: string, onChunk: (t: string) => void, apiKey?: string, apiSecret?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey)    headers['x-binance-key']    = apiKey
  if (apiSecret) headers['x-binance-secret'] = apiSecret
  const res = await fetch('/api/ai/chat', {
    method: 'POST', headers,
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], mode: 'analyst' }),
  })
  const reader = res.body?.getReader(); const dec = new TextDecoder()
  if (!reader) return
  while (true) {
    const { done, value } = await reader.read(); if (done) break
    for (const line of dec.decode(value).split('\n').filter(l => l.startsWith('data: '))) {
      try { const j = JSON.parse(line.slice(6)); if (j.type === 'text') onChunk(j.text) } catch {}
    }
  }
}

function AdviceBox({ onAnalyze, loading, advice }: { onAnalyze: () => void; loading: boolean; advice: string }) {
  return (
    <div className="rounded-xl p-4 mt-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>AI Portfolio Advisor</span>
        <button onClick={onAnalyze} disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
          style={{ background: loading ? 'var(--bg4)' : 'var(--yellow)', color: loading ? 'var(--text3)' : '#000', cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading && <span className="w-3 h-3 rounded-full border-2 border-black/30 border-t-black animate-spin-slow" />}
          {loading ? 'Analyzing...' : 'Analyze portfolio'}
        </button>
      </div>
      {advice ? (
        <div className="text-sm leading-relaxed" style={{ color: 'var(--text2)', whiteSpace: 'pre-wrap' }}
          dangerouslySetInnerHTML={{ __html: advice.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--yellow)">$1</strong>') }} />
      ) : (
        <div className="mono text-xs" style={{ color: 'var(--text3)' }}>Click to get AI insights, rebalancing tips, and Binance product recommendations.</div>
      )}
    </div>
  )
}

function LivePortfolio({ apiKey, apiSecret }: { apiKey: string; apiSecret: string }) {
  const [portfolio, setPortfolio] = useState<any>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [advice, setAdvice]       = useState('')
  const [advising, setAdvising]   = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/binance/account?action=balances', {
        headers: { 'x-binance-key': apiKey, 'x-binance-secret': apiSecret },
      })
      const d = await res.json()
      if (d.success) setPortfolio(d.data)
      else setError(d.error)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  async function analyze() {
    if (!portfolio) return
    setAdvising(true); setAdvice('')
    const summary = portfolio.balances.slice(0, 8)
      .map((b: any) => `${b.asset}: ${b.qty.toFixed(4)} (~$${b.usdValue.toFixed(0)})`).join(', ')
    try {
      await streamAdvice(
        `My Binance portfolio: ${summary}. Total: $${portfolio.totalUSD.toFixed(0)}. Give: 1) Concentration risk 2) Rebalance suggestions 3) Binance Earn/Launchpool opportunities 4) One action this week. Be brief and direct.`,
        (t) => setAdvice(p => p + t), apiKey, apiSecret
      )
    } catch (e: any) { setAdvice('Error: ' + e.message) }
    setAdvising(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-3" style={{ color: 'var(--text3)' }}>
      <span className="w-5 h-5 rounded-full border-2 animate-spin-slow" style={{ borderColor: 'var(--border2)', borderTopColor: 'var(--yellow)' }} />
      <span className="mono text-xs">Loading from Binance...</span>
    </div>
  )

  if (error) return (
    <div className="rounded-xl p-4 mono text-xs" style={{ background: 'rgba(246,70,93,0.08)', border: '1px solid rgba(246,70,93,0.25)', color: 'var(--red)' }}>
      {error}
    </div>
  )

  if (!portfolio) return null

  const donutData = portfolio.balances.slice(0, 8).map((b: any, i: number) => ({
    label: b.asset, value: b.usdValue, color: COLORS[i % COLORS.length],
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Value', value: fmtUSD(portfolio.totalUSD), yellow: true },
          { label: 'Assets',      value: String(portfolio.balances.length), yellow: false },
          { label: 'Largest',     value: portfolio.balances[0]?.asset ?? '—', yellow: false },
        ].map(({ label, value, yellow }) => (
          <div key={label} className="rounded-xl p-4" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
            <div className="mono text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>{label}</div>
            <div className="font-extrabold mono" style={{ fontSize: yellow ? 22 : 18, color: yellow ? 'var(--yellow)' : 'var(--text)' }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="grid px-4 py-2 mono text-[10px] uppercase tracking-widest border-b"
            style={{ gridTemplateColumns: '1fr 1fr 1fr', borderColor: 'var(--border)', background: 'var(--bg3)', color: 'var(--text3)' }}>
            <span>Asset</span><span>Balance</span><span>Value</span>
          </div>
          {portfolio.balances.slice(0, 10).map((b: any, i: number) => (
            <div key={b.asset} className="grid px-4 py-2.5 border-b"
              style={{ gridTemplateColumns: '1fr 1fr 1fr', borderColor: 'var(--border)', background: i % 2 === 0 ? 'var(--bg2)' : 'transparent' }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="mono text-xs font-bold" style={{ color: 'var(--text)' }}>{b.asset}</span>
              </div>
              <span className="mono text-xs" style={{ color: 'var(--text2)' }}>{b.qty.toFixed(4)}</span>
              <span className="mono text-xs font-bold" style={{ color: 'var(--text)' }}>{fmtUSD(b.usdValue)}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center gap-3">
          <DonutChart data={donutData} />
          <div className="w-full flex flex-col gap-1.5">
            {donutData.map((d: any) => (
              <div key={d.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm" style={{ background: d.color }} />
                  <span className="mono text-xs" style={{ color: 'var(--text2)' }}>{d.label}</span>
                </div>
                <span className="mono text-xs font-bold" style={{ color: 'var(--text)' }}>
                  {((d.value / portfolio.totalUSD) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AdviceBox onAnalyze={analyze} loading={advising} advice={advice} />
      <button onClick={load} className="mono text-xs px-4 py-2 rounded-lg self-start"
        style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
        ↺ Refresh
      </button>
    </div>
  )
}

function ManualPortfolio() {
  const { holdings, addHolding, removeHolding } = useStore()
  const [coin, setCoin]     = useState('')
  const [qty, setQty]       = useState('')
  const [buy, setBuy]       = useState('')
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [advice, setAdvice] = useState('')
  const [advising, setAdvising] = useState(false)

  useEffect(() => {
    if (!holdings.length) return
    const syms = holdings.map(h => h.coin + 'USDT').join(',')
    fetch(`/api/binance/market?action=prices&symbols=${syms}`)
      .then(r => r.json()).then(d => { if (d.success) setPrices(d.data) }).catch(() => {})
  }, [holdings.length])

  function add() {
    if (!coin || !qty || !buy) return
    addHolding({ coin: coin.toUpperCase(), qty: parseFloat(qty), avgBuy: parseFloat(buy), color: COLORS[holdings.length % COLORS.length] })
    setCoin(''); setQty(''); setBuy('')
  }

  const totalValue = holdings.reduce((s, h) => s + h.qty * (prices[h.coin + 'USDT'] ?? h.avgBuy), 0)
  const totalCost  = holdings.reduce((s, h) => s + h.qty * h.avgBuy, 0)
  const pnl        = totalValue - totalCost
  const pnlPct     = totalCost > 0 ? (pnl / totalCost) * 100 : 0
  const donutData  = holdings.map(h => ({ label: h.coin, value: h.qty * (prices[h.coin + 'USDT'] ?? h.avgBuy), color: h.color }))

  async function analyze() {
    if (!holdings.length) return
    setAdvising(true); setAdvice('')
    const summary = holdings.map(h => {
      const cur = prices[h.coin + 'USDT'] ?? h.avgBuy
      return `${h.coin}: ${h.qty} @ $${h.avgBuy} avg, now $${fmtPrice(cur)}`
    }).join(', ')
    try {
      await streamAdvice(
        `Portfolio: ${summary}. Total: $${totalValue.toFixed(0)}, P&L: ${pnlPct.toFixed(1)}%. Give: concentration risk, rebalancing, Binance Earn/Launchpool tips, one action this week.`,
        (t) => setAdvice(p => p + t)
      )
    } catch (e: any) { setAdvice('Error: ' + e.message) }
    setAdvising(false)
  }

  return (
    <div className="flex flex-col gap-5">
      {holdings.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Value', value: fmtUSD(totalValue), color: 'var(--yellow)' },
              { label: 'Total P&L',   value: (pnl >= 0 ? '+' : '') + fmtUSD(pnl),           color: pnl >= 0 ? 'var(--green)' : 'var(--red)' },
              { label: 'Return',      value: (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%', color: pnlPct >= 0 ? 'var(--green)' : 'var(--red)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl p-4" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                <div className="mono text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>{label}</div>
                <div className="font-extrabold mono text-xl" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-6" style={{ gridTemplateColumns: '1fr auto' }}>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="grid px-4 py-2 mono text-[10px] uppercase tracking-widest border-b"
                style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr auto', borderColor: 'var(--border)', background: 'var(--bg3)', color: 'var(--text3)' }}>
                <span>Coin</span><span>Qty</span><span>Avg Buy</span><span>P&L</span><span></span>
              </div>
              {holdings.map((h, i) => {
                const cur = prices[h.coin + 'USDT'] ?? h.avgBuy
                const p   = (cur - h.avgBuy) / h.avgBuy * 100
                return (
                  <div key={h.coin} className="grid px-4 py-2.5 border-b items-center"
                    style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr auto', borderColor: 'var(--border)', background: i % 2 === 0 ? 'var(--bg2)' : 'transparent' }}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: h.color }} />
                      <span className="mono text-xs font-bold" style={{ color: 'var(--text)' }}>{h.coin}</span>
                    </div>
                    <span className="mono text-xs" style={{ color: 'var(--text2)' }}>{h.qty}</span>
                    <span className="mono text-xs" style={{ color: 'var(--text2)' }}>${fmtPrice(h.avgBuy)}</span>
                    <span className="mono text-xs font-bold" style={{ color: p >= 0 ? 'var(--green)' : 'var(--red)' }}>{p >= 0 ? '+' : ''}{p.toFixed(2)}%</span>
                    <button onClick={() => removeHolding(h.coin)} className="mono text-sm px-2 rounded transition-all" style={{ color: 'var(--text3)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}>×</button>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-col items-center gap-3 pt-1">
              <DonutChart data={donutData} />
              <div className="w-36 flex flex-col gap-1.5">
                {donutData.map(d => (
                  <div key={d.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm" style={{ background: d.color }} />
                      <span className="mono text-[10px]" style={{ color: 'var(--text2)' }}>{d.label}</span>
                    </div>
                    <span className="mono text-[10px] font-bold" style={{ color: 'var(--text)' }}>
                      {totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
        <div className="mono text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--text3)' }}>Add Holding</div>
        <div className="flex gap-2 items-end flex-wrap">
          {[
            { p: 'BTC', v: coin, s: setCoin, l: 'Coin' },
            { p: '0.5', v: qty,  s: setQty,  l: 'Quantity' },
            { p: '40000', v: buy, s: setBuy, l: 'Avg Buy ($)' },
          ].map(({ p, v, s, l }) => (
            <div key={l} className="flex flex-col gap-1 flex-1 min-w-24">
              <span className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>{l}</span>
              <input value={v} onChange={e => s(e.target.value)} placeholder={p}
                className="mono text-xs px-3 py-2 rounded-lg outline-none"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
            </div>
          ))}
          <button onClick={add} className="px-4 py-2 rounded-lg text-xs font-bold shrink-0" style={{ background: 'var(--yellow)', color: '#000' }}>Add</button>
        </div>
      </div>

      {holdings.length > 0 && <AdviceBox onAnalyze={analyze} loading={advising} advice={advice} />}
    </div>
  )
}

export default function PortfolioTab() {
  const { isConnected, apiKey, apiSecret } = useStore()
  const [mode, setMode] = useState<'live' | 'manual'>(isConnected ? 'live' : 'manual')
  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--text)' }}>My Portfolio</h2>
          <p className="mono text-xs mt-0.5" style={{ color: 'var(--text3)' }}>{isConnected ? 'Live Binance account data' : 'Manual tracking mode'}</p>
        </div>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {[{ id: 'live', label: 'Live (Binance)', disabled: !isConnected }, { id: 'manual', label: 'Manual' }].map(({ id, label, disabled }) => (
            <button key={id} onClick={() => !disabled && setMode(id as any)} disabled={!!disabled}
              className="px-4 py-2 mono text-xs font-bold transition-all"
              style={{ background: mode === id ? 'var(--yellow)' : 'transparent', color: mode === id ? '#000' : disabled ? 'var(--text3)' : 'var(--text2)', cursor: disabled ? 'not-allowed' : 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {mode === 'live' && isConnected
        ? <LivePortfolio apiKey={apiKey} apiSecret={apiSecret} />
        : <ManualPortfolio />
      }
    </div>
  )
}
