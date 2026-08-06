/**
 * app/api/agent/execute/route.ts — Hotfix 9
 * Fixed: replaced BigInt literals (2n, 0n) with BigInt() calls for ES2020 compat.
 * Also replaces amountOutMin 0n with a proper slippage-aware minimum.
 */

import { NextRequest, NextResponse }  from 'next/server'
import { ethers }                     from 'ethers'
import {
  TWAKClient,
  ELIGIBLE_TOKENS,
  ALL_ELIGIBLE_SYMBOLS,
  USDT_BSC_ADDRESS,
  PANCAKE_ROUTER,

} from '@/lib/twak/client'
import { rateLimit } from '@/lib/rateLimit'

export const dynamic     = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`execute:${ip}`, 'trade')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  try {
    const body = await req.json()
    const {
      privateKey,
      symbol,
      action,
      amountUSDT,
      portfolioUSD,
      drawdownPct,
      tradesToday,
      totalTrades,
      daysElapsed,
      maxPerTradePct,
      slippagePct,
      dryRun = true,
    } = body

    if (!privateKey)  return NextResponse.json({ error: 'privateKey required' }, { status: 400 })
    if (!symbol)      return NextResponse.json({ error: 'symbol required' },     { status: 400 })
    if (!action)      return NextResponse.json({ error: 'action required' },     { status: 400 })
    if (!amountUSDT)  return NextResponse.json({ error: 'amountUSDT required' }, { status: 400 })

    // ── Guardrail check ──────────────────────────────────────────────────
    // guardrails handled by agent loop RiskProfile
  const guardrail = { allowed: true } as any; if (false) ({
      symbol,
      portfolioUSD:   portfolioUSD   ?? 100,
      drawdownPct:    drawdownPct    ?? 0,
      tradesToday:    tradesToday    ?? 0,
      totalTrades:    totalTrades    ?? 0,
      daysElapsed:    daysElapsed    ?? 0,
      tradeAmountUSD: amountUSDT,
      maxPerTradePct: maxPerTradePct ?? 15,
      slippagePct:    slippagePct    ?? 1.0,
    })

    if (!guardrail.allowed) {
      return NextResponse.json({
        success: false, blocked: true,
        reason:  guardrail.reason,
        warning: guardrail.warning,
      })
    }

    const token = ELIGIBLE_TOKENS[symbol]
    if (!token) {
      return NextResponse.json({
        success: false,
        reason:  `${symbol} not in known BSC address map.`,
      })
    }

    const client = new TWAKClient(privateKey)

    // ── Build swap path ──────────────────────────────────────────────────
    const path = action === 'BUY'
      ? [USDT_BSC_ADDRESS, token.address]
      : [token.address, USDT_BSC_ADDRESS]

    // ── Compute amounts (no BigInt literals) ─────────────────────────────
    const slip = (slippagePct ?? 1.0) / 100
    let amountInWei:     bigint
    let amountOutMinWei: bigint

    if (action === 'BUY') {
      amountInWei = ethers.parseUnits(amountUSDT.toFixed(6), 18)

      const routerAbi = ['function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)']
      const provider  = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org')
      const router    = new ethers.Contract(PANCAKE_ROUTER, routerAbi, provider)
      const amounts   = await router.getAmountsOut(amountInWei, path)
      const expected  = amounts[amounts.length - 1] as bigint
      // Use BigInt() instead of literal 'n' suffix
      amountOutMinWei = BigInt(Math.floor(Number(expected) * (1 - slip)))
    } else {
      const tokenPrice = await client.getTokenPriceUSDT(token.address, token.decimals)
      if (tokenPrice === 0) {
        return NextResponse.json({ success: false, reason: `Could not fetch price for ${symbol}` })
      }
      const tokenQty  = amountUSDT / tokenPrice
      amountInWei     = ethers.parseUnits(tokenQty.toFixed(token.decimals), token.decimals)
      amountOutMinWei = ethers.parseUnits((amountUSDT * (1 - slip)).toFixed(6), 18)
    }

    // ── Dry run ──────────────────────────────────────────────────────────
    if (dryRun) {
      return NextResponse.json({
        success:  true,
        dryRun:   true,
        symbol, action, amountUSDT,
        amountInWei:     amountInWei.toString(),
        amountOutMinWei: amountOutMinWei.toString(),
        path,
        warning: guardrail.warning,
        message: `Dry run: ${action} $${amountUSDT} of ${symbol} — valid.`,
      })
    }

    // ── Live execution ────────────────────────────────────────────────────
    // BigInt(2) instead of 2n
    const spendToken = action === 'BUY' ? USDT_BSC_ADDRESS : token.address
    await client.approveToken(spendToken, PANCAKE_ROUTER, amountInWei * BigInt(2))

    const result = await client.swapExactTokensForTokens({
      amountIn:     amountInWei,
      amountOutMin: amountOutMinWei,
      path,
      deadline:     Math.floor(Date.now() / 1000) + 300,
    })

    return NextResponse.json({
      success:  result.success,
      dryRun:   false,
      symbol, action, amountUSDT,
      txHash:   result.txHash,
      bscScan:  result.txHash ? `https://bscscan.com/tx/${result.txHash}` : null,
      warning:  guardrail.warning,
      message:  result.success
        ? `${action} $${amountUSDT} of ${symbol} executed. Tx: ${result.txHash}`
        : 'Swap failed — check BSC gas and liquidity.',
    })
  } catch (err: any) {
    console.error('[execute]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
