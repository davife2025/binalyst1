/**
 * lib/supabase/trades.ts — Session 8
 *
 * Trade persistence layer. Writes confirmed/simulated trades from both
 * the BSC agent and GOAT agent to Supabase for cross-chain volume tracking.
 *
 * Uses the service role client (server-side only) to bypass RLS on inserts,
 * since the agent runs headlessly without a user session token.
 */

import { createServerClient } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TradeInsert {
  user_id:          string
  chain:            string
  market_type:      string
  symbol:           string
  side:             'buy' | 'sell' | 'BUY' | 'SELL'
  amount_usd:       number
  pnl_usd?:         number
  tx_hash?:         string | null
  status:           'confirmed' | 'simulated' | 'failed' | 'blocked'
  dry_run:          boolean
  signal_score?:    number | null
  regime?:          string | null
  risk_preset?:     string | null
  risk_drawdown?:   number | null
  x402_payment_id?: string | null
  executed_at?:     string   // ISO string
}

export interface TradeRow extends TradeInsert {
  id:         string
  created_at: string
}

export interface VolumeStats {
  total_usd:      number
  trade_count:    number
  confirmed:      number
  simulated:      number
  pnl_usd:        number
  by_chain:       Record<string, number>
  by_market_type: Record<string, number>
  by_day:         Array<{ date: string; usd: number; count: number }>
}

// ─────────────────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a single trade. Called server-side from the agent loop routes
 * after a confirmed or simulated execution.
 * Fire-and-forget — errors are logged but never thrown (don't break the loop).
 */
export async function persistTrade(trade: TradeInsert): Promise<{ id: string } | null> {
  try {
    const db = createServerClient()
    const { data, error } = await (db.from('trades') as any)
      .insert({
        ...trade,
        executed_at: trade.executed_at ?? new Date().toISOString(),
        pnl_usd:    trade.pnl_usd ?? 0,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[trades.persistTrade]', error.message)
      return null
    }
    return data
  } catch (err: any) {
    console.error('[trades.persistTrade] unexpected:', err.message)
    return null
  }
}

/**
 * Batch persist multiple trades in a single insert.
 */
export async function persistTrades(trades: TradeInsert[]): Promise<number> {
  if (!trades.length) return 0
  try {
    const db = createServerClient()
    const { error, count } = await (db.from('trades') as any)
      .insert(trades.map(t => ({
        ...t,
        executed_at: t.executed_at ?? new Date().toISOString(),
        pnl_usd:    t.pnl_usd ?? 0,
      })))
      .select('id')

    if (error) {
      console.error('[trades.persistTrades]', error.message)
      return 0
    }
    return count ?? trades.length
  } catch (err: any) {
    console.error('[trades.persistTrades] unexpected:', err.message)
    return 0
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch recent trades for a user, optionally filtered by chain / market_type.
 */
export async function getRecentTrades(params: {
  userId:      string
  limit?:      number
  chain?:      string
  marketType?: string
  status?:     string
}): Promise<TradeRow[]> {
  const db = createServerClient()
  let q = (db.from('trades') as any)
    .select('*')
    .eq('user_id', params.userId)
    .order('executed_at', { ascending: false })
    .limit(params.limit ?? 50)

  if (params.chain)       q = q.eq('chain',       params.chain)
  if (params.marketType)  q = q.eq('market_type', params.marketType)
  if (params.status)      q = q.eq('status',      params.status)

  const { data, error } = await q
  if (error) {
    console.error('[trades.getRecentTrades]', error.message)
    return []
  }
  return (data ?? []) as TradeRow[]
}

/**
 * Aggregate volume statistics for the Volume Dashboard.
 * Groups by chain, market_type, and day.
 */
export async function getVolumeStats(params: {
  userId:  string
  days?:   number   // default 30
}): Promise<VolumeStats> {
  const db = createServerClient()
  const since = new Date()
  since.setDate(since.getDate() - (params.days ?? 30))

  const { data, error } = await (db.from('trades') as any)
    .select('chain, market_type, amount_usd, pnl_usd, status, executed_at')
    .eq('user_id', params.userId)
    .gte('executed_at', since.toISOString())
    .order('executed_at', { ascending: true })

  if (error || !data) {
    return { total_usd: 0, trade_count: 0, confirmed: 0, simulated: 0, pnl_usd: 0, by_chain: {}, by_market_type: {}, by_day: [] }
  }

  const stats: VolumeStats = {
    total_usd:      0,
    trade_count:    data.length,
    confirmed:      0,
    simulated:      0,
    pnl_usd:        0,
    by_chain:       {},
    by_market_type: {},
    by_day:         [],
  }

  const byDay: Record<string, { usd: number; count: number }> = {}

  for (const row of data) {
    const usd    = Number(row.amount_usd) || 0
    const pnl    = Number(row.pnl_usd)   || 0
    const day    = row.executed_at.slice(0, 10)

    stats.total_usd += usd
    stats.pnl_usd   += pnl
    if (row.status === 'confirmed') stats.confirmed++
    else if (row.status === 'simulated') stats.simulated++

    // By chain
    stats.by_chain[row.chain] = (stats.by_chain[row.chain] ?? 0) + usd

    // By market type
    stats.by_market_type[row.market_type] = (stats.by_market_type[row.market_type] ?? 0) + usd

    // By day
    if (!byDay[day]) byDay[day] = { usd: 0, count: 0 }
    byDay[day].usd   += usd
    byDay[day].count += 1
  }

  stats.by_day = Object.entries(byDay)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return stats
}

/**
 * Get a daily breakdown of volume for chart rendering.
 * Fills in zero days so the chart line is continuous.
 */
export async function getDailyVolume(userId: string, days = 30): Promise<Array<{ date: string; usd: number; count: number }>> {
  const stats = await getVolumeStats({ userId, days })

  // Build a full date range
  const result: Array<{ date: string; usd: number; count: number }> = []
  const existing = new Map(stats.by_day.map(d => [d.date, d]))

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    result.push(existing.get(dateStr) ?? { date: dateStr, usd: 0, count: 0 })
  }

  return result
}