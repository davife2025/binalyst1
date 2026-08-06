/**
 * app/api/backtest/route.ts
 * Session L — POST /api/backtest
 *
 * Body:
 *   { strategyText, rules, symbol, interval, lookbackDays, initialCapital, mockFearGreed? }
 *
 * Returns BacktestResult JSON.
 * Accepts either pre-parsed rules[] OR raw strategyText (parses it server-side).
 */

import { NextRequest, NextResponse } from 'next/server'
import { runBacktest }               from '@/lib/backtester'
import { parseSimpleStrategy }       from '@/lib/signalEngine'

export const runtime = 'nodejs'
export const maxDuration = 60   // Vercel: allow up to 60s for long backtests

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      strategyText,
      rules:        rawRules,
      symbol        = 'BTC',
      interval      = '1h',
      lookbackDays  = 90,
      initialCapital = 10_000,
      mockFearGreed  = 50,
      marketType     = 'crypto',
    } = body

    // ── Parse rules ───────────────────────────────────────────────────────────
    let rules = rawRules ?? []
    if ((!rules || rules.length === 0) && strategyText) {
      rules = parseSimpleStrategy(strategyText)
    }
    if (!rules || rules.length === 0) {
      return NextResponse.json(
        { error: 'No rules provided. Supply either rules[] or strategyText.' },
        { status: 400 },
      )
    }

    // ── Validate params ───────────────────────────────────────────────────────
    const validIntervals = ['15m', '1h', '4h', '1d']
    if (!validIntervals.includes(interval)) {
      return NextResponse.json(
        { error: `Invalid interval "${interval}". Use: ${validIntervals.join(', ')}` },
        { status: 400 },
      )
    }
    if (lookbackDays < 7 || lookbackDays > 365) {
      return NextResponse.json(
        { error: 'lookbackDays must be between 7 and 365.' },
        { status: 400 },
      )
    }
    if (initialCapital < 100 || initialCapital > 1_000_000) {
      return NextResponse.json(
        { error: 'initialCapital must be between 100 and 1,000,000.' },
        { status: 400 },
      )
    }

    // ── Run backtest ──────────────────────────────────────────────────────────
    const endTime   = Date.now()
    const startTime = endTime - lookbackDays * 24 * 60 * 60 * 1000

    const result = await runBacktest({
      rules,
      symbol,
      interval,
      startTime,
      endTime,
      initialCapital,
      mockFearGreed,
      marketType,
    })

    return NextResponse.json({ success: true, result })

  } catch (err: any) {
    console.error('[backtest]', err)
    return NextResponse.json(
      { error: err?.message ?? 'Backtest failed' },
      { status: 500 },
    )
  }
}
