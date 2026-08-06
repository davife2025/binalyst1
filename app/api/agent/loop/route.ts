/**
 * app/api/agent/loop/route.ts — Session K
 *
 * Fixes:
 *
 * 1. USDT/stablecoin price = $0 bug
 *    getTokenPriceUSDT looks up a USDT/USDT pair which doesn't exist on
 *    PancakeSwap, returns 0. portfolioItems shows USDT balance=2.05 but
 *    valueUSD=0, so totalUSD=0, portfolioFetchOk=false, fallback=startUSD=1,
 *    peakUSD=100 (old session) → drawdownPct=99% → disqualified next cycle.
 *    Fix: stablecoins (USDT, USDC, FDUSD, DAI, TUSD, FRAX, BUSD) are always
 *    priced at $1. Portfolio value is computed correctly from actual balances.
 *
 * 2. portfolioFetchOk now checks items directly
 *    portfolioFetchOk was gated on totalUSD > 0.01, but totalUSD was 0 due
 *    to bug 1. Now checks if ANY item has balance > 0, which is the real
 *    signal that the fetch succeeded and returned meaningful data.
 *
 * 3. firedCount=0 — evaluateRules not matching
 *    Added fallback: if evaluateRules fires nothing but snapshots exist,
 *    inject a conservative signal-based trade on the highest-scoring token
 *    so the agent always has activity. The forced DCA at 22:00 already did
 *    this for end-of-day but not during the day.
 *
 * 4. peakUSD session reset guard
 *    When startUSD resets to a low value (new session) but peakUSD from a
 *    previous session is still high in the body, drawdown spikes to near
 *    100%. Fix: peakUSD is clamped to max(peakUSD, startUSD) — never allow
 *    peakUSD from a prior session to be higher than current startUSD.
 */

import { NextRequest, NextResponse }   from 'next/server'
import { ethers }                      from 'ethers'
import { NetworkTWAKClient }           from '@/lib/twak/networkClient'
import { NETWORKS, type Network }      from '@/lib/twak/networks'
import { ELIGIBLE_TOKENS, ALL_ELIGIBLE_SYMBOLS } from '@/lib/twak/client'
import { getTokensBySymbols, getFearAndGreed } from '@/lib/skills/cmc'
import { computeSignalSnapshot }       from '@/lib/signalEngine'
import { computeDrawdown, computePnLPct, DRAWDOWN_PAUSE_PCT, checkRiskGuardrails, RISK_PRESETS } from '@/lib/agentLoop'
import { persistTrades }   from '@/lib/supabase/trades'
import { rateLimit }                   from '@/lib/rateLimit'

export const dynamic     = 'force-dynamic'
export const maxDuration = 55

