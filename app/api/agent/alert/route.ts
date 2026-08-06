/**
 * app/api/agent/alert/route.ts
 * Price alert checker for agent tokens.
 * GET: check all active alerts against current CMC prices
 * POST: create a new alert
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTokensBySymbols }        from '@/lib/skills/cmc'
import { rateLimit }                 from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`alerts:${ip}`, 'market')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  try {
    const { searchParams } = new URL(req.url)
    const alertsParam = searchParams.get('alerts')
    if (!alertsParam) return NextResponse.json({ success: true, triggered: [] })

    const alerts: Array<{
      id: string; symbol: string; condition: 'above' | 'below'; target: number
    }> = JSON.parse(alertsParam)

    if (!alerts.length) return NextResponse.json({ success: true, triggered: [] })

    const symbols = [...new Set(alerts.map(a => a.symbol))]
    const tokens  = await getTokensBySymbols(symbols)
    const priceMap: Record<string, number> = {}
    tokens.forEach((t: any) => { priceMap[t.symbol] = t.price })

    const triggered = alerts.filter(alert => {
      const price = priceMap[alert.symbol]
      if (price == null) return false
      return alert.condition === 'above' ? price >= alert.target : price <= alert.target
    }).map(alert => ({
      ...alert,
      currentPrice: priceMap[alert.symbol],
    }))

    return NextResponse.json({ success: true, triggered, prices: priceMap })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
