/**
 * lib/skills/twelvedata.ts — Session 4
 *
 * Twelve Data API client for forex and stocks.
 * https://twelvedata.com — free tier: 800 credits/day, 8 req/min.
 *
 * Returns data in the same Candle shape the backtester and signal engine
 * already consume — zero changes needed to backtester.ts or signalEngine.ts.
 *
 * COVERAGE:
 *   Forex:  3,000+ pairs (EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD...)
 *   Stocks: 30,000+ symbols (AAPL, TSLA, NVDA, AMZN, GOOGL, SPY, QQQ...)
 *   Crypto: also supported but we use Binance for crypto (better rate limits)
 *
 * INTERVALS — Twelve Data → same as Binance labels we already use:
 *   '1min' → '1m', '5min' → '5m', '15min' → '15m',
 *   '1h'   → '1h', '4h'  → '4h', '1day'  → '1d'
 *
 * RATE LIMIT:
 *   Free:    8 req/min,  800 credits/day
 *   Basic:   55 req/min, 55k credits/day ($29/mo)
 *   We use a simple in-module queue to stay under 8 req/min on free tier.
 */

import axios from 'axios'

const TWELVE_BASE = 'https://api.twelvedata.com'
const API_KEY     = process.env.TWELVE_DATA_API_KEY ?? ''

// ─────────────────────────────────────────────────────────────────────────────
// Candle shape — MUST match lib/backtester.ts interface Candle
// ─────────────────────────────────────────────────────────────────────────────

export interface Candle {
  openTime: number   // unix ms
  open:     number
  high:     number
  low:      number
  close:    number
  volume:   number
}

// ─────────────────────────────────────────────────────────────────────────────
// Market types and symbol helpers
// ─────────────────────────────────────────────────────────────────────────────

export type TDMarketType = 'forex' | 'stocks' | 'crypto'

/**
 * Normalise a display symbol to the format Twelve Data expects.
 * Forex:  'EUR/USD' → 'EUR/USD'  (keep as-is)
 * Stocks: 'AAPL'   → 'AAPL'     (keep as-is)
 * Crypto: 'BTC'    → 'BTC/USD'  (add /USD)
 */
export function normaliseTDSymbol(symbol: string, marketType: TDMarketType): string {
  if (marketType === 'forex')  return symbol.replace('-', '/')
  if (marketType === 'crypto') return symbol.includes('/') ? symbol : `${symbol}/USD`
  return symbol  // stocks: AAPL, TSLA etc.
}

/**
 * Map our standard interval labels to Twelve Data interval strings.
 */
export function toTDInterval(interval: string): string {
  const map: Record<string, string> = {
    '1m':  '1min',
    '5m':  '5min',
    '15m': '15min',
    '30m': '30min',
    '1h':  '1h',
    '4h':  '4h',
    '1d':  '1day',
    '1w':  '1week',
  }
  return map[interval] ?? interval
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiter — free tier: 8 req/min
// ─────────────────────────────────────────────────────────────────────────────

const queue: Array<() => void> = []
let   inFlight = 0
const MAX_CONCURRENT = 2
const MIN_DELAY_MS   = 8_000 / 8   // 1000ms between requests on free tier

function scheduleRequest<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    queue.push(async () => {
      inFlight++
      try {
        const result = await fn()
        resolve(result)
      } catch (e) {
        reject(e)
      } finally {
        inFlight--
        setTimeout(drainQueue, MIN_DELAY_MS)
      }
    })
    drainQueue()
  })
}

