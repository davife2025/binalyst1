/**
 * app/api/livefeed/route.ts — Session 9
 *
 * Unified live price feed for all market types:
 *   crypto  → CMC (already in use) + Binance 24h stats
 *   forex   → Twelve Data quote
 *   stocks  → Twelve Data quote
 *   meme    → DexScreener (free, no key)
 *
 * Polling endpoint — the client polls every 15s.
 * Not a WebSocket (Next.js App Router doesn't support WS natively).
 *
 * POST body: { marketType: string, symbols?: string[] }
 */

import { NextRequest, NextResponse }  from 'next/server'
import { rateLimit }                  from '@/lib/rateLimit'
import { fetchQuoteBatch }            from '@/lib/skills/twelvedata'
import { getMemeCoinsQuotes }         from '@/lib/skills/dexscreener'
import { getTokensBySymbols }         from '@/lib/skills/cmc'
import axios                          from 'axios'

export const dynamic     = 'force-dynamic'
export const maxDuration = 30

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveQuote {
  symbol:     string
  name:       string
  price:      number
  change24h:  number
  change1h?:  number
  volume24h:  number
  marketCap?: number
  high24h?:   number
  low24h?:    number
  source:     'binance' | 'cmc' | 'twelvedata' | 'dexscreener'
  updatedAt:  number
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`livefeed:${ip}`, 'market')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  try {
    const body       = await req.json() as { marketType?: string; symbols?: string[] }
    const marketType = body.marketType ?? 'crypto'
    const now        = Date.now()

    let quotes: LiveQuote[] = []

    // ── Crypto & meme (via CMC + Binance 24h) ──────────────────────────────
    if (marketType === 'crypto') {
      const symbols = body.symbols ?? ['BTC', 'ETH', 'BNB', 'SOL', 'AVAX', 'LINK', 'DOGE', 'CAKE']
      const tokens  = await getTokensBySymbols(symbols).catch(() => [])
      quotes = tokens.map(t => ({
        symbol:    t.symbol,
        name:      t.name,
        price:     t.price,
        change24h: t.change24h,
        change1h:  t.change1h,
        volume24h: t.volume24h,
        marketCap: t.marketCap,
        source:    'cmc' as const,
        updatedAt: now,
      }))
    }

    // ── Meme coins (DexScreener — no key required) ──────────────────────────
    if (marketType === 'meme') {
      const symbols = body.symbols ?? ['DOGE', 'SHIB', 'PEPE', 'BONK', 'FLOKI']
      // Try CMC first for mainstream memes (DOGE, SHIB)
      const [cmcTokens, dexTokens] = await Promise.all([
        getTokensBySymbols(symbols.filter(s => ['DOGE','SHIB','PEPE'].includes(s))).catch(() => []),
        getMemeCoinsQuotes(symbols.filter(s => !['DOGE','SHIB','PEPE'].includes(s))),
      ])

      quotes = [
        ...cmcTokens.map(t => ({
          symbol: t.symbol, name: t.name, price: t.price,
          change24h: t.change24h, change1h: t.change1h,
          volume24h: t.volume24h, marketCap: t.marketCap,
          source: 'cmc' as const, updatedAt: now,
        })),
        ...dexTokens.map(t => ({
          symbol: t.symbol, name: t.name, price: t.price,
          change24h: t.change24h, volume24h: t.volume24h,
          marketCap: t.marketCap, source: 'dexscreener' as const, updatedAt: now,
        })),
      ]
    }

    // ── Forex (Twelve Data) ─────────────────────────────────────────────────
    if (marketType === 'forex') {
      if (!process.env.TWELVE_DATA_API_KEY) {
        return NextResponse.json({
          error: 'TWELVE_DATA_API_KEY not configured',
          quotes: [], marketType, updatedAt: now,
        }, { status: 503 })
      }
      const symbols = body.symbols ?? ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'USD/NGN']
      const tdQuotes = await fetchQuoteBatch(symbols, 'forex').catch(() => [])
      quotes = tdQuotes.map(q => ({
        symbol:    q.symbol,
        name:      q.name,
        price:     q.close,
        change24h: q.percentChange,
        high24h:   q.high,
        low24h:    q.low,
        volume24h: q.volume,
        source:    'twelvedata' as const,
        updatedAt: now,
      }))
    }

    // ── Stocks (Twelve Data) ────────────────────────────────────────────────
    if (marketType === 'stocks') {
      if (!process.env.TWELVE_DATA_API_KEY) {
        return NextResponse.json({
          error: 'TWELVE_DATA_API_KEY not configured',
          quotes: [], marketType, updatedAt: now,
        }, { status: 503 })
      }
      const symbols = body.symbols ?? ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN', 'SPY', 'QQQ']
      const tdQuotes = await fetchQuoteBatch(symbols, 'stocks').catch(() => [])
      quotes = tdQuotes.map(q => ({
        symbol:    q.symbol,
        name:      q.name,
        price:     q.close,
        change24h: q.percentChange,
        high24h:   q.high,
        low24h:    q.low,
        volume24h: q.volume,
        source:    'twelvedata' as const,
        updatedAt: now,
      }))
    }

    return NextResponse.json({ success: true, quotes, marketType, updatedAt: now })

  } catch (err: any) {
    console.error('[livefeed]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
