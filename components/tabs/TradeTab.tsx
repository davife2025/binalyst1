'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'

type OrderSide = 'BUY' | 'SELL'
type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LOSS_LIMIT'

type OrderForm = {
  symbol: string
  side: OrderSide
  type: OrderType
  quantity: string
  quoteOrderQty: string
  price: string
  stopPrice: string
  useQuote: boolean
}

type OrderResult = {
  orderId?: number
  symbol?: string
  side?: string
  type?: string
  origQty?: string
  price?: string
  status?: string
  transactTime?: number
  requiresConfirmation?: boolean
  order?: any
  message?: string
}

const PAIRS = ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','DOTUSDT']

function fmtPrice(n: number) {
  if (!n) return '—'
  if (n > 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n > 1)    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return n.toFixed(6)
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Confirm Modal ────────────────────────────────────────────────────────────
function ConfirmModal({
  order, onConfirm, onCancel, confirming,
}: {
  order: OrderForm; onConfirm: () => void; onCancel: () => void; confirming: boolean
}) {
  const isBuy = order.side === 'BUY'
  const rows = [
    { label: 'Symbol',     value: order.symbol },
    { label: 'Side',       value: order.side, color: isBuy ? 'var(--green)' : 'var(--red)' },
    { label: 'Order type', value: order.type },
    ...(order.useQuote && order.type === 'MARKET'
      ? [{ label: 'Spend (USDT)', value: '$' + order.quoteOrderQty }]
      : [{ label: 'Quantity',     value: order.quantity + ' ' + order.symbol.replace('USDT', '') }]
    ),
    ...(order.type !== 'MARKET' ? [{ label: 'Limit price', value: '$' + order.price }] : []),
    ...(order.type === 'STOP_LOSS_LIMIT' ? [{ label: 'Stop price', value: '$' + order.stopPrice }] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-2xl p-6 w-full max-w-sm mx-4 flex flex-col gap-5"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ background: isBuy ? 'rgba(14,203,129,0.15)' : 'rgba(246,70,93,0.15)' }}>
            {isBuy ? '↑' : '↓'}
          </div>
          <div>
            <div className="font-extrabold text-base" style={{ color: 'var(--text)' }}>Confirm Order</div>
            <div className="mono text-xs" style={{ color: 'var(--text3)' }}>Review before submitting to Binance</div>
          </div>
        </div>

        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {rows.map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0"
              style={{ borderColor: 'var(--border)', background: 'var(--bg3)' }}>
              <span className="mono text-xs" style={{ color: 'var(--text3)' }}>{label}</span>
              <span className="mono text-xs font-bold" style={{ color: color ?? 'var(--text)' }}>{value}</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl p-3 mono text-xs" style={{ background: 'rgba(240,185,11,0.08)', border: '1px solid rgba(240,185,11,0.2)', color: 'var(--yellow)' }}>
          ⚠ This will place a real order on Binance. This action cannot be undone.
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} disabled={confirming}
            className="flex-1 py-2.5 rounded-xl mono text-sm font-bold transition-all"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={confirming}
            className="flex-1 py-2.5 rounded-xl mono text-sm font-bold flex items-center justify-center gap-2 transition-all"
            style={{ background: isBuy ? 'var(--green)' : 'var(--red)', color: '#fff', cursor: confirming ? 'not-allowed' : 'pointer', opacity: confirming ? 0.7 : 1 }}>
            {confirming && <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" />}
            {confirming ? 'Placing...' : `Confirm ${order.side}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Order Form ───────────────────────────────────────────────────────────────
function OrderForm_({ apiKey, apiSecret, autoTradeEnabled }: { apiKey: string; apiSecret: string; autoTradeEnabled: boolean }) {
  const [form, setForm] = useState<OrderForm>({
    symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET',
    quantity: '', quoteOrderQty: '', price: '', stopPrice: '', useQuote: true,
  })
  const [livePrice, setLivePrice]     = useState<number | null>(null)
  const [validating, setValidating]   = useState(false)
  const [validation, setValidation]   = useState<{ ok: boolean; msg: string } | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirming, setConfirming]   = useState(false)
  const [result, setResult]           = useState<OrderResult | null>(null)

  // Fetch live price when symbol changes
  useEffect(() => {
    setLivePrice(null); setValidation(null)
    fetch(`/api/binance/market?action=ticker&symbol=${form.symbol}`)
      .then(r => r.json())
      .then(d => { if (d.success) setLivePrice(d.data.price) })
      .catch(() => {})
  }, [form.symbol])

  function update(patch: Partial<OrderForm>) {
    setForm(prev => ({ ...prev, ...patch }))
    setValidation(null); setResult(null)
  }

  function buildOrderPayload() {
    const o: any = { symbol: form.symbol, side: form.side, type: form.type }
    if (form.type === 'MARKET') {
      if (form.useQuote && form.side === 'BUY') o.quoteOrderQty = parseFloat(form.quoteOrderQty)
      else o.quantity = parseFloat(form.quantity)
    } else {
      o.quantity = parseFloat(form.quantity)
      o.price    = parseFloat(form.price)
      o.timeInForce = 'GTC'
      if (form.type === 'STOP_LOSS_LIMIT') o.stopPrice = parseFloat(form.stopPrice)
    }
    return o
  }

  async function validate() {
    setValidating(true); setValidation(null)
    try {
      const res = await fetch('/api/binance/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-binance-key': apiKey, 'x-binance-secret': apiSecret },
        body: JSON.stringify({ action: 'validate', order: buildOrderPayload() }),
      })
      const d = await res.json()
      setValidation(d.success
        ? { ok: true, msg: 'Order is valid ✓' }
        : { ok: false, msg: d.error ?? 'Validation failed' }
      )
    } catch (e: any) { setValidation({ ok: false, msg: e.message }) }
    setValidating(false)
  }

  async function executeOrder() {
    setConfirming(true)
    try {
      const res = await fetch('/api/binance/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-binance-key': apiKey, 'x-binance-secret': apiSecret },
        body: JSON.stringify({ action: 'place', order: buildOrderPayload(), dryRun: false }),
      })
      const d = await res.json()
      setShowConfirm(false)
      setResult(d.success ? d.data : { message: d.error })
    } catch (e: any) { setResult({ message: e.message }) }
    setConfirming(false)
  }

  const estValue = livePrice && form.quantity
    ? livePrice * parseFloat(form.quantity || '0')
    : form.quoteOrderQty ? parseFloat(form.quoteOrderQty) : null

  return (
    <>
      {showConfirm && (
        <ConfirmModal order={form} onConfirm={executeOrder} onCancel={() => setShowConfirm(false)} confirming={confirming} />
      )}

      <div className="flex flex-col gap-4">

        {/* Symbol + Side */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Symbol</Label>
            <select value={form.symbol} onChange={e => update({ symbol: e.target.value })}
              className="w-full mono text-sm px-3 py-2.5 rounded-xl outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}>
              {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <Label>Order type</Label>
            <select value={form.type} onChange={e => update({ type: e.target.value as OrderType })}
              className="w-full mono text-sm px-3 py-2.5 rounded-xl outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}>
              <option value="MARKET">Market</option>
              <option value="LIMIT">Limit</option>
              <option value="STOP_LOSS_LIMIT">Stop-Limit</option>
            </select>
          </div>
        </div>

        {/* Buy / Sell toggle */}
        <div className="grid grid-cols-2 gap-2">
          {(['BUY', 'SELL'] as OrderSide[]).map(s => (
            <button key={s} onClick={() => update({ side: s })}
              className="py-3 rounded-xl font-extrabold text-sm transition-all"
              style={{
                background: form.side === s ? (s === 'BUY' ? 'var(--green)' : 'var(--red)') : 'var(--bg3)',
                color: form.side === s ? '#fff' : 'var(--text2)',
                border: form.side === s ? 'none' : '1px solid var(--border)',
              }}>
              {s}
            </button>
          ))}
        </div>

        {/* Live price */}
        {livePrice && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg3)' }}>
            <span className="mono text-xs" style={{ color: 'var(--text3)' }}>Live price</span>
            <span className="mono text-sm font-bold" style={{ color: 'var(--yellow)' }}>${fmtPrice(livePrice)}</span>
          </div>
        )}

        {/* Amount fields */}
        {form.type === 'MARKET' && form.side === 'BUY' && (
          <div className="flex gap-2 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {[{ label: 'By USDT', val: true }, { label: 'By Qty', val: false }].map(({ label, val }) => (
              <button key={label} onClick={() => update({ useQuote: val })}
                className="flex-1 py-2 mono text-xs font-bold transition-all"
                style={{ background: form.useQuote === val ? 'var(--yellow)' : 'transparent', color: form.useQuote === val ? '#000' : 'var(--text3)' }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {form.type === 'MARKET' && form.side === 'BUY' && form.useQuote ? (
          <div>
            <Label>Amount (USDT)</Label>
            <Input placeholder="e.g. 100" value={form.quoteOrderQty} onChange={v => update({ quoteOrderQty: v })} />
          </div>
        ) : (
          <div>
            <Label>Quantity ({form.symbol.replace('USDT', '')})</Label>
            <Input placeholder={form.symbol === 'BTCUSDT' ? 'e.g. 0.001' : 'e.g. 0.1'} value={form.quantity} onChange={v => update({ quantity: v })} />
          </div>
        )}

        {form.type !== 'MARKET' && (
          <div>
            <Label>Limit Price (USDT)</Label>
            <Input placeholder={livePrice ? `e.g. ${fmtPrice(livePrice)}` : 'Enter price'} value={form.price} onChange={v => update({ price: v })} />
          </div>
        )}

        {form.type === 'STOP_LOSS_LIMIT' && (
          <div>
            <Label>Stop Price (USDT)</Label>
            <Input placeholder="Trigger price" value={form.stopPrice} onChange={v => update({ stopPrice: v })} />
          </div>
        )}

        {/* Estimated value */}
        {estValue && estValue > 0 && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg3)' }}>
            <span className="mono text-xs" style={{ color: 'var(--text3)' }}>Estimated value</span>
            <span className="mono text-sm font-bold" style={{ color: 'var(--text)' }}>~${estValue.toFixed(2)} USDT</span>
          </div>
        )}

        {/* Validation result */}
        {validation && (
          <div className="rounded-xl p-3 mono text-xs"
            style={{
              background: validation.ok ? 'rgba(14,203,129,0.08)' : 'rgba(246,70,93,0.08)',
              border: `1px solid ${validation.ok ? 'rgba(14,203,129,0.25)' : 'rgba(246,70,93,0.25)'}`,
              color: validation.ok ? 'var(--green)' : 'var(--red)',
            }}>
            {validation.msg}
          </div>
        )}

        {/* Order result */}
        {result && (
          <div className="rounded-xl p-3 mono text-xs"
            style={{
              background: result.orderId ? 'rgba(14,203,129,0.08)' : 'rgba(246,70,93,0.08)',
              border: `1px solid ${result.orderId ? 'rgba(14,203,129,0.25)' : 'rgba(246,70,93,0.25)'}`,
              color: result.orderId ? 'var(--green)' : 'var(--red)',
            }}>
            {result.orderId
              ? `✓ Order placed! ID: ${result.orderId} · Status: ${result.status}`
              : `Error: ${result.message}`
            }
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button onClick={validate} disabled={validating}
            className="flex-1 py-2.5 rounded-xl mono text-sm font-bold flex items-center justify-center gap-2 transition-all"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text2)', cursor: validating ? 'not-allowed' : 'pointer' }}>
            {validating && <span className="w-3 h-3 rounded-full border-2 animate-spin-slow" style={{ borderColor: 'var(--border2)', borderTopColor: 'var(--yellow)' }} />}
            {validating ? 'Validating...' : 'Dry Run'}
          </button>
          <button
            onClick={() => { if (validation?.ok) setShowConfirm(true); else validate().then(() => {}) }}
            disabled={!autoTradeEnabled}
            className="flex-1 py-2.5 rounded-xl mono text-sm font-bold transition-all"
            style={{
              background: autoTradeEnabled
                ? (form.side === 'BUY' ? 'var(--green)' : 'var(--red)')
                : 'var(--bg4)',
              color: autoTradeEnabled ? '#fff' : 'var(--text3)',
              cursor: autoTradeEnabled ? 'pointer' : 'not-allowed',
            }}>
            {autoTradeEnabled ? `Place ${form.side}` : 'Enable auto-trade'}
          </button>
        </div>

        {!autoTradeEnabled && (
          <div className="mono text-[10px] text-center" style={{ color: 'var(--text3)' }}>
            Enable auto-trade in Settings to place real orders
          </div>
        )}
      </div>
    </>
  )
}

// ── Open Orders ──────────────────────────────────────────────────────────────
function OpenOrders({ apiKey, apiSecret }: { apiKey: string; apiSecret: string }) {
  const [orders, setOrders]   = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [cancelling, setCancelling] = useState<number | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/binance/account?action=open-orders', {
        headers: { 'x-binance-key': apiKey, 'x-binance-secret': apiSecret },
      })
      const d = await res.json()
      if (d.success) setOrders(d.data)
    } catch {}
    setLoading(false)
  }

  async function cancel(symbol: string, orderId: number) {
    setCancelling(orderId)
    try {
      await fetch('/api/binance/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-binance-key': apiKey, 'x-binance-secret': apiSecret },
        body: JSON.stringify({ action: 'cancel', symbol, orderId }),
      })
      setOrders(prev => prev.filter(o => o.orderId !== orderId))
    } catch {}
    setCancelling(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-8 gap-2" style={{ color: 'var(--text3)' }}>
      <span className="w-4 h-4 rounded-full border-2 animate-spin-slow" style={{ borderColor: 'var(--border2)', borderTopColor: 'var(--yellow)' }} />
      <span className="mono text-xs">Loading orders...</span>
    </div>
  )

  if (!orders.length) return (
    <div className="flex flex-col items-center justify-center py-8 gap-2" style={{ color: 'var(--text3)' }}>
      <div className="text-3xl opacity-30">◎</div>
      <div className="mono text-xs">No open orders</div>
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      {orders.map(o => (
        <div key={o.orderId} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <span className="mono text-xs font-bold px-2 py-0.5 rounded"
              style={{ background: o.side === 'BUY' ? 'rgba(14,203,129,0.12)' : 'rgba(246,70,93,0.12)', color: o.side === 'BUY' ? 'var(--green)' : 'var(--red)' }}>
              {o.side}
            </span>
            <div>
              <div className="mono text-xs font-bold" style={{ color: 'var(--text)' }}>{o.symbol}</div>
              <div className="mono text-[10px]" style={{ color: 'var(--text3)' }}>
                {o.type} · {parseFloat(o.origQty).toFixed(4)} @ ${parseFloat(o.price).toLocaleString()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="mono text-[10px] text-right" style={{ color: 'var(--text3)' }}>
              #{o.orderId}<br />{fmtTime(o.time)}
            </div>
            <button onClick={() => cancel(o.symbol, o.orderId)} disabled={cancelling === o.orderId}
              className="mono text-xs px-3 py-1.5 rounded-lg transition-all"
              style={{ background: 'rgba(246,70,93,0.08)', border: '1px solid rgba(246,70,93,0.2)', color: 'var(--red)', cursor: cancelling === o.orderId ? 'not-allowed' : 'pointer' }}>
              {cancelling === o.orderId ? '...' : 'Cancel'}
            </button>
          </div>
        </div>
      ))}
      <button onClick={load} className="mono text-xs py-2 rounded-lg mt-1"
        style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
        ↺ Refresh
      </button>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <div className="mono text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--text3)' }}>{children}</div>
}
function Input({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input type="number" step="any" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
      className="w-full mono text-sm px-3 py-2.5 rounded-xl outline-none"
      style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}
      onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
      onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function TradeTab() {
  const { isConnected, apiKey, apiSecret, autoTradeEnabled, setActiveTab } = useStore()
  const [panel, setPanel] = useState<'trade' | 'orders'>('trade')

  if (!isConnected) return (
    <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-6">
      <div className="text-5xl opacity-40">🔑</div>
      <div>
        <h2 className="text-lg font-extrabold mb-2" style={{ color: 'var(--text)' }}>API Key Required</h2>
        <p className="mono text-xs max-w-xs" style={{ color: 'var(--text3)' }}>
          Connect your Binance API key in Settings to access the trading terminal.
        </p>
      </div>
      <button onClick={() => setActiveTab('settings')}
        className="px-6 py-2.5 rounded-xl font-bold text-sm"
        style={{ background: 'var(--yellow)', color: '#000' }}>
        Go to Settings
      </button>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-6 py-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--text)' }}>Trading Terminal</h2>
          <p className="mono text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
            Spot trading via Binance API · All orders validated before execution
          </p>
        </div>
        {autoTradeEnabled && (
          <div className="mono text-[10px] px-3 py-1.5 rounded-full flex items-center gap-1.5"
            style={{ background: 'rgba(246,70,93,0.1)', border: '1px solid rgba(246,70,93,0.3)', color: 'var(--red)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--red)', animation: 'blink 1.5s infinite' }} />
            LIVE TRADING
          </div>
        )}
      </div>

      {/* Panel tabs */}
      <div className="flex rounded-xl overflow-hidden mb-6" style={{ border: '1px solid var(--border)' }}>
        {[{ id: 'trade', label: 'Place Order' }, { id: 'orders', label: 'Open Orders' }].map(({ id, label }) => (
          <button key={id} onClick={() => setPanel(id as any)}
            className="flex-1 py-2.5 mono text-sm font-bold transition-all"
            style={{ background: panel === id ? 'var(--yellow)' : 'transparent', color: panel === id ? '#000' : 'var(--text2)' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Testnet notice */}
      <div className="rounded-xl p-3 mb-5 mono text-[10px]"
        style={{ background: 'rgba(240,185,11,0.06)', border: '1px solid rgba(240,185,11,0.15)', color: 'var(--yellow)' }}>
        💡 Use Binance Testnet keys first to trial without real funds — toggle in Settings when ready to go live.
      </div>

      {panel === 'trade'
        ? <OrderForm_ apiKey={apiKey} apiSecret={apiSecret} autoTradeEnabled={autoTradeEnabled} />
        : <OpenOrders apiKey={apiKey} apiSecret={apiSecret} />
      }
    </div>
  )
}
