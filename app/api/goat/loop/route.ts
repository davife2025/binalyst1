/**
 * app/api/goat/loop/route.ts — Session 2
 *
 * Server-side GOAT Network agent loop.
 * Called every 2 minutes by useGoatAgentLoop (client hook).
 * Decision logic: signal engine → strategy rules → risk guardrails → GoatClient.swap()
 */

import { NextRequest, NextResponse } from 'next/server'
import { GoatClient, checkGoatGuardrails } from '@/lib/goat/client'
import type { GoatNetwork } from '@/lib/goat/config'
import type { RiskProfile } from '@/lib/agentLoop'
import { rateLimit }         from '@/lib/rateLimit'
import { persistTrades }   from '@/lib/supabase/trades'
import { createServerClient } from '@/lib/supabase'
import type { GoatTrade } from '@/lib/goat/store'

export const dynamic     = 'force-dynamic'
export const maxDuration = 55

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`goat-loop:${ip}`, 'ai-chat')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  try {
    const body = await req.json() as {
      privateKey:   string
      network:      GoatNetwork
      riskProfile:  RiskProfile
      marketType:   string
      selectedAsset: string
      todayTrades:  number
      portfolioUSD: number
      drawdownPct:  number
      dryRun:       boolean
      signals:      Array<{ symbol: string; score: number; action: 'buy' | 'sell' | 'hold'; reasons: string[] }>
      rules:        Array<{ condition: string; action: string; amount: number }>
    }

    const {
      privateKey, network, riskProfile, todayTrades,
      portfolioUSD, drawdownPct, dryRun = true, signals = [],
    } = body

    if (!privateKey) return NextResponse.json({ error: 'privateKey required' }, { status: 400 })

    // Trade persistence is per-user but the agent should still run for
    // guests / unauthenticated sessions — just skip the Supabase write
    // below if there's no signed-in user (see the `if (userId && ...)` guard).
    let userId: string | null = null
    try {
      const db = createServerClient()
      const { data: { user } } = await db.auth.getUser()
      userId = user?.id ?? null
    } catch {
      // no session — proceed without persistence
    }

    const client = new GoatClient(privateKey, network)

    // ── 1. Portfolio snapshot ──────────────────────────────────────────────
    const btcBalance = await client.getBTCBalance()

    // ── 2. Evaluate signals against rules ─────────────────────────────────
    // Filter signals with score above threshold
    const MIN_SIGNAL_SCORE = 65
    const actionable = signals.filter(s =>
      s.action !== 'hold' && Math.abs(s.score) >= MIN_SIGNAL_SCORE
    )

    const trades: GoatTrade[]  = []
    const errors:  string[]    = []
    let   executed = 0
    let   blocked  = 0

    for (const signal of actionable) {
      const amountUSD = portfolioUSD * (riskProfile.maxPositionPct / 100)

      // ── Guardrails ───────────────────────────────────────────────────────
      const guard = checkGoatGuardrails({
        profile:      riskProfile,
        btcBalance,
        portfolioUSD,
        amountUSD,
        drawdownPct,
        todayTrades:  todayTrades + executed,
        network,
      })

      const base: Omit<GoatTrade, 'txHash' | 'status' | 'pnlUSD' | 'reason'> = {
        id:         crypto.randomUUID(),
        timestamp:  Date.now(),
        symbol:     signal.symbol,
        side:       signal.action as 'buy' | 'sell',
        amountUSD,
        marketType: 'crypto',
      }

      if (!guard.allowed) {
        trades.push({ ...base, txHash: '', status: 'blocked', pnlUSD: 0, reason: guard.reason })
        blocked++
        continue
      }

      if (dryRun) {
        trades.push({ ...base, txHash: `dry_${Date.now().toString(16)}`, status: 'simulated', pnlUSD: 0 })
        executed++
        continue
      }

      // ── Live execution via GoatClient ─────────────────────────────────
      // NOTE: For mainnet, tokenIn/tokenOut must be resolved to real
      // GOAT-mainnet ERC-20 addresses (WBTC, USDC etc).
      // Until WBTC_GOAT_MAINNET / USDC_GOAT_MAINNET are confirmed from
      // explorer.goat.network/tokens, we run in testnet3 simulation mode.
      const result = await client.swap({
        tokenIn:    'BTC',   // native — placeholder until ERC-20 addresses confirmed
        tokenOut:   'BTC',   // placeholder
        amountIn:   amountUSD / 30_000, // rough BTC equivalent
        decimalsIn: 18,
        feeTier:    3000,
        slippagePct: riskProfile.slippagePct,
      })

      if (result.success) {
        trades.push({ ...base, txHash: result.txHash, status: result.simulated ? 'simulated' : 'confirmed', pnlUSD: 0 })
        executed++
      } else {
        trades.push({ ...base, txHash: '', status: 'failed', pnlUSD: 0, reason: result.error })
        errors.push(`${signal.symbol}: ${result.error}`)
      }
    }

    // Session 8: persist executed/simulated trades to Supabase (fire-and-forget)
    if (userId && trades.length) {
      persistTrades(trades.map(t => ({
        user_id:     userId,
        chain:       network === 'mainnet' ? 'goat-mainnet' : 'goat-testnet',
        market_type: body.marketType ?? 'crypto',
        symbol:      t.symbol,
        side:        t.side,
        amount_usd:  t.amountUSD,
        pnl_usd:     t.pnlUSD ?? 0,
        tx_hash:     t.txHash || null,
        status:      t.status,
        dry_run:     dryRun,
        executed_at: new Date(t.timestamp).toISOString(),
        risk_preset: riskProfile?.preset ?? null,
        risk_drawdown: riskProfile?.maxDrawdownPct ?? null,
      }))).catch(e => console.error('[goat/loop] persistTrades:', e.message))
    }

    return NextResponse.json({
      success: true,
      btcBalance,
      portfolioUSD,
      drawdownPct,
      trades,
      executed,
      blocked,
      errors,
      cycleAt: Date.now(),
      network,
    })
  } catch (err: any) {
    console.error('[goat/loop]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}