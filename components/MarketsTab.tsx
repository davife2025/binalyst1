'use client'

import { useState, useEffect, useRef } from 'react'
import { useTickers, useOrderBook } from '@/hooks/useTicker'
import { useStore } from '@/lib/store'

const PAIRS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT']

type Kline = { t: number; o: number; h: number; l: number; c: number; v: number }

function fmtPrice(n: number) {
  if (!n) return '—'
  if (n > 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n > 1)    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return n.toFixed(6)
}

function fmtVol(n: number) {
  if (n > 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n > 1e6) return (n / 1e6).toFixed(2) + 'M'
  return (n / 1e3).toFixed(2) + 'K'
}

function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  if (data.length < 2) return <div style={{ width: 80, height: 28 }} />
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const W = 80, H = 28
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polyline points={pts} fill="none" stroke={up ? '#0ECB81' : '#F6465D'} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function CandleChart({ klines }: { klines: Kline[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !klines.length) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    canvas.width = W; canvas.height = H
    const prices = klines.flatMap(k => [k.h, k.l])
    const minP = Math.min(...prices), maxP = Math.max(...prices)
    const range = maxP - minP || 1
    const pad = { top: 16, bottom: 24, left: 8, right: 64 }
    const cW = W - pad.left - pad.right, cH = H - pad.top - pad.bottom
    const toY = (p: number) => pad.top + cH - ((p - minP) / range) * cH
    ctx.clearRect(0, 0, W, H)
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (cH / 4) * i
      ctx.strokeStyle = '#2B3139'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke()
      ctx.fillStyle = '#474D57'; ctx.font = '9px Space Mono,monospace'; ctx.textAlign = 'left'
      ctx.fillText('$' + fmtPrice(maxP - (range / 4) * i), W - pad.right + 4, y + 4)
    }
    const cw = Math.max(2, (cW / klines.length) * 0.65)
    klines.forEach((k, i) => {
      const x = pad.left + (i / klines.length) * cW + cW / klines.length / 2
      const up = k.c >= k.o, color = up ? '#0ECB81' : '#F6465D'
      ctx.strokeStyle = color; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x, toY(k.h)); ctx.lineTo(x, toY(k.l)); ctx.stroke()
      ctx.fillStyle = color
      const top = toY(Math.max(k.o, k.c)), bh = Math.max(1, Math.abs(toY(k.o) - toY(k.c)))
      ctx.fillRect(x - cw / 2, top, cw, bh)
    })
  }, [klines])
  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} />
}

function OrderBook({ symbol }: { symbol: string }) {
  const { depth } = useOrderBook(symbol)
  if (!depth) return <div className="flex items-center justify-center h-24 mono text-xs" style={{ color: 'var(--text3)' }}>Loading...</div>
  const maxQty = Math.max(...depth.bids.slice(0, 8).map(b => b[1]), ...depth.asks.slice(0, 8).map(a => a[1]))
  return (
    <div className="flex flex-col gap-0.5">
      {depth.asks.slice(0, 8).reverse().map(([p, q], i) => (
        <div key={i} className="relative flex justify-between px-2 py-0.5 rounded overflow-hidden">
          <div className="absolute inset-y-0 right-0 rounded" style={{ width: `${(q / maxQty) * 100}%`, background: 'rgba(246,70,93,0.08)' }} />
          <span className="mono text-xs relative z-10" style={{ color: 'var(--red)' }}>{fmtPrice(p)}</span>
          <span className="mono text-xs relative z-10" style={{ color: 'var(--text2)' }}>{q.toFixed(3)}</span>
        </div>
      ))}
      {depth.asks[0] && depth.bids[0] && (
        <div className="flex justify-center py-1">
          <span className="mono text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>
            spread ${(depth.asks[0][0] - depth.bids[0][0]).toFixed(2)}
          </span>
        </div>
      )}
      {depth.bids.slice(0, 8).map(([p, q], i) => (
        <div key={i} className="relative flex justify-between px-2 py-0.5 rounded overflow-hidden">
          <div className="absolute inset-y-0 right-0 rounded" style={{ width: `${(q / maxQty) * 100}%`, background: 'rgba(14,203,129,0.08)' }} />
          <span className="mono text-xs relative z-10" style={{ color: 'var(--green)' }}>{fmtPrice(p)}</span>
          <span className="mono text-xs relative z-10" style={{ color: 'var(--text2)' }}>{q.toFixed(3)}</span>
        </div>
      ))}
    </div>
  )
}