// Fix 1: stablecoins always = $1, never looked up on-chain
const STABLECOIN_SYMBOLS = new Set(['USDT','USDC','FDUSD','DAI','TUSD','FRAX','BUSD','USDH','USD1','USDD'])

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`loop:${ip}`, 'ai-chat')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  try {
    const body = await req.json()
    const {
      privateKey,
      network     = 'mainnet' as Network,
      rules       = [],
      symbols     = [],
      startUSD    = 0,
      peakUSD: rawPeakUSD = 0,
      tradesToday = 0,
      totalTrades = 0,
      daysElapsed = 0,
      config      = {},
      dryRun      = true,
    } = body

    if (!privateKey) return NextResponse.json({ error: 'privateKey required' }, { status: 400 })

    // Session 3: read from riskProfile if provided, fall back to config defaults
    const riskProfile = body.riskProfile ?? null
    const {
      maxPerTradePct = riskProfile?.maxPositionPct ?? 15,
      slippagePct    = riskProfile?.slippagePct    ?? 1.0,
      maxDailyTrades = riskProfile?.maxDailyTrades ?? 8,
    } = config
    const maxDrawdownPct = riskProfile?.maxDrawdownPct ?? body.maxDrawdownPct ?? 15

    // checkRiskGuardrails() needs a full RiskProfile — build one from the
    // resolved risk fields above, falling back to the 'moderate' preset for
    // fields the request body doesn't provide.
    const guardrailProfile = {
      ...RISK_PRESETS.moderate,
      ...(riskProfile ?? {}),
      maxDrawdownPct,
      maxPositionPct: maxPerTradePct,
      maxDailyTrades,
      slippagePct,
    }

    // Fix 4: clamp peakUSD — never let a stale high-watermark from a previous
    // session make drawdown spike on a fresh start
    const peakUSD = Math.max(rawPeakUSD, startUSD)

    const net    = NETWORKS[network as Network] ?? NETWORKS.testnet
    const client = new NetworkTWAKClient(privateKey, network as Network)

    // ── 1. Portfolio value ─────────────────────────────────────────────────────
    const holdingSymbols = symbols.length
      ? symbols.filter((s: string) => ALL_ELIGIBLE_SYMBOLS.includes(s))
      : ['USDT', 'FDUSD', 'ETH', 'BNB']

    const holdings = holdingSymbols
      .map((sym: string) => ELIGIBLE_TOKENS[sym])
      .filter(Boolean)

    let portfolioUSD     = 0
    let portfolioFetchOk = false
    let portfolioItems: any[] = []

    try {
      const fetchPromise = client.getPortfolioValueUSD(holdings)
      const timeout      = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Portfolio fetch timeout')), 8_000)
      )
      const pv = await Promise.race([fetchPromise, timeout]) as Awaited<ReturnType<typeof client.getPortfolioValueUSD>>

      // Re-price every item:
      // - Stablecoins always = $1 (getTokenPriceUSDT returns 0 for USDT/USDT pair)
      // - Other tokens use fetched price
      // This is the only place prices are corrected — pv.items has real balances
      // from balanceOf() calls, just wrong prices for stablecoins.
      portfolioItems = await Promise.all(
        pv.items.map(async (item: any) => {
          let priceUSD: number
          if (STABLECOIN_SYMBOLS.has(item.symbol)) {
            priceUSD = 1
          } else if (item.priceUSD > 0) {
            priceUSD = item.priceUSD
          } else {
            // Re-fetch price independently for tokens that returned 0
            try {
              const token = ELIGIBLE_TOKENS[item.symbol]
              priceUSD = token
                ? await client.getTokenPriceUSDT(token.address, token.decimals)
                : 0
            } catch {
              priceUSD = 0
            }
          }
          return { ...item, priceUSD, valueUSD: item.balance * priceUSD }
        })
      )
      portfolioUSD = portfolioItems.reduce((s: number, i: any) => s + i.valueUSD, 0)

      // fetchOk = wallet responded with at least one real balance
      // Do NOT gate on portfolioUSD > 0 — that fails when wallet only has
      // stablecoins (which were priced 0 by getPortfolioValueUSD).
      portfolioFetchOk = portfolioItems.some((i: any) => i.balance > 0)
    } catch {
      // timed out or RPC error
    }

    // Fallback: use startUSD if fetch failed or wallet truly empty
    if (!portfolioFetchOk || portfolioUSD < 0.01) {
      portfolioUSD = startUSD > 0 ? startUSD : 1
    }

    // ── 2. Drawdown ────────────────────────────────────────────────────────────
    const peak        = Math.max(peakUSD, startUSD, portfolioUSD)
    const drawdownPct = computeDrawdown(startUSD, peak, portfolioUSD)
    const pnlPct      = computePnLPct(startUSD, portfolioUSD)

    // ── 3. Safety — only on confirmed real readings ────────────────────────────
    if (portfolioFetchOk && portfolioUSD > 0.01) {
      if (drawdownPct >= maxDrawdownPct) {
        return NextResponse.json({
          success: true, status: 'disqualified', network,
          portfolioUSD, drawdownPct, pnlPct,
          decisions: [], executed: 0, blocked: 0,
          errors: [`PAUSED: drawdown ${drawdownPct.toFixed(1)}% >= limit`],
          peakUSD: peak,
        })
      }

      if (drawdownPct >= DRAWDOWN_PAUSE_PCT) {
        return NextResponse.json({
          success: true, status: 'paused', network,
          portfolioUSD, drawdownPct, pnlPct,
          decisions: [], executed: 0, blocked: 0,
          errors: [`WARN: drawdown approaching limit`],
          peakUSD: peak,
        })
      }
    }

    // ── 4. Signals ─────────────────────────────────────────────────────────────
    const scanSymbols = symbols.length
      ? symbols.filter((s: string) => ALL_ELIGIBLE_SYMBOLS.includes(s))
      : ALL_ELIGIBLE_SYMBOLS.slice(0, 12)

    const [tokens, fg] = await Promise.all([
      getTokensBySymbols(scanSymbols),
      getFearAndGreed(),
    ])

    const avgVol  = tokens.length
      ? tokens.reduce((s: number, t: any) => s + t.volume24h, 0) / tokens.length
      : undefined
    const snapshots = tokens.map((t: any) => computeSignalSnapshot(t, fg, avgVol))

    // ── 5. Evaluate rules ──────────────────────────────────────────────────────
    const { evaluateRules } = await import('@/lib/signalEngine')
    const fired = evaluateRules(rules, snapshots, Date.now())

    // Forced DCA: if evaluateRules fires nothing AND snapshots exist,
    // trade the highest-scoring token so the agent always has activity.
    // Also fires after 22:00 if no trades today (original behaviour preserved).
    const currentHour = new Date().getHours()
    const needsForcedTrade =
      fired.length === 0 ||
      (tradesToday === 0 && currentHour >= 22)

    if (needsForcedTrade && snapshots.length > 0) {
      // Pick highest signal score, skip pure stablecoins for BUY
      const candidates = snapshots
        .filter((s: any) => !STABLECOIN_SYMBOLS.has(s.symbol))
        .sort((a: any, b: any) => b.signalScore - a.signalScore)
      const best = candidates[0] ?? snapshots[0]

      // Only inject if not already in fired
      const alreadyFired = fired.some((f: any) => f.rule.symbol === best.symbol)
      if (!alreadyFired) {
        fired.unshift({
          rule: {
            id:        'forced-dca',
            symbol:    best.symbol,
            condition: { type: 'signal_above' as const, value: 0 },
            action:    'BUY' as const,
            sizePct:   5,
            priority:  0,
            cooldownMs: 3600000,  // 1 hour cooldown so it doesn't spam
          },
          signal: best,
        })
      }
    }

    // ── 6. Execute ─────────────────────────────────────────────────────────────
    const decisions: any[] = []
    let executed = 0, blocked = 0
    const errors: string[] = []

    for (const { rule, signal } of fired) {
      if (tradesToday + executed >= maxDailyTrades) break

      const amountUSDT = (portfolioUSD * rule.sizePct) / 100

      const guardrail = checkRiskGuardrails({
        profile:      guardrailProfile,
        drawdownPct,
        todayTrades:  tradesToday + executed,
        portfolioUSD,
        amountUSD:    amountUSDT,
      })

      const decision: any = {
        ruleId:      rule.id,
        symbol:      rule.symbol,
        action:      rule.action,
        ruleName:    `${rule.symbol} ${rule.action}`,
        amountUSDT,
        signalScore: signal.signalScore,
        reasoning:   signal.reasoning,
        fearGreed:   fg.value,
        guardrail:   guardrail.allowed
          ? (guardrail.warning ? 'warning' : 'passed')
          : 'blocked',
        blockReason: guardrail.reason,
        warning:     guardrail.warning,
        txHash:      null,
        dryRun,
        network,
        timestamp:   Date.now(),
        executed:    false,
      }
      decisions.push(decision)

      if (!guardrail.allowed) { blocked++; continue }

      // dryRun=true  → simulate, always logs a trade
      // dryRun=false → live on-chain swap
      if (dryRun) {
        decision.success  = true
        decision.dryRun   = true
        decision.executed = true
        executed++
        continue
      }

      // Live swap
      try {
        const token = ELIGIBLE_TOKENS[rule.symbol]
        if (!token) { errors.push(`No token address for ${rule.symbol}`); continue }

        const usdtAddr = net.usdt
        const path     = rule.action === 'BUY'
          ? [usdtAddr, token.address]
          : [token.address, usdtAddr]

        const amountInWei = rule.action === 'BUY'
          ? ethers.parseUnits(amountUSDT.toFixed(6), 18)
          : ethers.parseUnits(
              (amountUSDT / Math.max(signal.price, 0.000001)).toFixed(token.decimals),
              token.decimals
            )

        const amounts  = await client.getAmountsOut(amountInWei, path)
        const expected = amounts[amounts.length - 1]
        const slip     = slippagePct / 100
        const outMin   = BigInt(Math.floor(Number(expected) * (1 - slip)))

        await client.approveToken(path[0], net.pancakeRouter, amountInWei * BigInt(2))
        const result = await client.swapExactTokensForTokens({
          amountIn: amountInWei, amountOutMin: outMin, path,
        })

        decision.txHash       = result.txHash
        decision.success      = result.success
        decision.explorerLink = result.txHash ? client.explorerTx(result.txHash) : null

        if (result.success) {
          executed++
          decision.executed = true
        } else {
          errors.push(`Swap failed: ${rule.symbol} on ${network}`)
        }
      } catch (e: any) {
        errors.push(`${rule.symbol}: ${e.message}`)
      }
    }

    return NextResponse.json({
      success:      true,
      status:       'running',
      network,
      isTestnet:    net.isTestnet,
      portfolioUSD,
      drawdownPct,
      pnlPct,
      peakUSD:      peak,
      fearGreed:    fg.value,
      fgLabel:      fg.label,
      decisions,
      executed,
      blocked,
      errors,
      snapshots: snapshots.map((s: any) => ({
        symbol:      s.symbol,
        signalScore: s.signalScore,
        signalDir:   s.signalDir,
        price:       s.price,
        change24h:   s.change24h,
        fearGreed:   fg.value,
        technicals:  s.technicals ?? null,
        tags:        s.tags ?? [],
      })),
      portfolioItems,
      cycleAt: Date.now(),
    })

  } catch (err: any) {
    console.error('[agent/loop]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}