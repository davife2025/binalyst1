/**
 * app/api/agent/portfolio/route.ts
 * Fetches live on-chain balances for the agent wallet on BSC (mainnet or testnet).
 * Returns token balances + USD values + BNB balance.
 */

import { NextRequest, NextResponse } from 'next/server'
import { NetworkTWAKClient }         from '@/lib/twak/networkClient'
import { ELIGIBLE_TOKENS }           from '@/lib/twak/client'
import { type Network }              from '@/lib/twak/networks'
import { rateLimit }                 from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`portfolio:${ip}`, 'market')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  try {
    const { privateKey, network = 'testnet', symbols } = await req.json()
    if (!privateKey) return NextResponse.json({ error: 'privateKey required' }, { status: 400 })

    const client = new NetworkTWAKClient(privateKey, network as Network)

    // Tokens to check — either requested symbols or top liquid ones
    const checkSymbols: string[] = symbols?.length
      ? symbols
      : ['USDT', 'FDUSD', 'ETH', 'BNB', 'ADA', 'AVAX', 'LINK', 'CAKE', 'DOGE']

    const holdings = checkSymbols
      .map(sym => ELIGIBLE_TOKENS[sym])
      .filter(Boolean)

    const [bnbBalance, portfolioData] = await Promise.allSettled([
      client.getBNBBalance(),
      client.getPortfolioValueUSD(holdings),
    ])

    const bnb  = bnbBalance.status  === 'fulfilled' ? bnbBalance.value  : 0
    const port = portfolioData.status === 'fulfilled' ? portfolioData.value : { items: [], totalUSD: 0 }

    // Filter to non-zero balances + compute allocation %
    const nonZero = port.items.filter(i => i.valueUSD > 0.01)
    const total   = port.totalUSD
    const items   = nonZero.map(i => ({
      ...i,
      pct: total > 0 ? (i.valueUSD / total) * 100 : 0,
    }))

    return NextResponse.json({
      success:    true,
      network,
      isTestnet:  network === 'testnet',
      address:    client.address,
      bnbBalance: bnb,
      totalUSD:   total,
      items,
      updatedAt:  Date.now(),
    })
  } catch (err: any) {
    console.error('[portfolio]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
