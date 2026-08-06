'use client'

/**
 * hooks/useSignals.ts
 * Polls CMC signal API every 60s and computes aggregated snapshots.
 * Feeds SignalDashboard and the agent decision loop.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAgentStore } from '@/lib/agentStore'
import type { SignalSnapshot, SignalSummary } from '@/lib/signalEngine'
import type { FearAndGreed } from '@/lib/skills/cmc'

const REFRESH_MS = 60_000   // 1 min polling
const BATCH_SIZE = 12        // tokens per batch request

export type SignalStatus = 'idle' | 'loading' | 'live' | 'error' | 'stale'

export function useSignals(symbols?: string[]) {
  const { agentConfig, setSignal } = useAgentStore()

  const [snapshots,  setSnapshots]  = useState<SignalSnapshot[]>([])
  const [summary,    setSummary]    = useState<SignalSummary | null>(null)
  const [fearGreed,  setFearGreed]  = useState<FearAndGreed | null>(null)
  const [fgHistory,  setFgHistory]  = useState<FearAndGreed[]>([])
  const [status,     setStatus]     = useState<SignalStatus>('idle')
  const [lastFetch,  setLastFetch]  = useState<number | null>(null)
  const [error,      setError]      = useState<string>('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Use agent's allowed list if no symbols provided
  const targetSymbols = (symbols?.length
    ? symbols
    : agentConfig.allowedTokens.length
      ? agentConfig.allowedTokens
      : DEFAULT_SYMBOLS
  ).slice(0, BATCH_SIZE)

  const fetchSignals = useCallback(async (silent = false) => {
    if (!silent) setStatus('loading')
    setError('')

    try {
      // Parallel: Fear & Greed + batch signals
      const [fgRes, batchRes, histRes] = await Promise.allSettled([
        fetch('/api/cmc?action=fear_greed'),
        fetch(`/api/cmc?action=signals_batch&symbols=${targetSymbols.join(',')}`),
        fetch('/api/cmc?action=fear_greed_history&limit=30'),
      ])

      // Fear & Greed
      if (fgRes.status === 'fulfilled' && fgRes.value.ok) {
        const d = await fgRes.value.json()
        if (d.success) setFearGreed(d.data)
      }

      // History
      if (histRes.status === 'fulfilled' && histRes.value.ok) {
        const d = await histRes.value.json()
        if (d.success && d.data?.length) setFgHistory(d.data)
      }

      // Batch signals
      if (batchRes.status === 'fulfilled' && batchRes.value.ok) {
        const d = await batchRes.value.json()
        if (d.success && Array.isArray(d.data)) {
          // Map CMCSignal → SignalSnapshot shape (API already returns snapshot-compatible objects)
          const snaps: SignalSnapshot[] = d.data.map((s: any) => ({
            symbol:      s.symbol,
            price:       s.price       ?? 0,
            change1h:    s.change1h    ?? 0,
            change24h:   s.change24h   ?? 0,
            change7d:    s.change7d    ?? 0,
            volume24h:   s.volume24h   ?? 0,
            marketCap:   s.marketCap   ?? 0,
            fearGreed:   s.fearGreed   ?? 50,
            fgLabel:     s.fgLabel     ?? 'Neutral',
            momentum:    s.momentum    ?? 0,
            volumeSpike: s.volumeSpike ?? 1,
            trendScore:  s.trendScore  ?? 50,
            signalScore: s.signalScore ?? 50,
            signalDir:   s.signalDir   ?? 'HOLD',
            confidence:  s.confidence  ?? 'LOW',
            reasoning:   s.reasoning   ?? '',
            tags:        s.tags        ?? [],
            updatedAt:   Date.now(),
          }))

          setSnapshots(snaps)

          // Persist to agent store signal cache
          snaps.forEach(s => setSignal(s.symbol, s.signalScore, s.signalDir, s.reasoning))

          // Compute summary
          const buys  = snaps.filter(s => s.signalDir === 'BUY')
          const sells = snaps.filter(s => s.signalDir === 'SELL')
          const holds = snaps.filter(s => s.signalDir === 'HOLD')
          const avg   = snaps.length
            ? snaps.reduce((a, b) => a + b.signalScore, 0) / snaps.length
            : 50

          setSummary({
            bullishCount: buys.length,
            bearishCount: sells.length,
            neutralCount: holds.length,
            avgScore:     avg,
            topBuy:  buys.sort((a, b) => b.signalScore - a.signalScore)[0]  ?? null,
            topSell: sells.sort((a, b) => a.signalScore - b.signalScore)[0] ?? null,
            fearGreed: fearGreed ?? { value: 50, label: 'Neutral', timestamp: '', classification: 'neutral' },
            updatedAt: Date.now(),
          })
        }
      }

      setStatus('live')
      setLastFetch(Date.now())
    } catch (e: any) {
      setError(e.message)
      setStatus(lastFetch ? 'stale' : 'error')
    }
  }, [targetSymbols.join(','), fearGreed])

  // Initial fetch + polling
  useEffect(() => {
    fetchSignals()
    timerRef.current = setInterval(() => fetchSignals(true), REFRESH_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [targetSymbols.join(',')])

  return {
    snapshots, summary, fearGreed, fgHistory,
    status, lastFetch, error,
    refresh: () => fetchSignals(false),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fear & Greed only hook — lighter weight for header/mini indicators
// ─────────────────────────────────────────────────────────────────────────────

export function useFearAndGreed(pollMs = 300_000) {
  const [data,      setData]      = useState<FearAndGreed | null>(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch('/api/cmc?action=fear_greed')
        const d   = await res.json()
        if (d.success) setData(d.data)
      } catch {}
      setLoading(false)
    }
    fetch_()
    const t = setInterval(fetch_, pollMs)
    return () => clearInterval(t)
  }, [pollMs])

  return { data, loading }
}

// Default symbol set for signal scanning (competition-eligible, liquid)
const DEFAULT_SYMBOLS = [
  'ETH', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'DOT',
  'UNI', 'CAKE', 'AAVE', 'ATOM',
]