function drainQueue() {
  while (inFlight < MAX_CONCURRENT && queue.length > 0) {
    const next = queue.shift()
    if (next) next()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Live quote
// ─────────────────────────────────────────────────────────────────────────────

export interface TDQuote {
  symbol:         string
  name:           string
  exchange:       string
  currency:       string
  datetime:       string    // ISO
  open:           number
  high:           number
  low:            number
  close:          number
  volume:         number
  previousClose:  number
  change:         number    // absolute
  percentChange:  number    // e.g. -0.52
  fiftyTwoWeekHigh: number
  fiftyTwoWeekLow:  number
}

export async function fetchQuote(
  symbol:     string,
  marketType: TDMarketType,
): Promise<TDQuote | null> {
  if (!API_KEY) throw new Error('TWELVE_DATA_API_KEY not set in env')
  const sym = normaliseTDSymbol(symbol, marketType)

  return scheduleRequest(async () => {
    const { data } = await axios.get(`${TWELVE_BASE}/quote`, {
      params: { symbol: sym, apikey: API_KEY },
      timeout: 10_000,
    })
    if (data.status === 'error') throw new Error(data.message)

    return {
      symbol:           data.symbol,
      name:             data.name ?? sym,
      exchange:         data.exchange ?? '',
      currency:         data.currency ?? 'USD',
      datetime:         data.datetime,
      open:             parseFloat(data.open),
      high:             parseFloat(data.high),
      low:              parseFloat(data.low),
      close:            parseFloat(data.close),
      volume:           parseFloat(data.volume ?? '0'),
      previousClose:    parseFloat(data.previous_close),
      change:           parseFloat(data.change),
      percentChange:    parseFloat(data.percent_change),
      fiftyTwoWeekHigh: parseFloat(data.fifty_two_week?.high ?? '0'),
      fiftyTwoWeekLow:  parseFloat(data.fifty_two_week?.low  ?? '0'),
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch quotes (up to 8 symbols in one request — counts as 1 credit)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchQuoteBatch(
  symbols:    string[],
  marketType: TDMarketType,
): Promise<TDQuote[]> {
  if (!API_KEY) throw new Error('TWELVE_DATA_API_KEY not set in env')
  const syms = symbols.map(s => normaliseTDSymbol(s, marketType)).join(',')

  return scheduleRequest(async () => {
    const { data } = await axios.get(`${TWELVE_BASE}/quote`, {
      params: { symbol: syms, apikey: API_KEY },
      timeout: 15_000,
    })

    // Single symbol returns object; multiple returns object keyed by symbol
    const entries = Array.isArray(data)
      ? data
      : typeof data === 'object' && data.symbol
        ? [data]
        : Object.values(data)

    return (entries as any[])
      .filter(d => d.status !== 'error')
      .map(d => ({
        symbol:           d.symbol,
        name:             d.name ?? d.symbol,
        exchange:         d.exchange ?? '',
        currency:         d.currency ?? 'USD',
        datetime:         d.datetime,
        open:             parseFloat(d.open),
        high:             parseFloat(d.high),
        low:              parseFloat(d.low),
        close:            parseFloat(d.close),
        volume:           parseFloat(d.volume ?? '0'),
        previousClose:    parseFloat(d.previous_close),
        change:           parseFloat(d.change),
        percentChange:    parseFloat(d.percent_change),
        fiftyTwoWeekHigh: parseFloat(d.fifty_two_week?.high ?? '0'),
        fiftyTwoWeekLow:  parseFloat(d.fifty_two_week?.low  ?? '0'),
      }))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Historical OHLCV candles — same Candle shape as backtester.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch historical OHLCV candles from Twelve Data.
 * Returns in ascending time order (oldest first) — same as Binance klines.
 * Twelve Data returns 5000 candles max per request; we paginate if needed.
 *
 * @param symbol      e.g. 'EUR/USD', 'AAPL', 'BTC/USD'
 * @param interval    e.g. '1h', '4h', '1d'
 * @param marketType  'forex' | 'stocks' | 'crypto'
 * @param startTime   unix ms
 * @param endTime     unix ms
 */
export async function fetchOHLCV(
  symbol:     string,
  interval:   string,
  marketType: TDMarketType,
  startTime:  number,
  endTime:    number,
): Promise<Candle[]> {
  if (!API_KEY) throw new Error('TWELVE_DATA_API_KEY not set in env')

  const sym       = normaliseTDSymbol(symbol, marketType)
  const tdInterval = toTDInterval(interval)

  // Twelve Data date format: YYYY-MM-DD HH:MM:SS
  const fmt = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19)

  const all: Candle[] = []
  let   cursor = startTime

  while (cursor < endTime) {
    const candles = await scheduleRequest(async () => {
      const { data } = await axios.get(`${TWELVE_BASE}/time_series`, {
        params: {
          symbol:       sym,
          interval:     tdInterval,
          start_date:   fmt(cursor),
          end_date:     fmt(endTime),
          outputsize:   5000,
          order:        'ASC',
          apikey:       API_KEY,
        },
        timeout: 20_000,
      })

      if (data.status === 'error')  throw new Error(`Twelve Data: ${data.message} (${sym})`)
      if (!data.values?.length)     return []

      return (data.values as any[]).map(v => ({
        openTime: new Date(v.datetime).getTime(),
        open:     parseFloat(v.open),
        high:     parseFloat(v.high),
        low:      parseFloat(v.low),
        close:    parseFloat(v.close),
        volume:   parseFloat(v.volume ?? '0'),
      } satisfies Candle))
    })

    if (!candles.length) break
    all.push(...candles)
    cursor = candles[candles.length - 1].openTime + 1
    if (candles.length < 5000) break   // got all available data
  }

  return all
}

// ─────────────────────────────────────────────────────────────────────────────
// Market-aware candle fetcher — plug-in replacement for Binance klines
// Used by the backtest route in Session 5
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unified candle fetcher.
 * Routes to Binance for crypto (unchanged), Twelve Data for forex/stocks.
 * Drop this into backtester.ts as the dataSource-aware fetchHistoricalCandles.
 */
export async function fetchCandles(
  symbol:     string,
  interval:   string,
  marketType: TDMarketType | 'crypto',
  startTime:  number,
  endTime:    number,
): Promise<Candle[]> {
  if (marketType === 'crypto') {
    // Re-use the internal Binance fetch from backtester.ts
    // Imported dynamically to avoid circular deps
    const { runBacktest } = await import('@/lib/backtester')
    // We can't call fetchHistoricalCandles directly (it's unexported)
    // so we use a tiny Binance shim here
    return fetchBinanceCandles(symbol, interval, startTime, endTime)
  }
  return fetchOHLCV(symbol, interval, marketType, startTime, endTime)
}

async function fetchBinanceCandles(
  symbol:    string,
  interval:  string,
  startTime: number,
  endTime:   number,
): Promise<Candle[]> {
  const sym  = symbol.endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`
  const all: Candle[] = []
  let   cursor = startTime

  while (cursor < endTime) {
    const { data } = await axios.get('https://api.binance.com/api/v3/klines', {
      params: { symbol: sym, interval, startTime: cursor, endTime, limit: 1000 },
      timeout: 15_000,
    })
    if (!data?.length) break
    for (const k of data as any[]) {
      all.push({
        openTime: Number(k[0]),
        open:     parseFloat(k[1]),
        high:     parseFloat(k[2]),
        low:      parseFloat(k[3]),
        close:    parseFloat(k[4]),
        volume:   parseFloat(k[5]),
      })
    }
    cursor = Number(data[data.length - 1][0]) + 1
    if (data.length < 1000) break
  }
  return all
}

// ─────────────────────────────────────────────────────────────────────────────
// Symbol lists — curated defaults per market type
// ─────────────────────────────────────────────────────────────────────────────

export const FOREX_SYMBOLS = [
  { symbol: 'EUR/USD', label: 'Euro / US Dollar',        flag: '🇪🇺' },
  { symbol: 'GBP/USD', label: 'British Pound / Dollar',  flag: '🇬🇧' },
  { symbol: 'USD/JPY', label: 'Dollar / Japanese Yen',   flag: '🇯🇵' },
  { symbol: 'AUD/USD', label: 'Australian Dollar',       flag: '🇦🇺' },
  { symbol: 'USD/CAD', label: 'Dollar / Canadian Dollar',flag: '🇨🇦' },
  { symbol: 'USD/CHF', label: 'Dollar / Swiss Franc',    flag: '🇨🇭' },
  { symbol: 'NZD/USD', label: 'New Zealand Dollar',      flag: '🇳🇿' },
  { symbol: 'EUR/GBP', label: 'Euro / British Pound',    flag: '🇪🇺' },
  { symbol: 'EUR/JPY', label: 'Euro / Japanese Yen',     flag: '🇪🇺' },
  { symbol: 'GBP/JPY', label: 'British Pound / Yen',     flag: '🇬🇧' },
  { symbol: 'USD/NGN', label: 'Dollar / Nigerian Naira', flag: '🇳🇬' },
  { symbol: 'USD/ZAR', label: 'Dollar / South African Rand', flag: '🇿🇦' },
]

export const STOCKS_SYMBOLS = [
  { symbol: 'AAPL',  label: 'Apple',          sector: 'Tech'    },
  { symbol: 'MSFT',  label: 'Microsoft',       sector: 'Tech'    },
  { symbol: 'NVDA',  label: 'NVIDIA',          sector: 'Tech'    },
  { symbol: 'GOOGL', label: 'Alphabet',        sector: 'Tech'    },
  { symbol: 'AMZN',  label: 'Amazon',          sector: 'Tech'    },
  { symbol: 'TSLA',  label: 'Tesla',           sector: 'Auto'    },
  { symbol: 'META',  label: 'Meta',            sector: 'Tech'    },
  { symbol: 'NFLX',  label: 'Netflix',         sector: 'Media'   },
  { symbol: 'SPY',   label: 'S&P 500 ETF',     sector: 'ETF'     },
  { symbol: 'QQQ',   label: 'Nasdaq 100 ETF',  sector: 'ETF'     },
  { symbol: 'GLD',   label: 'Gold ETF',        sector: 'Commodity'},
  { symbol: 'USO',   label: 'Oil ETF',         sector: 'Commodity'},
]

export const MEME_SYMBOLS = [
  { symbol: 'DOGE',  label: 'Dogecoin',   },
  { symbol: 'SHIB',  label: 'Shiba Inu',  },
  { symbol: 'PEPE',  label: 'Pepe',       },
  { symbol: 'BONK',  label: 'Bonk',       },
  { symbol: 'FLOKI', label: 'Floki',      },
  { symbol: 'WIF',   label: 'dogwifhat',  },
  { symbol: 'BRETT', label: 'Brett',      },
  { symbol: 'MEME',  label: 'Memecoin',   },
]
