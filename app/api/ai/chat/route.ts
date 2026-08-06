/**
 * app/api/ai/chat/route.ts — Hotfix 13
 * Uses Kimi K2 via HuggingFace router.
 * Safe: never throws at module init time — key validated per-request.
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI                        from 'openai'
import { rateLimit }                 from '@/lib/rateLimit'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// Lazy client — created with placeholder at module load, key checked per request
const kimi = new OpenAI({
  apiKey:  process.env.HUGGINGFACE_API_KEY ?? 'placeholder',
  baseURL: 'https://router.huggingface.co/v1',
})

const SYSTEM: Record<string, string> = {
  assistant: `You are Binalyst, an elite AI assistant for BNB Chain and Binance users. You are part of an autonomous trading platform powered by CMC signals and TWAK self-custody signing. Be concise, data-driven, and helpful. Use **bold** for prices and key metrics.`,
  analyst:   `You are Binalyst's market analyst. Provide structured analysis: price → trend → signals → bull/bear cases. Reference CMC Fear & Greed index where relevant.`,
  trader:    `You are Binalyst's trading assistant. Help users understand trade execution on BSC via PancakeSwap. Always warn about risks and drawdown limits.`,
  educator:  `You are Binalyst Academy. Teach crypto and BNB Chain concepts clearly with real examples and practical tips.`,
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`ai:${ip}`, 'ai-chat')
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  // Key check per-request — never at module init
  if (!process.env.HUGGINGFACE_API_KEY) {
    return NextResponse.json(
      { error: 'HUGGINGFACE_API_KEY not set. Add it to your .env file.' },
      { status: 500 }
    )
  }

  try {
    const body = await req.json()
    const { messages = [], mode = 'assistant' } = body

    const history = [
      { role: 'system' as const, content: SYSTEM[mode] ?? SYSTEM.assistant },
      ...messages.map((m: any) => ({
        role:    m.role as 'user' | 'assistant',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
    ]

    const response = await kimi.chat.completions.create({
      model:  'moonshotai/Kimi-K2-Instruct',
      messages: history,
      stream: true,
    })

    const encoder = new TextEncoder()
    const stream  = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            const text = chunk.choices[0]?.delta?.content ?? ''
            if (text) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'text', text })}\n\n`)
              )
            }
          }
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done', toolsUsed: [] })}\n\n`)
          )
        } finally {
          controller.close()
        }
      },
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      },
    })
  } catch (err: any) {
    console.error('[ai/chat]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
