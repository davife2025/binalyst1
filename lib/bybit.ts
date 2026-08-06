/**
 * lib/bybit.ts — Session N1 (new file)
 *
 * Bybit V5 REST API client — market data layer for the Mantle AI Trading Agent.
 * Part of: The Turing Test Hackathon — AI Trading & Strategy track.
 *
 * This is a READ-ONLY data layer. It does NOT execute trades on Bybit —
 * trades are executed on-chain on Mantle via lib/mantle/client.ts.
 * Bybit is used purely for price feeds, OHLCV candles, and order book
 * data to feed the signal engine.
 *
 * This file is entirely new and does not import from or modify any
 * existing Binalyst files. The Binance client (lib/binance.ts) and all
 * other existing data sources are completely untouched.
 *
 * Bybit V5 API docs: https://bybit-exchange.github.io/docs/v5/intro
 * Base URL: https://api.bybit.com (no auth required for market data)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const BYBIT_BASE_URL    = 'https://api.bybit.com'
export const BYBIT_V5_MARKET   = `${BYBIT_BASE_URL}/v5/market`
export const BYBIT_REQUEST_TIMEOUT = 8000  // 8 seconds

// Mantle-focused default pairs
export const BYBIT_DEFAULT_PAIRS = [
  'MNTUSDT',
  'ETHUSDT',
  'BTCUSDT',
  'BNBUSDT',
  'SOLUSDT',
]

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BybitTicker {
  symbol:         string
  lastPrice:      number
  indexPrice:     number
  markPrice:      number
  prevPrice24h:   number
  price24hPcnt:   number   // e.g. 0.0342 = +3.42%
  highPrice24h:   number
  lowPrice24h:    number
  volume24h:      number   // base asset volume
  turnover24h:    number   // USDT volume
  bid1Price:      number
  ask1Price:      number
  bid1Size:       number
  ask1Size:       number
  openInterest?:  number
  fundingRate?:   number
  nextFundingTime?: number
}

export interface BybitCandle {
  openTime:  number   // Unix timestamp ms
  open:      number
  high:      number
  low:       number
  close:     number
  volume:    number   // base asset
  turnover:  number   // quote asset (USDT)
}

export type BybitInterval =
  | '1'   | '3'   | '5'   | '15'  | '30'  // minutes
  | '60'  | '120' | '240' | '360' | '720' // minutes (1h/2h/4h/6h/12h)
  | 'D'   | 'W'   | 'M'                   // day/week/month

export interface BybitOrderBook {
  symbol:     string
  bids:       [number, number][]   // [price, size]
  asks:       [number, number][]
  timestamp:  number
}

export interface BybitPriceMap {
  [symbol: string]: number   // symbol → last price in USDT
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal fetch helper
// ─────────────────────────────────────────────────────────────────────────────

async function bybitFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url    = new URL(`${BYBIT_V5_MARKET}${path}`)
  const search = new URLSearchParams(params)
  url.search   = search.toString()

  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), BYBIT_REQUEST_TIMEOUT)

  try {
    const res  = await fetch(url.toString(), { signal: controller.signal })
    const json = await res.json()

    if (json.retCode !== 0) {
      throw new Error(`Bybit API error ${json.retCode}: ${json.retMsg}`)
    }

    return json.result as T
  } finally {
    clearTimeout(timer)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticker (single & batch)
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch ticker for a single symbol (SPOT category). */
export async function getBybitTicker(symbol: string): Promise<BybitTicker | null> {
  try {
    const result = await bybitFetch<{ list: any[] }>('/tickers', {
      category: 'spot',
      symbol,
    })

    const raw = result.list?.[0]
    if (!raw) return null

    return parseTicker(raw)
  } catch {
    return null
  }
}

