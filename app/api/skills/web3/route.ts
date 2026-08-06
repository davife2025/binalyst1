/**
 * app/api/skills/web3/route.ts
 * Unified API route for all Binance Web3 Skills Hub endpoints.
 * All public — no auth required unless fetching personal Alpha data.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getMarketRankings,
  getTokenInfo,
  searchToken,
  getTokenAudit,
  getAddressInfo,
  getAddressTokenHoldings,
  getMemeRush,
  getAlphaTokens,
  type RankType,
} from '@/lib/skills/web3'
import { rateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`skills:${ip}`, 'market')
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const body = await req.json()
  const { skill, ...params } = body

  try {
    switch (skill) {

      // ── crypto-market-rank ────────────────────────────────────────────────
      case 'market_rank': {
        const data = await getMarketRankings({
          rankType: params.rankType as RankType,
          chainId:  params.chainId,
          period:   params.period,
          page:     params.page,
          size:     params.size,
        })
        return NextResponse.json({ success: true, skill, data })
      }

      // ── query-token-info ──────────────────────────────────────────────────
      case 'token_info': {
        const data = params.keyword
          ? await searchToken({ keyword: params.keyword, chainId: params.chainId })
          : await getTokenInfo({ address: params.address, chainId: params.chainId })
        return NextResponse.json({ success: true, skill, data })
      }

      // ── query-token-audit ─────────────────────────────────────────────────
      case 'token_audit': {
        if (!params.address) {
          return NextResponse.json({ error: 'address required' }, { status: 400 })
        }
        const data = await getTokenAudit({ address: params.address, chainId: params.chainId })
        return NextResponse.json({ success: true, skill, data })
      }

      // ── query-address-info ────────────────────────────────────────────────
      case 'address_info': {
        if (!params.address) {
          return NextResponse.json({ error: 'address required' }, { status: 400 })
        }
        const [info, holdings] = await Promise.allSettled([
          getAddressInfo({ address: params.address, chainId: params.chainId }),
          getAddressTokenHoldings({ address: params.address, chainId: params.chainId }),
        ])
        return NextResponse.json({
          success: true, skill,
          data: {
            info:     info.status === 'fulfilled' ? info.value : null,
            holdings: holdings.status === 'fulfilled' ? holdings.value : [],
          },
        })
      }

      // ── meme-rush ─────────────────────────────────────────────────────────
      case 'meme_rush': {
        const data = await getMemeRush({
          chainId: params.chainId,
          sortBy:  params.sortBy,
          page:    params.page,
          size:    params.size,
        })
        return NextResponse.json({ success: true, skill, data })
      }

      // ── binance-alpha ─────────────────────────────────────────────────────
      case 'alpha_tokens': {
        const data = await getAlphaTokens()
        return NextResponse.json({ success: true, skill, data })
      }

      default:
        return NextResponse.json({ error: `Unknown skill: ${skill}` }, { status: 400 })
    }
  } catch (err: any) {
    console.error(`[skills/web3] ${skill}:`, err.message)
    return NextResponse.json(
      { error: err?.response?.data?.message || err.message || 'Skill error' },
      { status: err?.response?.status || 500 }
    )
  }
}
