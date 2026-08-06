/**
 * app/api/cmc/route.ts  — Session B update
 * Adds full SignalSnapshot computation using signalEngine.ts
 * Replaces the Session A version.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getFearAndGreed,
  getFearAndGreedHistory,
  getTopTokens,
  getTrending,
  getTokensBySymbols,
  COMPETITION_SYMBOLS,
  type CMCToken,
} from '@/lib/skills/cmc'
import {
  computeSignalSnapshot,
  computeSummary,
} from '@/lib/signalEngine'
import { rateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`cmc:${ip}`, 'market')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  try {
    switch (action) {

      case 'fear_greed': {
        const data = await getFearAndGreed()
        return NextResponse.json({ success: true, data })
      }

      case 'fear_greed_history': {
        const limit = parseInt(searchParams.get('limit') ?? '30')
        const data  = await getFearAndGreedHistory(limit)
        return NextResponse.json({ success: true, data })
      }

      case 'trending': {
        const limit = parseInt(searchParams.get('limit') ?? '20')
        const data  = await getTrending(limit)
        return NextResponse.json({ success: true, data })
      }

      case 'tokens': {
        const limit = parseInt(searchParams.get('limit') ?? '50')
        const data  = await getTopTokens(limit)
        return NextResponse.json({ success: true, data })
      }

      // ── Single token signal snapshot ─────────────────────────────────────
      case 'signal': {
        const symbol = searchParams.get('symbol')?.toUpperCase()
        if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

        const [tokens, fg, trending] = await Promise.all([
          getTokensBySymbols([symbol]),
          getFearAndGreed(),
          getTrending(20),
        ])

        const token = tokens[0]
        if (!token) return NextResponse.json({ error: `No data for ${symbol}` }, { status: 404 })

        const trendRank = trending.findIndex(t => t.symbol === symbol)
        const snapshot  = computeSignalSnapshot(
          token, fg, undefined,
          trendRank >= 0 ? trendRank + 1 : undefined,
        )
        return NextResponse.json({ success: true, data: snapshot })
      }

      // ── Batch signal snapshots ───────────────────────────────────────────
      case 'signals_batch': {
        const raw     = searchParams.get('symbols')
        const symbols = raw
          ? raw.split(',').map(s => s.trim().toUpperCase()).slice(0, 20)
          : COMPETITION_SYMBOLS.slice(0, 12)

        const [tokens, fg, trending] = await Promise.all([
          getTokensBySymbols(symbols),
          getFearAndGreed(),
          getTrending(20),
        ])

        // Build trending rank map
        const trendMap: Record<string, number> = {}
        trending.forEach((t, i) => { trendMap[t.symbol] = i + 1 })

        // Compute volume average for spike detection
        const avgVol = tokens.length
          ? tokens.reduce((s, t) => s + t.volume24h, 0) / tokens.length
          : undefined

        const snapshots = tokens.map(t =>
          computeSignalSnapshot(t, fg, avgVol, trendMap[t.symbol])
        )

        const summary = computeSummary(snapshots, fg)

        return NextResponse.json({ success: true, data: snapshots, summary })
      }

      // ── Summary only (lighter) ───────────────────────────────────────────
      case 'summary': {
        const raw     = searchParams.get('symbols')
        const symbols = raw
          ? raw.split(',').map(s => s.trim().toUpperCase()).slice(0, 20)
          : COMPETITION_SYMBOLS.slice(0, 12)

        const [tokens, fg] = await Promise.all([
          getTokensBySymbols(symbols),
          getFearAndGreed(),
        ])
        const snapshots = tokens.map(t => computeSignalSnapshot(t, fg))
        const summary   = computeSummary(snapshots, fg)
        return NextResponse.json({ success: true, data: summary })
      }

      case 'eligible': {
        return NextResponse.json({ success: true, data: COMPETITION_SYMBOLS })
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: fear_greed, fear_greed_history, trending, tokens, signal, signals_batch, summary, eligible' },
          { status: 400 }
        )
    }
  } catch (err: any) {
    console.error('[cmc route]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