/** Fetch tickers for multiple symbols in one call (SPOT). */
export async function getBybitTickers(symbols: string[]): Promise<BybitTicker[]> {
  try {
    // Bybit SPOT /tickers with no symbol returns ALL tickers
    const result = await bybitFetch<{ list: any[] }>('/tickers', {
      category: 'spot',
    })

    const symbolSet = new Set(symbols)
    return (result.list ?? [])
      .filter((r: any) => symbolSet.has(r.symbol))
      .map(parseTicker)
  } catch {
    return []
  }
}

/** Build a price map from a list of Bybit tickers. */
export function tickersToPriceMap(tickers: BybitTicker[]): BybitPriceMap {
  const map: BybitPriceMap = {}
  for (const t of tickers) {
    map[t.symbol] = t.lastPrice
  }
  return map
}

/**
 * Get a simplified token → USD price map for Mantle tokens.
 * Strips 'USDT' suffix and maps to bare token symbol.
 * e.g. { MNT: 0.72, ETH: 3820, BTC: 68000, USDC: 1, USDT: 1 }
 */
export async function getMantlePrices(
  pairs: string[] = BYBIT_DEFAULT_PAIRS,
): Promise<Record<string, number>> {
  const tickers = await getBybitTickers(pairs)
  const prices: Record<string, number> = {
    USDC: 1,
    USDT: 1,
    USDY: 1,   // USDY ≈ $1 + yield — treat as $1 for portfolio valuation
  }

  for (const t of tickers) {
    const base = t.symbol.replace(/USDT$/, '')
    prices[base] = t.lastPrice
  }

  // mETH price ≈ ETH price (staked ETH, trades near parity)
  if (prices['ETH']) prices['mETH'] = prices['ETH']

  return prices
}

// ─────────────────────────────────────────────────────────────────────────────
// OHLCV Candles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch OHLCV candles from Bybit (SPOT category).
 * Returns most recent `limit` candles, newest last.
 */
