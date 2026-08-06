/**
 * app/api/agent/signals/route.ts — Session 5
 *
 * Unified multi-market signal endpoint.
 * Used by useGoatAgentLoop and the existing BSC agent loop.
 *
 * POST body:
 * {
 *   marketType: 'crypto' | 'forex' | 'stocks' | 'meme'
 *   symbols:    string[]     // e.g. ['BTC', 'ETH'] or ['EUR/USD', 'GBP/USD']
 *   interval:   string       // '1h' | '4h' | '1d'  (default '1h')
 *   fearGreed?: number       // override CMC Fear & Greed (optional, forex/stocks only)
 * }
 *
 * Returns:
 * {
 *   signals: SignalSnapshot[]
 *   summary: SignalSummary
 *   marketType: string
 *   generatedAt: number
 * }
 *
 * Data routing:
 *   crypto → Binance klines + CMC sentiment (unchanged from existing flow)
 *   meme   → Binance klines + CMC sentiment (meme coins are crypto on Binance)
 *   forex  → Twelve Data OHLCV, no CMC (uses neutral sentiment 50)
 *   stocks → Twelve Data OHLCV, no CMC (uses neutral sentiment 50)
 */

import { NextRequest, NextResponse }    from 'next/server'
import { rateLimit }                    from '@/lib/rateLimit'
import { computeSignalSnapshot, computeSummary } from '@/lib/signalEngine'
import { computeTechnicalsFromCandles } from '@/lib/skills/multimarket-technicals'
import { fetchOHLCV }                   from '@/lib/skills/twelvedata'
import { getTechnicalSnapshot }         from '@/lib/skills/bitget-technicals'
import {
  getTokensBySymbols,
  getFearAndGreed,
  type CMCToken,
  type FearAndGreed,
} from '@/lib/skills/cmc'

export const dynamic     = 'force-dynamic'
export const maxDuration = 55

// ─────────────────────────────────────────────────────────────────────────────
// Neutral CMC token stub for non-crypto markets
// forex/stocks don't have CMC data, so we build a stub with neutral values
// ─────────────────────────────────────────────────────────────────────────────

function buildStubToken(symbol: string, price: number, change24h: number): CMCToken {
  return {
    id:         0,
    name:       symbol,
    symbol:     symbol,
    slug:       symbol.toLowerCase(),
    cmc_rank:   0,
    price,
    change1h:   change24h / 24,
    change24h,
    change7d:   change24h * 3,
    volume24h:  0,
    marketCap:  0,
  }
}

// Neutral Fear & Greed for non-crypto markets
const NEUTRAL_FG: FearAndGreed = {
  value:          50,
  label:          'Neutral',
  timestamp:      new Date().toISOString(),
  classification: 'neutral',
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`signals:${ip}`, 'market')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  try {
    const body = await req.json() as {
      marketType?: string
      symbols?:    string[]
      interval?:   string
      fearGreed?:  number
    }

    const marketType = (body.marketType ?? 'crypto') as 'crypto' | 'forex' | 'stocks' | 'meme'
    const symbols    = body.symbols ?? defaultSymbols(marketType)
    const interval   = body.interval ?? '1h'
    const now        = Date.now()
    const lookbackMs = 200 * intervalToMs(interval)   // 200 bars of history

    // ── Fetch signals based on market type ─────────────────────────────────
    if (marketType === 'crypto' || marketType === 'meme') {
      return await handleCryptoSignals(symbols, interval, body.fearGreed)
    }

    // ── Forex / Stocks — Twelve Data path ─────────────────────────────────
    if (!process.env.TWELVE_DATA_API_KEY) {
      return NextResponse.json({
        error: 'TWELVE_DATA_API_KEY not configured. Add it to .env.local to enable forex/stocks signals.',
        signals: [], summary: null, marketType, generatedAt: now,
      }, { status: 503 })
    }

    const tdType = marketType as 'forex' | 'stocks'
    const signals = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const candles   = await fetchOHLCV(symbol, interval, tdType, now - lookbackMs, now)
          const tech      = computeTechnicalsFromCandles(symbol, interval, candles)
          const lastPrice = candles.length ? candles[candles.length - 1].close : 0
          const prevClose = candles.length > 1 ? candles[candles.length - 2].close : lastPrice
          const change24h = prevClose ? (lastPrice - prevClose) / prevClose * 100 : 0
          const stub      = buildStubToken(symbol, lastPrice, change24h)
          return computeSignalSnapshot(stub, body.fearGreed != null ? { value: body.fearGreed, label: 'Override', timestamp: new Date().toISOString(), classification: 'neutral' } : NEUTRAL_FG, undefined, undefined, tech as any)
        } catch (err: any) {
          console.error(`[signals/${marketType}] ${symbol}:`, err.message)
          return null
        }
      })
    )

    const valid   = signals.filter(Boolean) as Awaited<ReturnType<typeof computeSignalSnapshot>>[]
    const summary = computeSummary(valid, NEUTRAL_FG)

    return NextResponse.json({
      signals:     valid,
      summary,
      marketType,
      generatedAt: now,
    })

  } catch (err: any) {
    console.error('[signals]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Crypto path — reuses existing CMC + Binance flow unchanged
// ─────────────────────────────────────────────────────────────────────────────

async function handleCryptoSignals(symbols: string[], interval: string, overrideFG?: number) {
  const [tokens, fg] = await Promise.all([
    getTokensBySymbols(symbols).catch(() => []),
    overrideFG != null
      ? Promise.resolve({ value: overrideFG, label: 'Override', timestamp: new Date().toISOString(), classification: 'neutral' } as FearAndGreed)
      : getFearAndGreed().catch(() => NEUTRAL_FG),
  ])

  const signals = await Promise.all(
    tokens.map(async token => {
      const tech = await getTechnicalSnapshot(token.symbol, interval).catch(() => null)
      return computeSignalSnapshot(token, fg, undefined, undefined, tech ?? undefined)
    })
  )

  return NextResponse.json({
    signals,
    summary:     computeSummary(signals, fg),
    marketType:  'crypto',
    generatedAt: Date.now(),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function intervalToMs(interval: string): number {
  const map: Record<string, number> = {
    '1m': 60_000, '5m': 300_000, '15m': 900_000,
    '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
  }
  return map[interval] ?? 3_600_000
}

function defaultSymbols(marketType: string): string[] {
  switch (marketType) {
    case 'forex':  return ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD']
    case 'stocks': return ['AAPL', 'MSFT', 'NVDA', 'TSLA']
    case 'meme':   return ['DOGE', 'SHIB', 'PEPE', 'BONK']
    default:       return ['BTC', 'ETH', 'BNB', 'SOL']
  }
}
