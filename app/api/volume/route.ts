/**
 * app/api/volume/route.ts — Session 8
 *
 * Returns aggregated volume statistics from the Supabase trades table.
 * Used by the VolumeTab dashboard.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase'
import { getVolumeStats, getRecentTrades, getDailyVolume } from '@/lib/supabase/trades'
import { rateLimit }                 from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`volume:${ip}`, 'market')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  try {
    const body = await req.json() as {
      action:     'stats' | 'recent' | 'daily'
      userId?:    string
      days?:      number
      limit?:     number
      chain?:     string
      marketType?: string
    }

    // Resolve userId from body or from session
    let userId = body.userId
    if (!userId) {
      const db = createServerClient()
      const { data: { user } } = await db.auth.getUser()
      userId = user?.id
    }

    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    if (body.action === 'stats') {
      const stats = await getVolumeStats({ userId, days: body.days ?? 30 })
      return NextResponse.json({ success: true, stats })
    }

    if (body.action === 'recent') {
      const trades = await getRecentTrades({
        userId,
        limit:      body.limit ?? 20,
        chain:      body.chain,
        marketType: body.marketType,
      })
      return NextResponse.json({ success: true, trades })
    }

    if (body.action === 'daily') {
      const daily = await getDailyVolume(userId, body.days ?? 30)
      return NextResponse.json({ success: true, daily })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  } catch (err: any) {
    console.error('[volume]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
