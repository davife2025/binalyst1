/**
 * app/api/goat/x402/route.ts — Session 7
 *
 * x402 payment route for the GOAT Network agent.
 * Used when the agent autonomously pays for premium signal data
 * (CMC premium, Twelve Data paid tier, or any x402-compatible API).
 *
 * Full flow per official GOAT docs:
 *   create → sign (EIP-712) → submit → transfer → status
 */

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit }                 from '@/lib/rateLimit'
import { executeX402Payment }        from '@/lib/goat/agentkit'

export const dynamic     = 'force-dynamic'
export const maxDuration = 55

export interface X402PaymentRequest {
  privateKey: string
  to:         string    // merchant address
  asset:      string    // 'USDC'
  amount:     string    // human-readable e.g. '0.03'
  serviceTag?: string   // label for the payment log e.g. 'CMC signals'
}

export interface X402PaymentRecord {
  paymentId:  string
  serviceTag: string
  asset:      string
  amount:     string
  to:         string
  status:     string
  authorised: boolean
  timestamp:  number
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`goat-x402:${ip}`, 'ai-chat')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  if (!process.env.GOAT_X402_API_KEY) {
    return NextResponse.json({
      error: 'GOAT_X402_API_KEY not configured. x402 payments are disabled.',
    }, { status: 503 })
  }

  try {
    const body = await req.json() as X402PaymentRequest

    if (!body.privateKey) return NextResponse.json({ error: 'privateKey required' }, { status: 400 })
    if (!body.to)         return NextResponse.json({ error: 'to address required' }, { status: 400 })
    if (!body.amount)     return NextResponse.json({ error: 'amount required' },     { status: 400 })

    const result = await executeX402Payment({
      privateKey: body.privateKey,
      to:         body.to,
      asset:      body.asset ?? 'USDC',
      amount:     body.amount,
    })

    const record: X402PaymentRecord = {
      paymentId:  result.paymentId,
      serviceTag: body.serviceTag ?? 'unknown',
      asset:      result.asset,
      amount:     result.amount,
      to:         result.to,
      status:     result.status?.status ?? 'unknown',
      authorised: result.authorized?.status === 'authorized',
      timestamp:  Date.now(),
    }

    return NextResponse.json({ success: true, ...record })

  } catch (err: any) {
    console.error('[goat/x402]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
