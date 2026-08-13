/**
 * app/api/goat/loop/route.ts — Session 2, re-platformed on KeeperHub
 *
 * Server-side GOAT Network agent loop.
 * Called every 2 minutes by useGoatAgentLoop (client hook).
 * Decision logic: signal engine → strategy rules → risk guardrails →
 * GoatClient.swap() — which, for mainnet, signs and broadcasts through
 * KeeperHub's Direct Execution API rather than a private key held here.
 * See lib/keeperhub/client.ts and https://docs.keeperhub.com/api/direct-execution.
 */

import { NextRequest, NextResponse } from 'next/server'
import { GoatClient, checkGoatGuardrails } from '@/lib/goat/client'
import type { GoatNetwork } from '@/lib/goat/config'
import type { RiskProfile } from '@/lib/agentLoop'
import { rateLimit }         from '@/lib/rateLimit'
import { persistTrades }   from '@/lib/supabase/trades'
import { createServerClient } from '@/lib/supabase'
import type { GoatTrade } from '@/lib/goat/store'
import { publicMarket } from '@/lib/binance'

export const dynamic     = 'force-dynamic'
export const maxDuration = 55

// Binance's global API (api.binance.com) returns HTTP 451 for US-based IPs.
// If this route runs in a US server region, publicMarket.getPrices() fails
// on every call — silently, via its own try/catch — and portfolioUSD falls
// back to 0 forever. Try Binance first, then CoinGecko (no geo-restriction,
// no key required) as a fallback so a single blocked source can't zero out
// position sizing.
async function getBTCUSDPrice(): Promise<number | undefined> {
  try {
    const prices = await publicMarket.getPrices(['BTCUSDT'])
    if (prices.BTCUSDT) return prices.BTCUSDT
  } catch {}
  try {
    const res  = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
    const data = await res.json()
    if (data?.bitcoin?.usd) return data.bitcoin.usd
  } catch {}
  return undefined
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`goat-loop:${ip}`, 'ai-chat')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  try {
    const body = await req.json() as {
      privateKey?:  string   // legacy/testnet-only local-signing fallback
      agentAddress?: string  // KeeperHub mode: address only, no key transmitted
      network:      GoatNetwork
      riskProfile:  RiskProfile
      marketType:   string
      selectedAsset: string
      todayTrades:  number
      portfolioUSD: number
      drawdownPct:  number
      dryRun:       boolean
      signals:      Array<{ symbol: string; score: number; action: 'buy' | 'sell' | 'hold'; reasons: string[] }>
      rules:        Array<{ symbol: string; action: 'buy' | 'sell'; sizePct: number }>
    }

    const {
      privateKey, agentAddress, network, riskProfile, todayTrades,
      portfolioUSD: clientPortfolioUSD, drawdownPct, dryRun = true, signals = [], rules = [],
    } = body

    // KeeperHub mode (mainnet, real trades) only needs the address — it
    // never sees a private key, since KeeperHub's own wallet signs.
    // The legacy `privateKey` field still works for local testnet3 dry runs.
    if (!privateKey && !agentAddress) {
      return NextResponse.json({ error: 'agentAddress (or, for testnet3 dev, privateKey) required' }, { status: 400 })
    }

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

    const client = privateKey
      ? new GoatClient(privateKey, network)
      : GoatClient.fromAddress(agentAddress!, network)

    // ── 1. Portfolio snapshot ──────────────────────────────────────────────
    // Derive USD value from the REAL onchain balance + a live BTC price,
    // instead of trusting whatever portfolioUSD the client sent. That value
    // used to be a closed loop — the server only ever echoed it back — so on
    // a fresh session it stayed stuck at 0 forever and every position sized
    // to $0 (client.sendBTC never had a real amount to send). See Session 10
    // fix notes.
    const btcBalance = await client.getBTCBalance()
    const btcPrice   = await getBTCUSDPrice()
    const portfolioUSD = btcPrice
      ? btcBalance * btcPrice
      : (clientPortfolioUSD || 0)   // both price sources unreachable — fall back rather than zeroing out

    // ── 2. Evaluate signals against rules ─────────────────────────────────
    // Filter signals with score above threshold
    const MIN_SIGNAL_SCORE = 65
    const actionable = signals.filter(s =>
      s.action !== 'hold' && Math.abs(s.score) >= MIN_SIGNAL_SCORE
    )

    // Rules (e.g. "always buy BTC 5%") bypass the score gate above entirely —
    // they fire every cycle regardless of signal strength, but still go
    // through the same guardrails and execution path as signal-based trades
    // below. A rule's own sizePct overrides the risk profile's position
    // sizing for that trade.
    type TradeIntent = { symbol: string; action: 'buy' | 'sell'; sizePct?: number }
    const intents: TradeIntent[] = [
      ...actionable.map((s): TradeIntent => ({ symbol: s.symbol, action: s.action as 'buy' | 'sell' })),
      ...rules.map((r): TradeIntent => ({ symbol: r.symbol, action: r.action, sizePct: r.sizePct })),
    ]

    const trades: GoatTrade[]  = []
    const errors:  string[]    = []
    let   executed = 0
    let   blocked  = 0

    for (const intent of intents) {
      const amountUSD = intent.sizePct != null
        ? portfolioUSD * (intent.sizePct / 100)
        : portfolioUSD * (riskProfile.maxPositionPct / 100)

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
        symbol:     intent.symbol,
        side:       intent.action,
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
      // Stable, time-bucketed task id: same signal + same 2-minute cycle
      // replays safely if this request is retried; a new cycle is new work.
      const cycleBucket = new Date(Math.floor(Date.now() / 120_000) * 120_000).toISOString()
      const taskId = `goat-loop-${intent.symbol}-${intent.action}-${cycleBucket}`

      let result: { success: boolean; txHash: string; error?: string; simulated?: boolean }

      if (network !== 'mainnet') {
        // Uniswap V3 isn't deployed on GOAT testnet3, so client.swap() always
        // returns a hardcoded local simulation there regardless of dryRun —
        // it never touches the chain. To actually exercise a genuine signed
        // + broadcast + chain-verified testnet3 transaction (via KeeperHub if
        // KEEPERHUB_API_KEY is set, else the local signer fallback), use a
        // native BTC send as the onchain leg instead. This is not a real
        // token swap — there's no DEX to swap against on testnet3 — it's the
        // closest thing to a genuine verifiable onchain tx the agent can
        // produce there.
        result = await client.sendBTC(client.address, amountUSD / 30_000, taskId)
      } else {
        // NOTE: For mainnet, tokenIn/tokenOut must be resolved to real
        // GOAT-mainnet ERC-20 addresses (WBTC, USDC etc). Until
        // WBTC_GOAT_MAINNET / USDC_GOAT_MAINNET are confirmed from
        // explorer.goat.network/tokens, mainnet ERC-20 swaps won't run for
        // real — see lib/goat/config.ts.
        result = await client.swap({
          tokenIn:    'BTC',   // native — placeholder until ERC-20 addresses confirmed
          tokenOut:   'BTC',   // placeholder
          amountIn:   amountUSD / 30_000, // rough BTC equivalent
          decimalsIn: 18,
          feeTier:    3000,
          slippagePct: riskProfile.slippagePct,
        }, taskId)
      }

      if (result.success) {
        trades.push({ ...base, txHash: result.txHash, status: result.simulated ? 'simulated' : 'confirmed', pnlUSD: 0 })
        executed++
      } else {
        trades.push({ ...base, txHash: '', status: 'failed', pnlUSD: 0, reason: result.error })
        errors.push(`${intent.symbol}: ${result.error}`)
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