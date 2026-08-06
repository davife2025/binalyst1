/**
 * app/api/binance/market/route.ts
 * Public market data — prices, tickers, klines, top movers
 * No API key required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { publicMarket } from '@/lib/binance'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  try {
    switch (action) {
      case 'prices': {
        const symbols = (searchParams.get('symbols') || 'BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT')
          .split(',')
          .map(s => s.trim().toUpperCase())
        const prices = await publicMarket.getPrices(symbols)
        return NextResponse.json({ success: true, data: prices })
      }

      case 'movers': {
        const limit = parseInt(searchParams.get('limit') || '10')
        const movers = await publicMarket.getTopMovers(limit)
        return NextResponse.json({ success: true, data: movers })
      }

      case 'klines': {
        const symbol = searchParams.get('symbol')?.toUpperCase()
        const interval = searchParams.get('interval') || '1h'
        const limit = parseInt(searchParams.get('limit') || '100')
        if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
        const klines = await publicMarket.getKlines(symbol, interval, limit)
        return NextResponse.json({ success: true, data: klines })
      }

      case 'ticker': {
        const symbol = searchParams.get('symbol')?.toUpperCase()
        if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
        const prices = await publicMarket.getPrices([symbol])
        return NextResponse.json({ success: true, data: { symbol, price: prices[symbol] } })
      }

      default:
        return NextResponse.json({ error: 'Invalid action. Use: prices, movers, klines, ticker' }, { status: 400 })
    }
  } catch (err: any) {
    console.error('[market route]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
