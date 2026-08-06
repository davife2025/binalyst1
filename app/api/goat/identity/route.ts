/**
 * app/api/goat/identity/route.ts — Session 7
 *
 * ERC-8004 identity registration via GOAT AgentKit.
 * Replaces the broken raw-ethers approach from Session M (Celo).
 * Uses the official erc8004 plugin from @goatnetwork/agentkit.
 */

import { NextRequest, NextResponse }    from 'next/server'
import { rateLimit }                    from '@/lib/rateLimit'
import {
  registerAgentIdentity,
  getAgentReputation,
  buildRegistrationJSON,
  toDataURI,
}                                       from '@/lib/goat/agentkit'
import type { GoatNetwork }             from '@/lib/goat/config'

export const dynamic     = 'force-dynamic'
export const maxDuration = 55

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`goat-identity:${ip}`, 'ai-chat')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  try {
    const body = await req.json() as {
      action:       'register' | 'reputation'
      privateKey:   string
      network:      GoatNetwork
      agentId?:     string
      agentName?:   string
      description?: string
      exposeX402?:  boolean
    }

    if (!body.privateKey) return NextResponse.json({ error: 'privateKey required' }, { status: 400 })

    // ── Reputation query ──────────────────────────────────────────────────
    if (body.action === 'reputation') {
      if (!body.agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })
      const rep = await getAgentReputation({
        privateKey: body.privateKey,
        network:    body.network ?? 'testnet3',
        agentId:    body.agentId,
      })
      return NextResponse.json({ success: true, reputation: rep })
    }

    // ── Registration ──────────────────────────────────────────────────────
    const network     = body.network ?? 'testnet3'
    const agentName   = body.agentName   ?? 'Binalyst Autonomous Trading Agent'
    const description = body.description ??
      'Autonomous multi-market trading agent (crypto, forex, stocks, meme) on GOAT Network. Session 7.'

    // Build registration.json and encode as on-chain data: URI (no IPFS needed)
    const regJSON = buildRegistrationJSON({
      network,
      walletAddress: '',         // filled by route after we get address
      agentName,
      description,
      exposeX402: body.exposeX402 ?? false,
    })
    const agentURI = toDataURI(regJSON)

    const result = await registerAgentIdentity({
      privateKey: body.privateKey,
      network,
      agentURI,
    })

    return NextResponse.json({
      success:        true,
      agentId:        result.agentId,
      registrationOk: result.registrationOk,
      uriOk:          result.uriOk,
      agentURI,
      network,
    })

  } catch (err: any) {
    console.error('[goat/identity]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
