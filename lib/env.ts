/**
 * lib/env.ts — Session 10
 *
 * Environment validation. Import this at the top of any server-side file
 * that needs critical env vars. Throws clearly at startup rather than
 * producing cryptic runtime errors mid-trade.
 *
 * Usage:
 *   import { requireEnv, validateEnv } from '@/lib/env'
 *   const apiKey = requireEnv('CMC_API_KEY')
 *
 * Or call validateEnv() once in instrumentation.ts to check everything
 * before the first request is served.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Env var registry — what's required vs optional
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED: string[] = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'CMC_API_KEY',
]

const OPTIONAL: Record<string, string> = {
  'SUPABASE_SERVICE_ROLE_KEY': 'Required for trade persistence (Session 8)',
  'TWELVE_DATA_API_KEY':       'Required for forex/stocks signals and live prices (Sessions 4, 9)',
  'KEEPERHUB_API_KEY':        'Required for mainnet execution — KeeperHub signs/broadcasts all live trades (see lib/keeperhub)',
  'KEEPERHUB_API_BASE_URL':   'Override KeeperHub API base URL (defaults to https://app.keeperhub.com)',
  'GOAT_AGENT_PRIVATE_KEY':   'Testnet3-only local dry-run fallback — never used for mainnet trades',
  'GOAT_X402_API_KEY':        'Required for x402 autonomous payments (Session 7)',
  'GOAT_X402_BASE_URL':       'Required for x402 autonomous payments (Session 7)',
  'NEXTAUTH_SECRET':           'Required for session auth',
  'NEXTAUTH_URL':              'Required for session auth in production',
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a required env var. Throws a descriptive error if missing.
 * Server-side only (never call on client — env vars are not exposed).
 */
export function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required environment variable: ${key}`)
  return val
}

/**
 * Get an optional env var. Returns undefined if not set.
 */
export function optionalEnv(key: string): string | undefined {
  return process.env[key] || undefined
}

/**
 * Validate all known env vars at startup. Logs warnings for optional vars.
 * Throws if any required var is missing.
 * Call from instrumentation.ts or app/api/health/route.ts.
 */
export function validateEnv(): { ok: boolean; missing: string[]; warnings: string[] } {
  const missing:  string[] = []
  const warnings: string[] = []

  for (const key of REQUIRED) {
    if (!process.env[key]) missing.push(key)
  }

  for (const [key, desc] of Object.entries(OPTIONAL)) {
    if (!process.env[key]) warnings.push(`${key}: ${desc}`)
  }

  if (missing.length > 0) {
    const msg = `Missing required env vars:\n  ${missing.join('\n  ')}\n\nAdd them to .env.local and restart.`
    console.error('[env]', msg)
  }

  if (warnings.length > 0 && process.env.NODE_ENV !== 'production') {
    console.warn('[env] Optional env vars not set (some features will be disabled):')
    for (const w of warnings) console.warn(' ', w)
  }

  return { ok: missing.length === 0, missing, warnings }
}

/** Safe feature-flag helpers — use in API routes to gracefully degrade */
export const hasSupabaseServiceRole = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY
export const hasTwelveData          = () => !!process.env.TWELVE_DATA_API_KEY
export const hasGoatKey             = () => !!process.env.GOAT_AGENT_PRIVATE_KEY
export const hasX402                = () => !!process.env.GOAT_X402_API_KEY && !!process.env.GOAT_X402_BASE_URL
export const hasKeeperHubKey        = () => !!process.env.KEEPERHUB_API_KEY
