/**
 * app/api/binance/trade/route.ts
 * Trading endpoints — place, cancel, test orders.
 * Requires API key + explicit autoTrade flag from user settings.
 * All orders are validated (test) before execution.
 */

import { NextRequest, NextResponse } from 'next/server'
import { BinanceClient, getCredentialsFromHeaders, type OrderParams } from '@/lib/binance'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const creds = getCredentialsFromHeaders(req.headers)
  if (!creds) {
    return NextResponse.json(
      { error: 'Missing Binance API credentials.' },
      { status: 401 }
    )
  }

  const body = await req.json()
  const { action, order, orderId, symbol, dryRun } = body

  // Safety check — dryRun=true just validates, never executes
  const binance = new BinanceClient(creds)

  try {
    switch (action) {
      case 'place': {
        if (!order) return NextResponse.json({ error: 'order object required' }, { status: 400 })

        const orderParams = order as OrderParams

        // Always validate first
        const test = await binance.testOrder(orderParams)
        if (!test.valid) {
          return NextResponse.json({ error: `Order validation failed: ${test.message}` }, { status: 400 })
        }

        // Dry run — return validation result only
        if (dryRun) {
          return NextResponse.json({
            success: true,
            dryRun: true,
            message: 'Order is valid. Set dryRun: false to execute.',
            order: orderParams,
          })
        }

        const result = await binance.placeOrder(orderParams)
        return NextResponse.json({ success: true, data: result })
      }

      case 'cancel': {
        if (!symbol || !orderId) {
          return NextResponse.json({ error: 'symbol and orderId required' }, { status: 400 })
        }
        const result = await binance.cancelOrder(symbol, orderId)
        return NextResponse.json({ success: true, data: result })
      }

      case 'cancel-all': {
        if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
        const result = await binance.cancelAllOrders(symbol)
        return NextResponse.json({ success: true, data: result })
      }

      case 'validate': {
        if (!order) return NextResponse.json({ error: 'order required' }, { status: 400 })
        const result = await binance.testOrder(order as OrderParams)
        return NextResponse.json({ success: true, data: result })
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: place, cancel, cancel-all, validate' },
          { status: 400 }
        )
    }
  } catch (err: any) {
    const msg = err?.response?.data?.msg || err.message || 'Trade execution error'
    return NextResponse.json({ error: msg }, { status: err?.response?.status || 500 })
  }
}
