import { NextRequest, NextResponse } from 'next/server'
import { publicMarket } from '@/lib/binance'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? 'BTC').toUpperCase()
  const pair   = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`
  try {
    const prices = await publicMarket.getPrices([pair])
    const price  = prices[pair]
    if (!price) return NextResponse.json({ error: 'Symbol not found' }, { status: 404 })
 return NextResponse.json({ success: true, symbol, pair, price, formatted: `$${price.toLocaleString('en', { maximumFractionDigits: 4 })}` })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
