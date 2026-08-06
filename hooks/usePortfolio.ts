'use client'

/**
 * hooks/usePortfolio.ts
 * Session G: Live portfolio sync for the agent wallet on BSC.
 * Polls on-chain balances every 30s and tracks hourly PnL snapshots.
 * Feeds CompetitionTab, PortfolioTab, and the agent loop.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAgentStore } from '@/lib/agentStore'

export interface PortfolioItem {
  symbol:   string
  address:  string
  balance:  number
  priceUSD: number
  valueUSD: number
  pct:      number    // % of total portfolio
}

export interface PortfolioSnapshot {
  items:      PortfolioItem[]
  totalUSD:   number
  bnbBalance: number
  updatedAt:  number
  network:    string
}

export interface HourlyPnL {
  hour:       number    // unix timestamp truncated to hour
  valueUSD:   number
  pnlPct:     number    // vs starting capital
}

const POLL_MS      = 30_000   // 30s live refresh
const HISTORY_MAX  = 168      // 7 days × 24h

export function usePortfolio() {
  const { privateKey, isWalletLoaded, session } = useAgentStore()
  const network = (useAgentStore() as any).network ?? 'testnet'

  const [snapshot,  setSnapshot]  = useState<PortfolioSnapshot | null>(null)
  const [history,   setHistory]   = useState<HourlyPnL[]>([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPortfolio = useCallback(async (silent = false) => {
    if (!privateKey || !isWalletLoaded) return
    if (!silent) setLoading(true)
    setError('')

    try {
      const res  = await fetch('/api/agent/portfolio', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ privateKey, network }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.error ?? 'Portfolio fetch failed'); return }

      const snap: PortfolioSnapshot = {
        items:      data.items ?? [],
        totalUSD:   data.totalUSD ?? 0,
        bnbBalance: data.bnbBalance ?? 0,
        updatedAt:  Date.now(),
        network,
      }
      setSnapshot(snap)

      // Record hourly snapshot for PnL chart
      const nowHour = Math.floor(Date.now() / 3600000) * 3600000
      const startUSD = session?.startValueUSDT ?? snap.totalUSD
      setHistory(prev => {
        const existing = prev.find(h => h.hour === nowHour)
        if (existing) return prev
        const entry: HourlyPnL = {
          hour:     nowHour,
          valueUSD: snap.totalUSD,
          pnlPct:   startUSD > 0
            ? ((snap.totalUSD - startUSD) / startUSD) * 100
            : 0,
        }
        return [...prev, entry].slice(-HISTORY_MAX)
      })
    } catch (e: any) {
      setError(e.message)
    }
    if (!silent) setLoading(false)
  }, [privateKey, isWalletLoaded, network, session?.startValueUSDT])

  // Initial + polling
  useEffect(() => {
    fetchPortfolio()
    timerRef.current = setInterval(() => fetchPortfolio(true), POLL_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [privateKey, network])

  // Derived
  const pnlPct = session?.startValueUSDT && session.startValueUSDT > 0 && snapshot
    ? ((snapshot.totalUSD - session.startValueUSDT) / session.startValueUSDT) * 100
    : 0

  const drawdownPct = session?.peakValueUSDT && session.peakValueUSDT > 0 && snapshot
    ? Math.max(0, ((session.peakValueUSDT - snapshot.totalUSD) / session.peakValueUSDT) * 100)
    : 0

  return {
    snapshot, history, loading, error,
    pnlPct, drawdownPct,
    refresh: () => fetchPortfolio(false),
  }
}
