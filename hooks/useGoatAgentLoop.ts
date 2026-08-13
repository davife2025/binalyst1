'use client'
/**
 * hooks/useGoatAgentLoop.ts — Session 2
 *
 * Client-side hook driving the GOAT Network agent loop.
 * Parallel to hooks/useAgentLoop.ts (BSC agent) — fully independent.
 * Fires every 2 minutes, posts to /api/goat/loop.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useGoatStore }          from '@/lib/goat/store'
import { markAgentRunning, markAgentStopped } from '@/hooks/useAgentAutoRestart'
import type { GoatTrade }  from '@/lib/goat/store'

const LOOP_MS = 120_000

export function useGoatAgentLoop() {
  const {
    privateKey, agentAddress, isWalletLoaded, network, riskProfile,
    marketType, selectedAsset, dryRun,
    alwaysBuyEnabled, alwaysBuySymbol, alwaysBuyPct,
    session, initSession, updateSession,
    portfolioUSD, btcBalance, setBtcBalance, setPortfolioUSD,
    addTrade, trades,
  } = useGoatStore()

  const [loopStatus, setLoopStatus] = useState<'idle'|'running'|'paused'|'error'>('idle')
  const [isRunning,  setIsRunning]  = useState(false)
  const [nextRunIn,  setNextRunIn]  = useState(0)
  const [lastError,  setLastError]  = useState('')
  const [lastCycle,  setLastCycle]  = useState<{ executed: number; blocked: number; trades: GoatTrade[] } | null>(null)

  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastRunRef   = useRef<number>(0)

  const todayTrades = useCallback(() => {
    const start = new Date(); start.setHours(0,0,0,0)
    return trades.filter(t => t.timestamp >= start.getTime() && t.status !== 'blocked').length
  }, [trades])

  const drawdownPct = session
    ? session.peakValueUSD > 0
      ? Math.max(0, (session.peakValueUSD - session.currentUSD) / session.peakValueUSD * 100)
      : 0
    : 0

  const runCycle = useCallback(async () => {
    if (!privateKey || !isWalletLoaded || isRunning) return
    setIsRunning(true)
    setLastError('')
    lastRunRef.current = Date.now()

    try {
      // Get signals from the unified multi-market signals endpoint (Session 5)
      const symbolsForMarket = marketType === 'forex'
        ? ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD']
        : marketType === 'stocks'
        ? ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN']
        : marketType === 'meme'
        ? ['DOGE', 'SHIB', 'PEPE', 'BONK', 'WIF']
        : ['BTC', 'ETH', 'BNB', 'SOL', 'AVAX']   // crypto default
      const sigRes = await fetch('/api/agent/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketType, symbols: symbolsForMarket, interval: '1h' }),
      }).catch(() => null)
      const signals = sigRes?.ok ? (await sigRes.json()).signals ?? [] : []

      // Mainnet trades execute through KeeperHub server-side — the server
      // only needs the wallet address, never the private key. The key is
      // only sent for the testnet3 local dry-run fallback.
      const res = await fetch('/api/goat/loop', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(network === 'mainnet' ? { agentAddress } : { privateKey }),
          network, riskProfile, marketType, selectedAsset,
          todayTrades:  todayTrades(),
          portfolioUSD: session?.currentUSD ?? 0,
          drawdownPct,
          dryRun,       // from useGoatStore — set by the LiveAgentTab toggle
          signals,
          rules: alwaysBuyEnabled
            ? [{ symbol: alwaysBuySymbol, action: 'buy' as const, sizePct: alwaysBuyPct }]
            : [],
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Cycle failed')

      setBtcBalance(data.btcBalance ?? btcBalance)
      const newUSD = data.portfolioUSD ?? portfolioUSD

      setPortfolioUSD(newUSD)
      updateSession({
        currentUSD:    newUSD,
        peakValueUSD:  Math.max(session?.peakValueUSD ?? 0, newUSD),
        // Session used to start at initSession(0), so startValueUSD was
        // permanently 0 and PnL read as +100% from a fake baseline. Seed it
        // from the first real value the server ever returns.
        startValueUSD: session?.startValueUSD || newUSD,
        drawdownPct:   data.drawdownPct ?? drawdownPct,
        totalTrades:   (session?.totalTrades ?? 0) + (data.executed ?? 0),
        todayTrades:   todayTrades() + (data.executed ?? 0),
        lastRunAt:     Date.now(),
        status:        'running',
      })

      for (const t of data.trades ?? []) addTrade(t)
      setLastCycle({ executed: data.executed, blocked: data.blocked, trades: data.trades ?? [] })
      setLoopStatus('running')
      setNextRunIn(LOOP_MS / 1000)

    } catch (err: any) {
      setLastError(err.message)
      setLoopStatus('error')
    }

    setIsRunning(false)
  }, [privateKey, isWalletLoaded, network, riskProfile, marketType, selectedAsset, dryRun,
      alwaysBuyEnabled, alwaysBuySymbol, alwaysBuyPct,
      session, portfolioUSD, btcBalance, drawdownPct, isRunning,
      todayTrades, setBtcBalance, setPortfolioUSD, updateSession, addTrade])

  const startLoop = useCallback(async () => {
    if (!privateKey || !isWalletLoaded) return
    if (!session) initSession(portfolioUSD)
    setLoopStatus('running')
    markAgentRunning()
    await runCycle()
    if (timerRef.current)     clearInterval(timerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    timerRef.current     = setInterval(runCycle, LOOP_MS)
    countdownRef.current = setInterval(() => {
      const elapsed = (Date.now() - lastRunRef.current) / 1000
      setNextRunIn(Math.max(0, Math.floor(LOOP_MS / 1000 - elapsed)))
    }, 1000)
  }, [privateKey, isWalletLoaded, session, portfolioUSD, initSession, runCycle])

  const stopLoop = useCallback(() => {
    if (timerRef.current)     { clearInterval(timerRef.current);    timerRef.current = null }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
    setLoopStatus('idle')
    setNextRunIn(0)
    updateSession({ status: 'idle' })
    markAgentStopped()
  }, [updateSession])

  useEffect(() => () => {
    if (timerRef.current)     clearInterval(timerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
  }, [])

  return {
    loopStatus, isRunning, nextRunIn, lastError, lastCycle,
    isActive:    timerRef.current !== null,
    todayTrades: todayTrades(),
    drawdownPct,
    startLoop, stopLoop, runCycle,
  }
}
