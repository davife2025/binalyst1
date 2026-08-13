/**
 * app/api/health/route.ts — Session 10
 *
 * Health check endpoint. Returns which features are active based on
 * configured env vars. Used for deploy verification and status monitoring.
 *
 * GET /api/health
 */

import { NextResponse }         from 'next/server'
import { validateEnv, hasSupabaseServiceRole, hasTwelveData, hasGoatKey, hasX402, hasKeeperHubKey } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { ok, missing, warnings } = validateEnv()

  const features = {
    supabase_persistence: hasSupabaseServiceRole(),
    forex_stocks_signals: hasTwelveData(),
    keeperhub_execution:  hasKeeperHubKey(),  // mainnet trades require this
    goat_testnet_dryrun:  hasGoatKey(),
    x402_payments:        hasX402(),
    bsc_agent:            !!process.env.CMC_API_KEY,
  }

  return NextResponse.json({
    status:   ok ? 'ok' : 'degraded',
    env_ok:   ok,
    missing,
    warnings: warnings.length,
    features,
    version:  '2.0.0',
    ts:       new Date().toISOString(),
  }, { status: ok ? 200 : 503 })
}