export async function getBybitCandles(
  symbol:   string,
  interval: BybitInterval = '60',
  limit:    number        = 200,
): Promise<BybitCandle[]> {
  try {
    const result = await bybitFetch<{ list: string[][] }>('/kline', {
      category: 'spot',
      symbol,
      interval,
      limit:    String(Math.min(limit, 1000)),
    })

    // Bybit returns newest first — reverse to oldest first
    const candles = (result.list ?? [])
      .map(parseCandle)
      .reverse()

    return candles
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Book
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch order book (top N levels). */
export async function getBybitOrderBook(
  symbol: string,
  limit:  number = 25,
): Promise<BybitOrderBook | null> {
  try {
    const result = await bybitFetch<{ b: string[][]; a: string[][]; ts: number }>('/orderbook', {
      category: 'spot',
      symbol,
      limit:    String(Math.min(limit, 200)),
    })

    return {
      symbol,
      bids:      (result.b ?? []).map(([p, s]) => [parseFloat(p), parseFloat(s)]),
      asks:      (result.a ?? []).map(([p, s]) => [parseFloat(p), parseFloat(s)]),
      timestamp: result.ts ?? Date.now(),
    }
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Market movers (for signal engine input)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get top gainers / losers from SPOT market (filtered to USDT pairs).
 * Useful as an alternative to CMC signals when CMC key is not configured.
 */
export async function getBybitMarketMovers(limit = 20): Promise<{
  gainers: BybitTicker[]
  losers:  BybitTicker[]
}> {
  try {
    const result = await bybitFetch<{ list: any[] }>('/tickers', {
      category: 'spot',
    })

    const usdt = (result.list ?? [])
      .filter((r: any) => r.symbol.endsWith('USDT') && parseFloat(r.turnover24h) > 100_000)
      .map(parseTicker)

    const sorted    = [...usdt].sort((a, b) => b.price24hPcnt - a.price24hPcnt)
    const gainers   = sorted.slice(0, limit)
    const losers    = sorted.slice(-limit).reverse()

    return { gainers, losers }
  } catch {
    return { gainers: [], losers: [] }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive a simple signal score (0–100) from a Bybit ticker.
 * This is a lightweight signal — the full signal engine in lib/signalEngine.ts
 * provides the comprehensive version. This is used in the Mantle agent loop
 * for fast Bybit-native signals without CMC dependency.
 */
export function bybitTickerToSignalScore(ticker: BybitTicker): {
  score:     number
  direction: 'BUY' | 'SELL' | 'HOLD'
  reasoning: string
} {
  let score = 50  // neutral baseline

  const pct24h   = ticker.price24hPcnt * 100  // convert to percentage
  const spread   = ticker.ask1Price > 0
    ? ((ticker.ask1Price - ticker.bid1Price) / ticker.ask1Price) * 100
    : 0

  // Momentum component (±20 points)
  if (pct24h > 5)        score += 20
  else if (pct24h > 2)   score += 12
  else if (pct24h > 0)   score += 5
  else if (pct24h < -5)  score -= 20
  else if (pct24h < -2)  score -= 12
  else if (pct24h < 0)   score -= 5

  // Price position vs 24h range (±15 points)
  const range  = ticker.highPrice24h - ticker.lowPrice24h
  if (range > 0) {
    const position = (ticker.lastPrice - ticker.lowPrice24h) / range  // 0=at low, 1=at high
    if (position > 0.8)       score += 15   // near high — strength
    else if (position > 0.6)  score += 8
    else if (position < 0.2)  score -= 15   // near low — weakness
    else if (position < 0.4)  score -= 8
  }

  // Spread (−5 points if wide — low liquidity)
  if (spread > 0.5) score -= 5

  score = Math.max(0, Math.min(100, score))

  const direction = score >= 65 ? 'BUY' : score <= 35 ? 'SELL' : 'HOLD'
  const reasoning = `Bybit: ${pct24h >= 0 ? '+' : ''}${pct24h.toFixed(2)}% 24h, price $${ticker.lastPrice.toFixed(4)}, score ${score}`

  return { score, direction, reasoning }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsers
// ─────────────────────────────────────────────────────────────────────────────

function parseTicker(raw: any): BybitTicker {
  return {
    symbol:       raw.symbol ?? '',
    lastPrice:    parseFloat(raw.lastPrice ?? '0'),
    indexPrice:   parseFloat(raw.indexPrice ?? raw.lastPrice ?? '0'),
    markPrice:    parseFloat(raw.markPrice  ?? raw.lastPrice ?? '0'),
    prevPrice24h: parseFloat(raw.prevPrice24h ?? '0'),
    price24hPcnt: parseFloat(raw.price24hPcnt ?? '0'),
    highPrice24h: parseFloat(raw.highPrice24h ?? '0'),
    lowPrice24h:  parseFloat(raw.lowPrice24h  ?? '0'),
    volume24h:    parseFloat(raw.volume24h    ?? '0'),
    turnover24h:  parseFloat(raw.turnover24h  ?? '0'),
    bid1Price:    parseFloat(raw.bid1Price    ?? '0'),
    ask1Price:    parseFloat(raw.ask1Price    ?? '0'),
    bid1Size:     parseFloat(raw.bid1Size     ?? '0'),
    ask1Size:     parseFloat(raw.ask1Size     ?? '0'),
    openInterest:   raw.openInterest   ? parseFloat(raw.openInterest)   : undefined,
    fundingRate:    raw.fundingRate    ? parseFloat(raw.fundingRate)     : undefined,
    nextFundingTime: raw.nextFundingTime ? parseInt(raw.nextFundingTime) : undefined,
  }
}

function parseCandle(raw: string[]): BybitCandle {
  return {
    openTime: parseInt(raw[0] ?? '0'),
    open:     parseFloat(raw[1] ?? '0'),
    high:     parseFloat(raw[2] ?? '0'),
    low:      parseFloat(raw[3] ?? '0'),
    close:    parseFloat(raw[4] ?? '0'),
    volume:   parseFloat(raw[5] ?? '0'),
    turnover: parseFloat(raw[6] ?? '0'),
  }
}
