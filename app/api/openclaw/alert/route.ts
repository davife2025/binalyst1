import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function verifyAuth(req: NextRequest) {
  const token = req.headers.get('x-openclaw-token') ?? req.headers.get('authorization')?.replace('Bearer ', '')
  return token === process.env.OPENCLAW_SECRET
}

export async function POST(req: NextRequest) {
  if (!verifyAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { symbol, condition, target, channel, chatId } = await req.json()
    if (!symbol || !condition || !target) return NextResponse.json({ error: 'symbol, condition, target required' }, { status: 400 })
    // Store alert — in production save to Supabase
    const alert = { id: crypto.randomUUID(), symbol: symbol.toUpperCase(), condition, target: parseFloat(target), channel, chatId, createdAt: new Date().toISOString() }
    console.log('[openclaw/alert] registered:', alert)
    return NextResponse.json({ success: true, alert, message: `✅ Alert set: ${symbol} ${condition} $${target}` })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