export default function MarketsTab() {
  const { tickers, status } = useTickers(PAIRS)
  const [selected, setSelected]   = useState('BTCUSDT')
  const [iv, setIv]               = useState('1h')
  const [klines, setKlines]       = useState<Kline[]>([])
  const [klineLoading, setKL]     = useState(false)
  const [sparks, setSparks]       = useState<Record<string, number[]>>({})
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis]   = useState('')
  const { apiKey, apiSecret }     = useStore()

  useEffect(() => { loadKlines() }, [selected, iv])

  useEffect(() => {
    PAIRS.forEach(async sym => {
      try {
        const r = await fetch(`/api/binance/market?action=klines&symbol=${sym}&interval=1h&limit=24`)
        const d = await r.json()
        if (d.success) setSparks(p => ({ ...p, [sym]: d.data.map((k: any) => parseFloat(k.close)) }))
      } catch {}
    })
  }, [])

  async function loadKlines() {
    setKL(true)
    try {
      const r = await fetch(`/api/binance/market?action=klines&symbol=${selected}&interval=${iv}&limit=80`)
      const d = await r.json()
      if (d.success) setKlines(d.data.map((k: any) => ({ t: k.openTime, o: parseFloat(k.open), h: parseFloat(k.high), l: parseFloat(k.low), c: parseFloat(k.close), v: parseFloat(k.volume) })))
    } catch {}
    setKL(false)
  }

  async function runAnalysis() {
    setAnalyzing(true); setAnalysis('')
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey)    headers['x-binance-key']    = apiKey
      if (apiSecret) headers['x-binance-secret'] = apiSecret
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers,
        body: JSON.stringify({ messages: [{ role: 'user', content: `Analyze ${selected} right now. Price, trend, key levels, recent news, bull and bear case. Be concise.` }], mode: 'analyst' }),
      })
      const reader = res.body?.getReader()
      const dec = new TextDecoder()
      if (!reader) return
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of dec.decode(value).split('\n').filter(l => l.startsWith('data: '))) {
          try { const j = JSON.parse(line.slice(6)); if (j.type === 'text') setAnalysis(p => p + j.text) } catch {}
        }
      }
    } catch (e: any) { setAnalysis('Error: ' + e.message) }
    setAnalyzing(false)
  }

  const ticker = tickers[selected]
  const coinName = selected.replace('USDT', '')

  return (
    <div className="flex h-full overflow-hidden">

      {/* Watchlist */}
      <div className="w-52 shrink-0 flex flex-col border-r overflow-y-auto" style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <span className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Watchlist</span>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: status === 'connected' ? 'var(--green)' : 'var(--yellow)', animation: 'blink 2s infinite' }} />
        </div>
        {PAIRS.map(sym => {
          const t = tickers[sym], up = (t?.changePct ?? 0) >= 0, active = selected === sym
          return (
            <button key={sym} onClick={() => setSelected(sym)} className="px-4 py-3 text-left transition-all border-b" style={{ background: active ? 'var(--yellow-glow)' : 'transparent', borderColor: 'var(--border)', borderLeft: active ? '2px solid var(--yellow)' : '2px solid transparent' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="mono text-xs font-bold" style={{ color: active ? 'var(--yellow)' : 'var(--text)' }}>{sym.replace('USDT', '')}</span>
                {t && <span className="mono text-[10px] font-bold" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>{up ? '+' : ''}{t.changePct.toFixed(2)}%</span>}
              </div>
              <div className="flex items-center justify-between">
                <span className="mono text-xs" style={{ color: 'var(--text2)' }}>{t ? '$' + fmtPrice(t.price) : '—'}</span>
                <Sparkline data={sparks[sym] ?? []} up={up} />
              </div>
            </button>
          )
        })}
      </div>

      {/* Main chart area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

        {/* Ticker header */}
        <div className="flex items-center gap-6 px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <div className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>{coinName}<span style={{ color: 'var(--text3)' }}>/USDT</span></div>
            <div className="mono text-xs mt-0.5" style={{ color: 'var(--text3)' }}>Binance Spot · Live</div>
          </div>
          {ticker ? (
            <>
              <div>
                <div className="mono text-2xl font-bold" style={{ color: 'var(--text)' }}>${fmtPrice(ticker.price)}</div>
                <div className="mono text-xs font-bold" style={{ color: ticker.changePct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {ticker.changePct >= 0 ? '+' : ''}{ticker.changePct.toFixed(2)}% (${ticker.change >= 0 ? '+' : ''}{fmtPrice(Math.abs(ticker.change))})
                </div>
              </div>
              <div className="flex gap-6 ml-4">
                {[['24h High', '$' + fmtPrice(ticker.high)], ['24h Low', '$' + fmtPrice(ticker.low)], ['Volume', fmtVol(ticker.quoteVolume) + ' USDT']].map(([l, v]) => (
                  <div key={l}>
                    <div className="mono text-[10px]" style={{ color: 'var(--text3)' }}>{l}</div>
                    <div className="mono text-xs font-bold" style={{ color: 'var(--text2)' }}>{v}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="mono text-sm" style={{ color: 'var(--text3)' }}>Connecting to Binance stream...</div>
          )}
        </div>

        {/* Interval tabs */}
        <div className="flex items-center gap-2 px-6 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          {['15m', '1h', '4h', '1d'].map(i => (
            <button key={i} onClick={() => setIv(i)} className="mono text-xs px-3 py-1 rounded transition-all" style={{ background: iv === i ? 'var(--yellow)' : 'transparent', color: iv === i ? '#000' : 'var(--text3)' }}>{i}</button>
          ))}
          {klineLoading && <span className="w-3 h-3 rounded-full border-2 animate-spin-slow ml-2" style={{ borderColor: 'var(--text3)', borderTopColor: 'var(--yellow)' }} />}
        </div>

        {/* Chart */}
        <div className="px-4 pt-4 shrink-0" style={{ height: 260 }}>
          {klines.length > 0 ? <CandleChart klines={klines} /> : (
            <div className="flex items-center justify-center h-full mono text-xs" style={{ color: 'var(--text3)' }}>Loading chart...</div>
          )}
        </div>

        {/* AI Analysis */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>AI Analysis</span>
            <button onClick={runAnalysis} disabled={analyzing} className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all" style={{ background: analyzing ? 'var(--bg4)' : 'var(--yellow)', color: analyzing ? 'var(--text3)' : '#000', cursor: analyzing ? 'not-allowed' : 'pointer' }}>
              {analyzing && <span className="w-3 h-3 rounded-full border-2 border-black/30 border-t-black animate-spin-slow" />}
              {analyzing ? 'Analyzing...' : `Analyze ${coinName}`}
            </button>
          </div>
          {analysis ? (
            <div className="rounded-xl p-4 text-sm leading-relaxed" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', whiteSpace: 'pre-wrap' }}
              dangerouslySetInnerHTML={{ __html: analysis.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--yellow)">$1</strong>') }} />
          ) : (
            <div className="rounded-xl p-4 flex items-center justify-center mono text-xs" style={{ background: 'var(--bg2)', border: '1px dashed var(--border)', color: 'var(--text3)', minHeight: 72 }}>
              Click "Analyze {coinName}" for AI-powered market analysis
            </div>
          )}
        </div>
      </div>

      {/* Order book */}
      <div className="w-52 shrink-0 border-l flex flex-col" style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Order Book</div>
          <div className="flex justify-between mt-1">
            <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>Price (USDT)</span>
            <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>Amount</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <OrderBook symbol={selected} />
        </div>
      </div>
    </div>
  )
}
