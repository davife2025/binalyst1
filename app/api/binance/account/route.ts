/**
 * app/api/binance/account/route.ts
 * Authenticated account endpoints — balances, open orders, order history.
 * API key passed in request headers — never stored server-side in this route.
 */

import { NextRequest, NextResponse } from 'next/server'
import { BinanceClient, getCredentialsFromHeaders } from '@/lib/binance'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const creds = getCredentialsFromHeaders(req.headers)
  if (!creds) {
    return NextResponse.json(
      { error: 'Missing Binance API credentials. Add x-binance-key and x-binance-secret headers.' },
      { status: 401 }
    )
  }

  const binance = new BinanceClient(creds)
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  try {
    switch (action) {
      case 'balances': {
        const portfolio = await binance.getPortfolioValue()
        return NextResponse.json({ success: true, data: portfolio })
      }

      case 'open-orders': {
        const symbol = searchParams.get('symbol')?.toUpperCase()
        const orders = await binance.getOpenOrders(symbol)
        return NextResponse.json({ success: true, data: orders })
      }

      case 'order-history': {
        const symbol = searchParams.get('symbol')?.toUpperCase()
        if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
        const limit = parseInt(searchParams.get('limit') || '20')
        const history = await binance.getOrderHistory(symbol, limit)
        return NextResponse.json({ success: true, data: history })
      }

      case 'account': {
        const account = await binance.getAccount()
        // Return safe subset — no commission internals
        return NextResponse.json({
          success: true,
          data: {
            canTrade: account.canTrade,
            canWithdraw: account.canWithdraw,
            canDeposit: account.canDeposit,
            accountType: account.accountType,
          },
        })
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: balances, open-orders, order-history, account' },
          { status: 400 }
        )
    }
  } catch (err: any) {
    console.error('[account route]', err.message)
    // Mask Binance API errors that might expose key info
    const msg = err?.response?.data?.msg || err.message || 'Binance API error'
    return NextResponse.json({ error: msg }, { status: err?.response?.status || 500 })
  }
}
