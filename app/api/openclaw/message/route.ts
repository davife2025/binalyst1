/**
 * app/api/openclaw/message/route.ts — Hotfix 13
 * Handles incoming messages from Telegram/WhatsApp via OpenClaw gateway.
 * Uses Kimi K2 via HuggingFace router (same as all other AI routes).
 * Fixed: was using OPENAI_API_KEY, now correctly uses HUGGINGFACE_API_KEY.
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI                        from 'openai'
import { rateLimit }                 from '@/lib/rateLimit'

export const dynamic     = 'force-dynamic'
export const maxDuration = 30

// ── Kimi K2 via HuggingFace — same pattern as /api/ai/chat ──────────────────
const kimi = new OpenAI({
  apiKey:  process.env.HUGGINGFACE_API_KEY ?? 'placeholder',
  baseURL: 'https://router.huggingface.co/v1',
})

const SYSTEM = `You are Binalyst, a BNB Chain AI Trading Platform assistant accessible via Telegram and WhatsApp.
Keep responses concise (under 300 chars for simple queries, up to 600 for analysis).
Use plain text — no markdown, no asterisks, no headers. Just clear sentences.
You have access to live Binance market data and CMC signals.

Commands you handle:
/price SYMBOL — current price
/movers — top 24h gainers
/events — upcoming Binance events  
/help — show commands
Anything else — answer naturally as a crypto/trading assistant.`

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`openclaw:${ip}`, 'ai-chat')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  // Verify shared secret from OpenClaw gateway
  const secret    = req.headers.get('x-openclaw-secret')
  const envSecret = process.env.OPENCLAW_SECRET
  if (envSecret && secret !== envSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body    = await req.json()
    const message = body.message ?? body.text ?? ''
    const from    = body.from    ?? body.sender ?? 'user'
    const channel = body.channel ?? 'telegram'

    if (!message.trim()) {
      return NextResponse.json({ reply: 'Send a message to get started. Try /help' })
    }

    // Handle simple slash commands without AI round-trip
    const cmd = message.trim().toLowerCase()

    if (cmd === '/help') {
      return NextResponse.json({
        reply: `Binalyst commands:\n/price BTC — live price\n/movers — top gainers\n/events — Binance events\nOr just ask anything about crypto!`,
      })
    }

    if (cmd.startsWith('/price ')) {
      const symbol = cmd.replace('/price ', '').toUpperCase().trim()
      try {
        const res  = await fetch(`${getBaseUrl(req)}/api/binance/market?action=ticker&symbol=${symbol}USDT`)
        const data = await res.json()
        if (data.success) {
          return NextResponse.json({ reply: `${symbol}: $${data.data.price}` })
        }
      } catch {}
    }

    if (cmd === '/movers') {
      try {
        const res  = await fetch(`${getBaseUrl(req)}/api/binance/market?action=movers&limit=5`)
        const data = await res.json()
        if (data.success && data.data?.length) {
          const list = data.data
            .slice(0, 5)
            .map((t: any) => `${t.symbol.replace('USDT','')}: ${t.change >= 0 ? '+' : ''}${t.change.toFixed(1)}%`)
            .join('\n')
          return NextResponse.json({ reply: `Top movers (24h):\n${list}` })
        }
      } catch {}
    }

    // AI response for everything else
    const response = await kimi.chat.completions.create({
      model:    'moonshotai/Kimi-K2-Instruct',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user',   content: message },
      ],
      max_tokens: 300,
    })

    const reply = response.choices[0]?.message?.content ?? 'Sorry, I could not process that.'

    return NextResponse.json({ reply, channel, from })
  } catch (err: any) {
    console.error('[openclaw/message]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'Binalyst OpenClaw gateway active',
    platform: 'BNB Chain AI Trading Platform',
  })
}

function getBaseUrl(req: NextRequest): string {
  const host  = req.headers.get('host') ?? 'localhost:3000'
  const proto = host.includes('localhost') ? 'http' : 'https'
  return `${proto}://${host}`
}
