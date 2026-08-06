/**
 * app/api/technicals/route.ts
 * Session K — GET /api/technicals?symbol=BTC&interval=1h
 *
 * Returns a full TechnicalSnapshot for any symbol.
 * Used by RegimePanel in StrategyBuilder and (later) SignalDashboard.
 *
 * Query params:
 *   symbol   — e.g. BTC, ETH, BTCUSDT  (default: BTC)
 *   interval — Binance interval string   (default: 1h)
 *   batch    — comma-separated symbols   (overrides symbol if present)
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getTechnicalSnapshot,
  getBatchTechnicals,
} from '@/lib/skills/bitget-technicals'

export const runtime = 'nodejs'

// Simple in-memory cache — avoids hammering Binance on every render
const cache = new Map<string, { data: any; ts: number }>()
const TTL   = 60_000  // 60 seconds

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const interval = searchParams.get('interval') ?? '1h'
  const batch    = searchParams.get('batch')

  // ── Batch mode: ?batch=BTC,ETH,BNB ───────────────────────────────────────
  if (batch) {
    const symbols = batch.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    if (symbols.length === 0) {
      return NextResponse.json({ error: 'No symbols provided' }, { status: 400 })
    }

    const cacheKey = `batch:${symbols.sort().join(',')}:${interval}`
    const cached   = cache.get(cacheKey)
    if (cached && Date.now() - cached.ts < TTL) {
      return NextResponse.json({ snapshots: cached.data, cached: true })
    }

    try {
      const snapshots = await getBatchTechnicals(symbols, interval)
      cache.set(cacheKey, { data: snapshots, ts: Date.now() })
      return NextResponse.json({ snapshots })
    } catch (err: any) {
      return NextResponse.json({ error: err.message ?? 'Failed to fetch batch technicals' }, { status: 500 })
    }
  }

  // ── Single symbol mode: ?symbol=BTC&interval=1h ───────────────────────────
  const symbol   = (searchParams.get('symbol') ?? 'BTC').toUpperCase().replace('USDT', '')
  const cacheKey = `${symbol}:${interval}`
  const cached   = cache.get(cacheKey)

  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json({ snapshot: cached.data, cached: true })
  }

  try {
    const snapshot = await getTechnicalSnapshot(symbol, interval)
    cache.set(cacheKey, { data: snapshot, ts: Date.now() })
    return NextResponse.json({ snapshot })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'Failed to fetch technicals' },
      { status: 500 },
    )
  }
}
