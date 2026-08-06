/**
 * app/api/bitget/route.ts
 * Session O — POST /api/bitget
 *
 * Unified proxy for all Bitget API calls. Keeps credentials server-side.
 *
 * Body: { action, params, credentials? }
 *   action      — method name on BitgetClient
 *   params      — array of positional args
 *   credentials — { apiKey, secretKey, passphrase } (from browser secure store)
 *                 Falls back to env vars if not supplied.
 */

import { NextRequest, NextResponse } from 'next/server'
import { BitgetClient, bitgetClientFromEnv } from '@/lib/bitgetClient'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, params = [], credentials } = body

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }

    // Build client — prefer supplied credentials, fall back to env
    let client: BitgetClient | null = null
    if (credentials?.apiKey && credentials?.secretKey && credentials?.passphrase) {
      client = new BitgetClient(credentials)
    } else {
      client = bitgetClientFromEnv()
    }

    if (!client) {
      return NextResponse.json(
        { error: 'No Bitget credentials. Set BITGET_API_KEY, BITGET_SECRET_KEY, BITGET_PASSPHRASE in .env.local or connect via the Bitget Connect tab.' },
        { status: 401 },
      )
    }

    // Validate action exists on client
    const method = (client as any)[action]
    if (typeof method !== 'function') {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    const result = await method.apply(client, params)
    return NextResponse.json({ success: true, data: result })

  } catch (err: any) {
    console.error('[bitget]', err?.message)
    return NextResponse.json(
      { error: err?.message ?? 'Bitget API error' },
      { status: 500 },
    )
  }
}

// GET /api/bitget?action=ping — health check (no auth needed)
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')
  if (action === 'ping') {
    return NextResponse.json({ ok: true, ts: Date.now() })
  }
  // Check if env creds are set (without exposing them)
  const hasEnvCreds = !!(
    process.env.BITGET_API_KEY &&
    process.env.BITGET_SECRET_KEY &&
    process.env.BITGET_PASSPHRASE
  )
  return NextResponse.json({ hasEnvCreds })
}
