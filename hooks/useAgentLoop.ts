'use client'

/**
 * hooks/useAgentLoop.ts — Session I (Bug Fix Release)
 *
 * Fixes:
 * Bug 2 — agentConfigRef: config reads are always live, never a startup snapshot
 * Bug 3 — runCycleRef + isRunningRef: interval always calls latest cycle fn
 * Bug 4 (new) — immediate disqualification on start:
 *   initSession() is a Zustand setState call — it is async/batched.
 *   startLoop() called runCycle() immediately after initSession(), but session
 *   was still null in the closure, so startUSD/peakUSD sent to the API were 0.
 *   The API computed drawdownPct against a 0 peak which triggered instant
 *   disqualification.
 *   Fix: startLoop() passes startingUSDT explicitly to runCycle via a
 *   startUSDOverride ref. runCycle reads the override on the first call, then
 *   falls back to session values on every subsequent call.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAgentStore }    from '@/lib/agentStore'
import {
  computePnLPct,
  tradeCountStatus,
  LOOP_INTERVAL_MS,
  type LoopStatus,
  type LoopCycleResult,
} from '@/lib/agentLoop'

// NOTE: `submitTradeProof` was called throughout every delivered session of
// this file (Sessions 1, 3, 5) but its implementation was never included in
// any session zip or hotfix — no import, no backend endpoint, nothing.
// The call site already treats it as best-effort (`.catch(err =>
// console.warn('[ZK] ...'))`), so this stub preserves that exact behavior
// (silently resolves, doing nothing) rather than inventing a real proof/
// attestation backend. Replace this with a real implementation — e.g. a
// fetch() to an EAS/ZK attestation endpoint — once that service exists.
async function submitTradeProof(_proof: Record<string, any>): Promise<void> {
  // no-op placeholder — see note above
}

export function useAgentLoop() {
  const {
    privateKey, agentAddress, isWalletLoaded,
    agentConfig, strategyParsed,
    session, initSession, updateSession,
    trades, addTrade,
  } = useAgentStore()

  const network = (useAgentStore() as any).network ?? 'mainnet'

  const [loopStatus,  setLoopStatus]  = useState<LoopStatus>('idle')
  const [lastCycle,   setLastCycle]   = useState<LoopCycleResult | null>(null)
  const [nextRunIn,   setNextRunIn]   = useState<number>(0)
  const [isRunning,   setIsRunning]   = useState(false)
  const [cycleError,  setCycleError]  = useState<string>('')

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastRunRef    = useRef<number>(0)
  const isRunningRef  = useRef(false)
  const runCycleRef   = useRef<() => Promise<void>>()

  // Bug 2 fix: always-current config ref
  const agentConfigRef = useRef(agentConfig)
  useEffect(() => { agentConfigRef.current = agentConfig }, [agentConfig])

  // Bug 4 fix: startUSD override ref — set by startLoop() so the first cycle
  // uses the correct starting capital even before Zustand session is committed.
  const startUSDOverrideRef = useRef<number | null>(null)

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getDaysElapsed = useCallback((): number => {
    if (!session?.startedAt) return 0
    return Math.floor((Date.now() - session.startedAt) / 86400000)
  }, [session?.startedAt])

  const getTodayTrades = useCallback((): number => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return trades.filter(t => t.timestamp >= todayStart.getTime()).length
  }, [trades])

  // ── Core cycle ────────────────────────────────────────────────────────────
  const runCycle = useCallback(async () => {
    if (!privateKey || !isWalletLoaded)  return
    if (loopStatus === 'error')   return
    if (isRunningRef.current)            return

    isRunningRef.current = true
    setIsRunning(true)
    setCycleError('')
    lastRunRef.current = Date.now()

    const cfg = agentConfigRef.current

    // Bug 4 fix: use the override on first cycle, then clear it so subsequent
    // cycles read from the live session as normal.
    const startUSD = startUSDOverrideRef.current ?? session?.startValueUSDT ?? 0
    const rawPeak  = startUSDOverrideRef.current
      ? Math.max(startUSDOverrideRef.current, session?.peakValueUSDT ?? 0)
      : session?.peakValueUSDT ?? 0
    startUSDOverrideRef.current = null   // consume the override

    // Safety clamp: peakUSD must never be higher than startUSD when startUSD
    // is itself low (e.g. new session with startUSD=1 but stale peakUSD=100
    // from localStorage). That combination sends drawdownPct=99% to the route
    // which immediately disqualifies even before the STABLECOIN fix runs.
    // Rule: if rawPeak is more than 10x startUSD, reset it to startUSD.
    const peakUSD = (startUSD > 0 && rawPeak > startUSD * 10)
      ? startUSD
      : Math.max(rawPeak, startUSD)

    try {
      const symbols = cfg.allowedTokens?.length
        ? cfg.allowedTokens
        : ['ETH', 'ADA', 'AVAX', 'LINK', 'CAKE', 'DOGE', 'DOT', 'BNB']

      const res = await fetch('/api/agent/loop', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey,
          network,
          rules:       strategyParsed,
          symbols,
          startUSD,
          peakUSD,
          tradesToday: getTodayTrades(),
          totalTrades: session?.totalTrades ?? 0,
          daysElapsed: getDaysElapsed(),
          dryRun:      cfg.dryRun,
          config:      cfg,
          riskProfile: session?.riskProfile ?? null,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Cycle failed')

    

      const portfolioUSD = data.portfolioUSD ?? 0
      const drawdownPct  = data.drawdownPct  ?? 0
      const newStatus    = data.status as LoopStatus

      updateSession({
        currentValueUSDT: portfolioUSD,
        peakValueUSDT:    Math.max(session?.peakValueUSDT ?? 0, portfolioUSD),
        drawdownPct,
        totalTrades:      (session?.totalTrades ?? 0) + (data.executed ?? 0),
        todayTrades:      getTodayTrades() + (data.executed ?? 0),
        lastRunAt:        Date.now(),
        status:           newStatus,
      })

      for (const decision of data.decisions ?? []) {
        if (decision.guardrail === 'blocked') continue

        addTrade({
          id:          crypto.randomUUID(),
          timestamp:   decision.timestamp ?? Date.now(),
          symbol:      decision.symbol,
          side:        decision.action,
          amountUSDT:  decision.amountUSDT,
          price:       data.snapshots?.find((s: any) => s.symbol === decision.symbol)?.price ?? 0,
          txHash:      decision.txHash ?? '',
          dryRun:      cfg.dryRun,
          status:      decision.txHash ? 'confirmed' : cfg.dryRun ? 'confirmed' : 'pending',
          signalScore: decision.signalScore ?? 50,
          reasoning:   decision.reasoning  ?? '',
        })

        if (decision.executed) {
          const snap = data.snapshots?.find((s: any) => s.symbol === decision.symbol)
          const t    = snap?.technicals ?? null
          const proofSignal = {
            symbol:       decision.symbol,
            price:        snap?.price        ?? 0,
            change_24h:   snap?.change24h    ?? 0,
            fear_greed:   snap?.fearGreed    ?? data.fearGreed ?? 50,
            signal_score: decision.signalScore ?? 50,
            rsi14:      t?.rsi14      ?? null,
            macd_hist:  t?.macdHist   ?? null,
            macd_cross: t?.macdCross  ?? null,
            bb_pct:     t?.bbPct      ?? null,
            bb_width:   t?.bbWidth    ?? null,
            adx:        t?.adx        ?? null,
            stoch_k:    t?.stochK     ?? null,
            obv_trend:  t?.obvTrend   ?? null,
            ema_cross:  t?.emaCross   ?? null,
            tech_score: t?.techScore  ?? null,
            regime:     t?.regime     ?? null,
            tags:       snap?.tags    ?? [],
          }

          const firedRule = strategyParsed.find(r => r.id === decision.ruleId)

          if (firedRule) {
            submitTradeProof({
              signal:       proofSignal as any,
              rule:         firedRule,
              decision: {
                symbol:       decision.symbol,
                action:       decision.action,
                amountUSDT:   decision.amountUSDT,
                signalScore:  decision.signalScore ?? 50,
                reasoning:    decision.reasoning ?? '',
                ruleName:     decision.ruleName ?? firedRule.id,
                ruleId:       decision.ruleId,
                guardrail:    decision.guardrail,
              },
              portfolioUSD,
              peakUSD: Math.max(session?.peakValueUSDT ?? 0, portfolioUSD),
              startUSD,
              tradesToday:  getTodayTrades(),
              totalTrades:  (session?.totalTrades ?? 0) + (data.executed ?? 0),
              config: {
                maxDrawdownPct:  cfg.maxDrawdownPct  ?? 30,
                maxPerTradePct:  cfg.maxPerTradePct  ?? 15,
                maxDailyTrades:  cfg.maxDailyTrades  ?? 8,
                dryRun:          cfg.dryRun          ?? true,
              },
            }).catch(err =>
              console.warn('[ZK] submitTradeProof failed (non-fatal):', err.message)
            )
          }
        }
      }

      const cycleResult: LoopCycleResult = {
        cycleAt:      Date.now(),
        decisions:    data.decisions ?? [],
        executed:     data.executed  ?? 0,
        blocked:      data.blocked   ?? 0,
        errors:       data.errors    ?? [],
        portfolioUSD,
        drawdownPct,
        todayTrades:  getTodayTrades(),
        status:       newStatus,
      }

      setLastCycle(cycleResult)
      setLoopStatus(newStatus)
      setNextRunIn(LOOP_INTERVAL_MS / 1000)

    } catch (e: any) {
      setCycleError(e.message)
      setLoopStatus('error')
    }

    startUSDOverrideRef.current = null

    isRunningRef.current = false
    setIsRunning(false)
  }, [
    privateKey, isWalletLoaded, network,
    strategyParsed, session, loopStatus,
    getDaysElapsed, getTodayTrades,
    updateSession, addTrade,
  ])

  useEffect(() => { runCycleRef.current = runCycle }, [runCycle])

  // ── Start / Stop ──────────────────────────────────────────────────────────
  const startLoop = useCallback(async (startingUSDT?: number) => {
    if (!privateKey || !isWalletLoaded) return

    const capital = startingUSDT ?? 100

    // Bug 4 fix: set the override BEFORE initSession and BEFORE runCycle fires.
    // initSession() is a Zustand setState — it is batched/async and the session
    // closure inside runCycle will still be null on the first call.
    // The override ref is synchronous so runCycle reads it correctly.
    startUSDOverrideRef.current = capital

    if (!session) initSession(capital)

    setLoopStatus('running')

    // Run first cycle immediately — reads startUSDOverrideRef.current
    await runCycleRef.current?.()

    if (timerRef.current)     clearInterval(timerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)

    timerRef.current = setInterval(() => {
      runCycleRef.current?.()
    }, LOOP_INTERVAL_MS)

    countdownRef.current = setInterval(() => {
      const elapsed = (Date.now() - lastRunRef.current) / 1000
      setNextRunIn(Math.max(0, Math.floor(LOOP_INTERVAL_MS / 1000 - elapsed)))
    }, 1000)
  }, [privateKey, isWalletLoaded, session, initSession])

  const stopLoop = useCallback(() => {
    if (timerRef.current)     { clearInterval(timerRef.current);    timerRef.current = null }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
    // Reset the override so a restart works cleanly
    startUSDOverrideRef.current = null
    setLoopStatus('idle')
    setNextRunIn(0)
  }, [])

  const pauseLoop  = useCallback(() => setLoopStatus('paused'),  [])
  const resumeLoop = useCallback(() => setLoopStatus('running'), [])

  const triggerManualCycle = useCallback(() => {
    runCycleRef.current?.()
  }, [])

  useEffect(() => () => {
    if (timerRef.current)     clearInterval(timerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
  }, [])

  const pnlPct      = session ? computePnLPct(session.startValueUSDT, session.currentValueUSDT) : 0
  const tradeStatus = tradeCountStatus(getTodayTrades(), session?.totalTrades ?? 0, getDaysElapsed())
  const isActive    = timerRef.current !== null

  return {
    loopStatus, lastCycle, nextRunIn, isRunning, cycleError, isActive,
    pnlPct, tradeStatus,
    todayTrades:  getTodayTrades(),
    totalTrades:  session?.totalTrades    ?? 0,
    drawdownPct:  session?.drawdownPct    ?? 0,
    portfolioUSD: session?.currentValueUSDT ?? 0,
    startUSD:     session?.startValueUSDT   ?? 0,
    peakUSD:      session?.peakValueUSDT    ?? 0,
    daysElapsed:  getDaysElapsed(),
    isRegistered: session?.isRegistered ?? false,
    network,
    startLoop, stopLoop, pauseLoop, resumeLoop,
    runCycle: triggerManualCycle,
  }
}