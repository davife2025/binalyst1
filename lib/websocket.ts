'use client'

/**
 * lib/websocket.ts
 * Binance WebSocket stream manager.
 * Handles connection, auto-reconnect, and multi-stream subscriptions.
 * Used client-side only — Binance public streams need no auth.
 */

type TickerData = {
  symbol: string
  price: number
  change: number
  changePct: number
  high: number
  low: number
  volume: number
  quoteVolume: number
}

type TradeData = {
  symbol: string
  price: number
  qty: number
  isBuyerMaker: boolean
  time: number
}

type DepthData = {
  symbol: string
  bids: [number, number][]
  asks: [number, number][]
}

type StreamCallback<T> = (data: T) => void

const WS_BASE = 'wss://stream.binance.com:9443/ws'
const RECONNECT_DELAY = 3000
const MAX_RECONNECTS = 10

class BinanceWebSocket {
  private ws: WebSocket | null = null
  private url: string
  private reconnects = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private onMessage: (data: any) => void
  private onStatus: (status: 'connecting' | 'connected' | 'disconnected') => void
  private dead = false

  constructor(
    url: string,
    onMessage: (data: any) => void,
    onStatus: (status: 'connecting' | 'connected' | 'disconnected') => void
  ) {
    this.url = url
    this.onMessage = onMessage
    this.onStatus = onStatus
    this.connect()
  }

  private connect() {
    if (this.dead) return
    this.onStatus('connecting')
    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      this.reconnects = 0
      this.onStatus('connected')
    }

    this.ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(e.data))
      } catch {}
    }

    this.ws.onclose = () => {
      if (this.dead) return
      this.onStatus('disconnected')
      if (this.reconnects < MAX_RECONNECTS) {
        this.reconnects++
        this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY)
      }
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  close() {
    this.dead = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream builders
// ─────────────────────────────────────────────────────────────────────────────

export function createTickerStream(
  symbols: string[],
  onTick: StreamCallback<TickerData>,
  onStatus?: (s: 'connecting' | 'connected' | 'disconnected') => void
) {
  const streams = symbols.map(s => `${s.toLowerCase()}@ticker`).join('/')
  const url = `${WS_BASE}/${streams}`

  return new BinanceWebSocket(
    url,
    (data) => {
      // Combined stream wraps in { stream, data }
      const d = data.data ?? data
      onTick({
        symbol:      d.s,
        price:       parseFloat(d.c),
        change:      parseFloat(d.p),
        changePct:   parseFloat(d.P),
        high:        parseFloat(d.h),
        low:         parseFloat(d.l),
        volume:      parseFloat(d.v),
        quoteVolume: parseFloat(d.q),
      })
    },
    onStatus ?? (() => {})
  )
}

export function createTradeStream(
  symbol: string,
  onTrade: StreamCallback<TradeData>,
  onStatus?: (s: 'connecting' | 'connected' | 'disconnected') => void
) {
  const url = `${WS_BASE}/${symbol.toLowerCase()}@aggTrade`

  return new BinanceWebSocket(
    url,
    (data) => {
      onTrade({
        symbol:        data.s,
        price:         parseFloat(data.p),
        qty:           parseFloat(data.q),
        isBuyerMaker:  data.m,
        time:          data.T,
      })
    },
    onStatus ?? (() => {})
  )
}

export function createDepthStream(
  symbol: string,
  onDepth: StreamCallback<DepthData>,
  onStatus?: (s: 'connecting' | 'connected' | 'disconnected') => void
) {
  const url = `${WS_BASE}/${symbol.toLowerCase()}@depth10@1000ms`

  return new BinanceWebSocket(
    url,
    (data) => {
      onDepth({
        symbol,
        bids: (data.bids ?? []).map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
        asks: (data.asks ?? []).map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
      })
    },
    onStatus ?? (() => {})
  )
}

export type { TickerData, TradeData, DepthData }
