/**
 * app/api/events/scan/route.ts — Hotfix 10
 * Removed hard @vercel/kv import — uses optional dynamic import with
 * in-memory fallback so build succeeds without the package installed.
 *
 * To enable Vercel KV caching:
 *   npm install @vercel/kv
 *   Add KV env vars from Vercel dashboard → Storage → KV
 */

import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export const dynamic     = 'force-dynamic'
export const maxDuration = 30

// ── In-memory cache (fallback when KV not available) ─────────────────────────
let memCache: { data: any[]; ts: number } | null = null
const CACHE_TTL_MS = 3_600_000   // 1 hour

// ── Event types ───────────────────────────────────────────────────────────────
type EventType = 'listing' | 'trading' | 'airdrop' | 'launchpool' | 'other'

interface BinanceEvent {
  id:          string
  title:       string
  datetime:    string
  type:        EventType
  description: string
  url:         string
  scannedAt:   string
}

// ── Scanner ───────────────────────────────────────────────────────────────────
async function scanEvents(): Promise<BinanceEvent[]> {
  const events: BinanceEvent[] = []
  const now = new Date().toISOString()

  try {
    // Binance announcements feed
    const { data } = await axios.get(
      'https://www.binance.com/bapi/composite/v1/public/cms/article/list/query',
      {
        params: { type: 1, pageNo: 1, pageSize: 20 },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000,
      }
    )

    const articles = data?.data?.articles ?? data?.data?.catalogs?.[0]?.articles ?? []

    for (const article of articles.slice(0, 20)) {
      const title = article.title ?? ''
      const type  = classifyEvent(title)
      events.push({
        id:          `bn-${article.id ?? Math.random().toString(36).slice(2)}`,
        title,
        datetime:    article.releaseDate
          ? new Date(article.releaseDate).toISOString()
          : now,
        type,
        description: article.brief ?? '',
        url:         article.code
          ? `https://www.binance.com/en/support/announcement/${article.code}`
          : 'https://www.binance.com/en/support/announcement',
        scannedAt:   now,
      })
    }
  } catch {
    // Fallback: return a placeholder so the UI shows something
    events.push({
      id:          'placeholder-1',
      title:       'Scan completed — check Binance announcements for latest events',
      datetime:    now,
      type:        'other',
      description: 'Live scanning temporarily unavailable. Visit binance.com/support/announcement for updates.',
      url:         'https://www.binance.com/en/support/announcement',
      scannedAt:   now,
    })
  }

  return events
}

function classifyEvent(title: string): EventType {
  const t = title.toLowerCase()
  if (t.includes('list') || t.includes('will list') || t.includes('adds'))
    return 'listing'
  if (t.includes('launchpool') || t.includes('launch pool') || t.includes('farm'))
    return 'launchpool'
  if (t.includes('airdrop') || t.includes('hodler') || t.includes('alpha'))
    return 'airdrop'
  if (t.includes('trading') || t.includes('trade') || t.includes('pair'))
    return 'trading'
  return 'other'
}

// ── KV helpers (fully optional) ───────────────────────────────────────────────
async function kvGet(key: string): Promise<any> {
  try {
    const { kv } = await import('@vercel/kv')
    return await kv.get(key)
  } catch {
    // @vercel/kv not installed or KV not configured — use memory cache
    if (memCache && Date.now() - memCache.ts < CACHE_TTL_MS) {
      return memCache.data
    }
    return null
  }
}

async function kvSet(key: string, value: any): Promise<void> {
  try {
    const { kv } = await import('@vercel/kv')
    await kv.set(key, value, { ex: 3600 })
  } catch {
    // Fallback to memory cache
    memCache = { data: value, ts: Date.now() }
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body  = await req.json().catch(() => ({}))
    const force = body.force === true

    // Try cache first
    if (!force) {
      const cached = await kvGet('binalyst:events')
      if (cached) {
        return NextResponse.json({ success: true, data: cached, cached: true })
      }
    }

    // Scan
    const events = await scanEvents()

    // Cache result
    await kvSet('binalyst:events', events)

    return NextResponse.json({ success: true, data: events, cached: false })
  } catch (err: any) {
    console.error('[events/scan]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
