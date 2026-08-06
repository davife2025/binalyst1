/**
 * app/api/agent/status/route.ts — Session H (REPLACES Session A)
 * Network-aware: uses NetworkTWAKClient for mainnet or testnet balance checks.
 */

import { NextRequest, NextResponse } from 'next/server'
import { NetworkTWAKClient }         from '@/lib/twak/networkClient'
import { ELIGIBLE_TOKENS }           from '@/lib/twak/client'
import { type Network }              from '@/lib/twak/networks'
import { rateLimit }                 from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'


export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`agent-status:${ip}`, 'market')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  try {
    const { privateKey, network = 'testnet', tokens = ['USDT', 'FDUSD'] } = await req.json()
    if (!privateKey) return NextResponse.json({ error: 'privateKey required' }, { status: 400 })

    const client = new NetworkTWAKClient(privateKey, network as Network)

    const [bnbBalance, isRegistered, ...tokenResults] = await Promise.allSettled([
      client.getBNBBalance(),
      client.isRegistered(),
      ...tokens.map((sym: string) => {
        const token = ELIGIBLE_TOKENS[sym]
        return token ? client.getTokenBalance(token.address, token.decimals) : Promise.resolve(0)
      }),
    ])

    const balances: Record<string, number> = {}
    tokens.forEach((sym: string, i: number) => {
      const r = tokenResults[i]
      balances[sym] = r?.status === 'fulfilled' ? (r.value as number) : 0
    })

    return NextResponse.json({
      success:       true,
      network,
      isTestnet:     network === 'testnet',
      address:       client.address,
      bnbBalance:    bnbBalance.status === 'fulfilled' ? bnbBalance.value : 0,
      isRegistered:  isRegistered.status === 'fulfilled' ? isRegistered.value : false,
      tokenBalances: balances,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
