'use client'

import { useEffect, useRef, useState } from 'react'
import { createTickerStream, createDepthStream, type TickerData, type DepthData } from '@/lib/websocket'

const WATCHLIST = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT']

export type WsStatus = 'connecting' | 'connected' | 'disconnected'

export function useTickers(symbols = WATCHLIST) {
  const [tickers, setTickers] = useState<Record<string, TickerData>>({})
  const [status, setStatus] = useState<WsStatus>('connecting')
  const wsRef = useRef<any>(null)

  useEffect(() => {
    wsRef.current = createTickerStream(
      symbols,
      (tick) => setTickers(prev => ({ ...prev, [tick.symbol]: tick })),
      setStatus
    )
    return () => wsRef.current?.close()
  }, [symbols.join(',')])

  return { tickers, status }
}

export function useOrderBook(symbol: string) {
  const [depth, setDepth] = useState<DepthData | null>(null)
  const [status, setStatus] = useState<WsStatus>('connecting')
  const wsRef = useRef<any>(null)

  useEffect(() => {
    if (!symbol) return
    setDepth(null)
    wsRef.current?.close()
    wsRef.current = createDepthStream(symbol, setDepth, setStatus)
    return () => wsRef.current?.close()
  }, [symbol])

  return { depth, status }
}
