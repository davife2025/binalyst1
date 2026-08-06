/**
 * app/api/strategies/route.ts — Session 12
 *
 * REST-style CRUD for user strategies, backed by Supabase.
 *
 * POST body actions:
 *   list   → get all user strategies
 *   save   → create new strategy
 *   update → update existing strategy
 *   delete → delete strategy
 *   setActive → mark one strategy as active
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@/lib/supabase'
import { rateLimit }                 from '@/lib/rateLimit'
import {
  getStrategies, saveStrategy, updateStrategy,
  deleteStrategy, setActiveStrategy,
} from '@/lib/supabase/strategies'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`strategies:${ip}`, 'ai-chat')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  try {
    const body = await req.json() as {
      action:       string
      userId?:      string
      strategyId?:  string
      name?:        string
      text?:        string
      rules?:       object[]
      marketType?:  string
      backtestResult?: object
    }

    // Resolve userId
    let userId = body.userId
    if (!userId) {
      const db = createServerClient()
      const { data: { user } } = await db.auth.getUser()
      userId = user?.id
    }
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    switch (body.action) {
      case 'list': {
        const strategies = await getStrategies(userId)
        return NextResponse.json({ success: true, strategies })
      }
      case 'save': {
        if (!body.text) return NextResponse.json({ error: 'text required' }, { status: 400 })
        const strategy = await saveStrategy({
          user_id:     userId,
          name:        body.name ?? 'My Strategy',
          text:        body.text,
          rules:       body.rules ?? [],
          market_type: body.marketType ?? 'crypto',
        })
        return NextResponse.json({ success: !!strategy, strategy })
      }
      case 'update': {
        if (!body.strategyId) return NextResponse.json({ error: 'strategyId required' }, { status: 400 })
        const ok = await updateStrategy(body.strategyId, {
          name:            body.name,
          text:            body.text,
          rules:           body.rules,
          market_type:     body.marketType,
          backtest_result: body.backtestResult ?? null,
        })
        return NextResponse.json({ success: ok })
      }
      case 'delete': {
        if (!body.strategyId) return NextResponse.json({ error: 'strategyId required' }, { status: 400 })
        const ok = await deleteStrategy(body.strategyId)
        return NextResponse.json({ success: ok })
      }
      case 'setActive': {
        if (!body.strategyId) return NextResponse.json({ error: 'strategyId required' }, { status: 400 })
        const ok = await setActiveStrategy(userId, body.strategyId)
        return NextResponse.json({ success: ok })
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
    }
  } catch (err: any) {
    console.error('[strategies]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
