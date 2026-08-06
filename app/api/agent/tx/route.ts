/**
 * app/api/agent/tx/route.ts — Session K (NEW)
 *
 * Receives already-signed transactions from the browser and broadcasts
 * them to the BSC RPC. The private key never touches this server.
 *
 * Flow:
 *   Browser signs tx locally → POST signed hex here → broadcast to BSC → return txHash
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers }                    from 'ethers'
import { NETWORKS, type Network }    from '@/lib/twak/networks'
import { rateLimit }                 from '@/lib/rateLimit'

export const dynamic     = 'force-dynamic'
export const maxDuration = 20

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`tx:${ip}`, 'trade')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  try {
    const {
      signedTxHex,   // hex string of fully signed transaction
      network = 'testnet' as Network,
      symbol,
      action,
      amountUSDT,
    } = await req.json()

    if (!signedTxHex) {
      return NextResponse.json({ error: 'signedTxHex required' }, { status: 400 })
    }

    const net      = NETWORKS[network as Network]
    const provider = new ethers.JsonRpcProvider(net.rpc)

    // Broadcast signed transaction — server just relays, never has the key
    const txResponse = await provider.broadcastTransaction(signedTxHex)
    const receipt    = await txResponse.wait(1)  // wait 1 confirmation

    if (!receipt) {
      return NextResponse.json({ success: false, error: 'Transaction failed — no receipt' })
    }

    return NextResponse.json({
      success:      true,
      txHash:       receipt.hash,
      blockNumber:  receipt.blockNumber,
      gasUsed:      receipt.gasUsed.toString(),
      explorerLink: `${net.explorerTx}${receipt.hash}`,
      network,
      symbol,
      action,
      amountUSDT,
    })
  } catch (err: any) {
    console.error('[agent/tx]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
