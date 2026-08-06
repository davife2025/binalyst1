/**
 * app/api/agent/strategy/route.ts
 * Parses natural language trading strategy into structured StrategyRule[]
 * using Kimi K2. Also validates rules against competition constraints.
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { rateLimit } from '@/lib/rateLimit'
import { ALL_ELIGIBLE_SYMBOLS } from '@/lib/twak/client'
import { parseSimpleStrategy } from '@/lib/signalEngine'

export const dynamic     = 'force-dynamic'
export const maxDuration = 30

const kimi = new OpenAI({
  apiKey:  process.env.HUGGINGFACE_API_KEY ?? 'placeholder',
  baseURL: 'https://router.huggingface.co/v1',
})

const STRATEGY_SYSTEM = `You are a trading strategy parser for Binalyst, a BSC autonomous trading agent competing in the OpenClaw AI Hackathon.

Your job: parse the user's natural-language strategy into a structured JSON array of trading rules.

COMPETITION CONSTRAINTS (must be enforced in every strategy):
- Only these symbols are eligible: ${ALL_ELIGIBLE_SYMBOLS.slice(0, 40).join(', ')} ... (149 total BEP-20 tokens on BSC)
- Agent must execute at least 1 trade per day (7 minimum over 7-day window)
- Portfolio must stay above $1 at all times (sub-$1 = 0% for that hour)
- Max drawdown 30% → disqualification. Be conservative.
- Returns measured hour by hour — capital must stay deployed

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown, no explanation:
{
  "rules": [
    {
      "id": "unique_string",
      "symbol": "ETH",
      "condition": {
        "type": "fear_below",
        "value": 30
      },
      "action": "BUY",
      "sizePct": 10,
      "priority": 1,
      "cooldownMs": 3600000,
      "reasoning": "why this rule makes sense"
    }
  ],
  "summary": "One paragraph explaining the overall strategy",
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "minTradesPerDay": 1,
  "warnings": ["any warnings about the strategy"]
}

Condition types allowed:
- fear_below / fear_above (value: 0-100 Fear & Greed)
- signal_above / signal_below (value: 0-100 signal score)
- change24h_above / change24h_below (value: percentage)
- price_above / price_below (value: USD price)
- tag_includes (tag: "dca_zone" | "volume_spike" | "oversold" | "overbought" | "trending_cmc" | "extreme_fear" | "extreme_greed")
- and / or (left/right: nested conditions)

Actions: BUY | SELL | HOLD
sizePct: 5-25 (% of portfolio per trade — keep conservative to avoid drawdown)
cooldownMs: minimum ms between rule triggers (3600000 = 1h, 86400000 = 1d)
priority: higher = evaluated first

IMPORTANT:
- If a symbol isn't in the eligible list, substitute the closest eligible token
- Always include at least one sell/exit rule to avoid holding indefinitely
- Keep sizePct conservative (≤15%) to protect against drawdown disqualification
- Strategy must guarantee at least 1 trade/day to meet minimum trade count`

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`strategy:${ip}`, 'ai-chat')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  try {
    const { strategyText } = await req.json()
    if (!strategyText?.trim()) {
      return NextResponse.json({ error: 'strategyText required' }, { status: 400 })
    }

    // Fast path: try simple regex parser first
    const simpleRules = parseSimpleStrategy(strategyText)

    // Always use AI for full parsing
    const response = await kimi.chat.completions.create({
      model: 'moonshotai/Kimi-K2-Instruct',
      messages: [
        { role: 'system',  content: STRATEGY_SYSTEM },
        { role: 'user',    content: `Parse this trading strategy:\n\n${strategyText}` },
      ],
      temperature: 0.2,   // low temp for deterministic JSON
    })

    const raw = response.choices[0]?.message?.content ?? ''

    // Parse JSON — strip any accidental markdown fences
    const clean = raw.replace(/```json|```/g, '').trim()
    let parsed: any

    try {
      parsed = JSON.parse(clean)
    } catch {
      // Fallback to simple rules if AI JSON is malformed
      return NextResponse.json({
        success: true,
        rules:   simpleRules,
        summary: 'Strategy parsed using fast-path rule engine.',
        riskLevel: 'MEDIUM',
        minTradesPerDay: 1,
        warnings: ['AI parser returned invalid JSON — used fast-path parser instead.'],
        source: 'fast-path',
      })
    }

    // Validate all symbols against eligible list
    const rules = (parsed.rules ?? []).map((r: any) => ({
      ...r,
      id: r.id ?? crypto.randomUUID(),
      symbol: ALL_ELIGIBLE_SYMBOLS.includes(r.symbol) ? r.symbol : 'ETH', // fallback
    }))

    // Enforce max sizePct
    rules.forEach((r: any) => {
      if (r.sizePct > 25) r.sizePct = 25
      if (r.sizePct < 5)  r.sizePct = 5
    })

    return NextResponse.json({
      success:         true,
      rules,
      summary:         parsed.summary         ?? '',
      riskLevel:       parsed.riskLevel        ?? 'MEDIUM',
      minTradesPerDay: parsed.minTradesPerDay  ?? 1,
      warnings:        parsed.warnings         ?? [],
      source:          'ai',
    })
  } catch (err: any) {
    console.error('[strategy]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
