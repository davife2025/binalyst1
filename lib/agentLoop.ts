/**
 * lib/agentLoop.ts — v2 (autonomous trading platform)
 */

import type { SignalSnapshot } from './signalEngine'
import type { StrategyRule }   from './signalEngine'
import { evaluateRules }       from './signalEngine'

export const LOOP_INTERVAL_MS   = 120_000
export const DRAWDOWN_WARN_PCT  = 80   // % of user's max drawdown limit
export const DRAWDOWN_PAUSE_PCT = 93   // % of user's max drawdown limit

export type LoopStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'error'

export interface LoopDecision {
  ruleId:       string
  ruleName:     string
  symbol:       string
  action:       'BUY' | 'SELL'
  amountUSDT:   number
  signalScore:  number
  reasoning:    string
  guardrail:    'passed' | 'blocked' | 'warning'
  blockReason?: string
  warning?:     string
  executed?:    boolean
  txHash?:      string
  timestamp?:   number
}

export interface LoopCycleResult {
  cycleAt:      number
  decisions:    LoopDecision[]
  executed:     number
  blocked:      number
  errors:       string[]
  portfolioUSD: number
  drawdownPct:  number
  todayTrades:  number
  status:       LoopStatus
}

export interface AgentLoopConfig {
  maxDrawdownPct: number
  maxPerTradePct: number
  maxDailyTrades: number
  slippagePct:    number
  dryRun:         boolean
  autonomousMode: boolean
  riskProfile?:   RiskProfile     // Session 3 — overrides individual guardrail fields
}

export interface AgentLoopCallbacks {
  getSignals:      () => Promise<SignalSnapshot[]>
  getRules:        () => StrategyRule[]
  getPortfolioUSD: () => Promise<number>
  getPeakUSD:      () => number
  getStartUSD:     () => number
  getTodayTrades:  () => number
  getTotalTrades:  () => number
  getDaysElapsed:  () => number
  getConfig:       () => AgentLoopConfig
  onDecision:      (d: LoopDecision) => void
  onCycleComplete: (r: LoopCycleResult) => void
  onStatusChange:  (s: LoopStatus) => void
  executeTradeViaAPI: (params: {
    symbol:         string
    action:         'BUY' | 'SELL'
    amountUSDT:     number
    dryRun:         boolean
    portfolioUSD:   number
    drawdownPct:    number
    tradesToday:    number
    totalTrades:    number
    daysElapsed:    number
    maxPerTradePct: number
    slippagePct:    number
  }) => Promise<{ success: boolean; txHash?: string; message?: string; reason?: string }>
}

export class AgentLoop {
  private timer:           ReturnType<typeof setInterval> | null = null
  // _state wrapper defeats TS control-flow narrowing.
  // A bare `private _status: LoopStatus` field lets TS narrow the union down
  // to only the literals it sees assigned through the private setStatus() method
  // ('idle'|'running'|'error'), stripping out 'paused' and 'disqualified'.
  // That narrowed type then causes TS2367 on `this._status !== 'paused'`.
  // Storing the value in an object property breaks the narrowing chain because
  // TS does not track mutations to object members the same way it tracks
  // direct variable/field assignments.
  private _state:          { value: LoopStatus } = { value: 'idle' }
  private callbacks:       AgentLoopCallbacks
  private peakUSD:         number = 0
  private lastFiredRuleAt: Record<string, number> = {}
  private _isCycleRunning: boolean = false

  // Getter/setter so all internal code still reads/writes this._status as before
  private get _status():      LoopStatus { return this._state.value }
  private set _status(s: LoopStatus)     { this._state.value = s   }

  constructor(callbacks: AgentLoopCallbacks) {
    this.callbacks = callbacks
  }

  get currentStatus(): LoopStatus { return this._status }

  start() {
    if (this.timer) return
    this.setStatus('running')
    this._runCycle()
    this.timer = setInterval(() => this._runCycle(), LOOP_INTERVAL_MS)
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    this.setStatus('idle')
  }

  pause()  { this.setStatus('paused')  }
  resume() { this.setStatus('running') }

  private async _runCycle() {
    if (this._status === 'paused')       return
    if (this._isCycleRunning)            return
    this._isCycleRunning = true

    const cb     = this.callbacks
    const config = cb.getConfig()
    const errors: string[] = []

    // 1. Portfolio + drawdown
    let portfolioUSD = 0
    try {
      portfolioUSD = await cb.getPortfolioUSD()
      if (portfolioUSD > this.peakUSD) this.peakUSD = portfolioUSD
    } catch (e: any) {
      errors.push('Portfolio fetch failed: ' + e.message)
    }

    const startUSD    = cb.getStartUSD()
    // Bug 4 fix: never compute drawdown when portfolioUSD is 0 — a failed
    // getPortfolioUSD() returns 0, which would make drawdownPct = 100% and
    // instantly disqualify the agent on the very first cycle.
    const peakUSD     = Math.max(this.peakUSD, startUSD, portfolioUSD)
    const drawdownPct = (portfolioUSD <= 0 || peakUSD <= 0)
      ? 0
      : Math.max(0, ((peakUSD - portfolioUSD) / peakUSD) * 100)

    const todayTrades = cb.getTodayTrades()
    const totalTrades = cb.getTotalTrades()
    const daysElapsed = cb.getDaysElapsed()

    // 2. Disqualify check
    if (drawdownPct >= config.maxDrawdownPct) {
      this.setStatus('paused')
      cb.onCycleComplete({
        cycleAt: Date.now(), decisions: [], executed: 0, blocked: 0,
        errors: [`AUTO-PAUSED: drawdown ${drawdownPct.toFixed(1)}% >= limit ${config.maxDrawdownPct}%`],
        portfolioUSD, drawdownPct, todayTrades, status: 'paused',
      })
      this._isCycleRunning = false
      return
    }

    // 3. Auto-pause check — _state.value read directly here so TS cannot narrow
    if (drawdownPct >= config.maxDrawdownPct * 0.93 && this._state.value !== 'paused') {
      this.setStatus('paused')
      errors.push(`WARN: drawdown ${drawdownPct.toFixed(1)}% approaching ${config.maxDrawdownPct}% limit`)
      cb.onCycleComplete({
        cycleAt: Date.now(), decisions: [], executed: 0, blocked: 0,
        errors, portfolioUSD, drawdownPct, todayTrades, status: 'paused',
      })
      this._isCycleRunning = false
      return
    }

    // 4. Signals
    let signals: SignalSnapshot[] = []
    try {
      signals = await cb.getSignals()
    } catch (e: any) {
      errors.push('Signal fetch failed: ' + e.message)
    }

    if (!signals.length) {
      cb.onCycleComplete({
        cycleAt: Date.now(), decisions: [], executed: 0, blocked: 0,
        errors: [...errors, 'No signals available'],
        portfolioUSD, drawdownPct, todayTrades, status: this._status,
      })
      this._isCycleRunning = false
      return
    }

    // 5. Evaluate rules
    const rules = cb.getRules()
    const now   = Date.now()
    const fired = evaluateRules(rules, signals, now)

    // 6. Forced DCA if 0 trades today past hour 22
    const currentHour = new Date().getHours()
    if (false && todayTrades === 0 && signals.length > 0) { // forced-trade removed
      const best = [...signals].sort((a, b) => b.signalScore - a.signalScore)[0]
      fired.unshift({
        rule: {
          id: 'forced-dca', symbol: best.symbol,
          condition: { type: 'signal_above' as const, value: 0 },
          action: 'BUY' as const, sizePct: 5, priority: 0, cooldownMs: 86400000,
        },
        signal: best,
      })
    }

    // 7. Execute decisions
    const decisions: LoopDecision[] = []
    let executed = 0, blocked = 0

    for (const { rule, signal } of fired) {
      const lastFired = this.lastFiredRuleAt[rule.id]
      if (lastFired && now - lastFired < rule.cooldownMs) continue
      if (todayTrades + executed >= config.maxDailyTrades) break

      const amountUSDT = (portfolioUSD * rule.sizePct) / 100

      const guardrail = checkRiskGuardrails({
        profile:      config.riskProfile ?? {
          preset: 'moderate', maxDrawdownPct: config.maxDrawdownPct ?? 15,
          maxPositionPct: config.maxPerTradePct ?? 5, maxDailyTrades: config.maxDailyTrades ?? 8,
          stopLossType: 'trailing', stopLossPct: 7, slippagePct: config.slippagePct ?? 0.5,
        },
        drawdownPct,
        todayTrades:  todayTrades + executed,
        portfolioUSD,
        amountUSD:    amountUSDT,
      })

      const decision: LoopDecision = {
        ruleId:      rule.id,
        ruleName:    `${rule.symbol} ${rule.action}`,
        symbol:      rule.symbol,
        action:      rule.action as 'BUY' | 'SELL',
        amountUSDT,
        signalScore: signal.signalScore,
        reasoning:   signal.reasoning,
        guardrail:   guardrail.allowed ? (guardrail.warning ? 'warning' : 'passed') : 'blocked',
        blockReason: guardrail.reason,
        warning:     guardrail.warning,
        timestamp:   now,
        executed:    false,
      }

      cb.onDecision(decision)
      decisions.push(decision)

      if (!guardrail.allowed) { blocked++; continue }
      if (!config.autonomousMode) continue

      try {
        const result = await cb.executeTradeViaAPI({
          symbol:         rule.symbol,
          action:         rule.action as 'BUY' | 'SELL',
          amountUSDT,
          dryRun:         config.dryRun,
          portfolioUSD,
          drawdownPct,
          tradesToday:    todayTrades + executed,
          totalTrades:    totalTrades + executed,
          daysElapsed,
          maxPerTradePct: config.maxPerTradePct,
          slippagePct:    config.slippagePct,
        })

        if (result.success) {
          executed++
          decision.executed = true
          decision.txHash   = result.txHash
          this.lastFiredRuleAt[rule.id] = now
        }
      } catch (err: any) {
        decision.blockReason = `Execution error: ${err.message}`
        errors.push(err.message)
      }
    } // end for

    this._isCycleRunning = false
  }

  private setStatus(s: LoopStatus) {
    this._state.value = s
    this.callbacks.onStatusChange(s)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function computeDrawdown(startUSD: number, peakUSD: number, currentUSD: number): number {
  const peak = Math.max(peakUSD, startUSD)
  if (peak <= 0) return 0
  return Math.max(0, ((peak - currentUSD) / peak) * 100)
}

export function computePnLPct(startUSD: number, currentUSD: number): number {
  if (startUSD <= 0) return 0
  return ((currentUSD - startUSD) / startUSD) * 100
}

export function formatDrawdownColor(pct: number): string {
  if (pct >= 25) return 'var(--red)'
  if (pct >= DRAWDOWN_WARN_PCT)  return 'var(--yellow)'
  return 'var(--green)'
}

// NOTE: this is a legacy competition-era concept ("On track" / "At risk" of
// disqualification for not trading often enough) inherited from the old
// hackathon competition rules — it doesn't really fit a platform where users
// should be free to trade (or not) as they choose. The MIN_TRADES_* values
// below are restored inline (with the same defaults the old COMPETITION_RULES
// object used) just to unblock the build; consider removing/repurposing this
// entirely alongside the other competition-era cleanup (isRegistered,
// lib/exportUtils.ts's "Competition Compliance" report, etc).
export function tradeCountStatus(
  today: number, total: number, daysElapsed: number
): { label: string; color: string; ok: boolean } {
  // Legacy competition-era thresholds — see note above tradeCountStatus.
  const MIN_TRADES_PER_DAY  = 1
  const MIN_TRADES_TOTAL    = 5
  const minTotal = Math.min(daysElapsed + 1, MIN_TRADES_TOTAL)
  if (today >= MIN_TRADES_PER_DAY && total >= minTotal)
    return { label: 'On track', color: 'var(--green)', ok: true }
  if (total < minTotal * 0.5)
    return { label: 'At risk',  color: 'var(--red)',   ok: false }
  return   { label: 'Watch',    color: 'var(--yellow)', ok: false }
}

// ── API route guard (used by /api/agent/loop) ────────────────────────────────
// Prevents disqualification when portfolioUSD is 0 due to a failed fetch.
// A 0 portfolio against any non-zero peak = 100% drawdown = instant disqualify.
// Rule: never compute drawdown if portfolioUSD is 0 — treat it as a fetch error.
export function safeDrawdownPct(
  peakUSD: number,
  portfolioUSD: number,
  startUSD: number,
): number {
  // If portfolio came back as 0, we have no valid reading — return 0 to be safe
  if (portfolioUSD <= 0) return 0
  const peak = Math.max(peakUSD, startUSD, portfolioUSD)
  if (peak <= 0) return 0
  return Math.max(0, ((peak - portfolioUSD) / peak) * 100)
}
// ─────────────────────────────────────────────────────────────────────────────
// RiskProfile — replaces hardcoded COMPETITION_RULES everywhere
// ─────────────────────────────────────────────────────────────────────────────

export type RiskPreset = 'conservative' | 'moderate' | 'aggressive'

export interface RiskProfile {
  preset:          RiskPreset
  maxDrawdownPct:  number   // e.g. 5 | 15 | 25
  maxPositionPct:  number   // e.g. 2 | 5 | 10  — % of portfolio per trade
  maxDailyTrades:  number   // e.g. 3 | 8 | 20
  stopLossType:    'hard' | 'trailing'
  stopLossPct:     number   // e.g. 3 | 7 | 15
  slippagePct:     number   // e.g. 0.3 | 0.5 | 1.0
}

export const RISK_PRESETS: Record<RiskPreset, RiskProfile> = {
  conservative: { preset: 'conservative', maxDrawdownPct: 5,  maxPositionPct: 2,  maxDailyTrades: 3,  stopLossType: 'hard',     stopLossPct: 3,  slippagePct: 0.3 },
  moderate:     { preset: 'moderate',     maxDrawdownPct: 15, maxPositionPct: 5,  maxDailyTrades: 8,  stopLossType: 'trailing', stopLossPct: 7,  slippagePct: 0.5 },
  aggressive:   { preset: 'aggressive',   maxDrawdownPct: 25, maxPositionPct: 10, maxDailyTrades: 20, stopLossType: 'trailing', stopLossPct: 15, slippagePct: 1.0 },
}

export interface RiskGuardrailResult {
  allowed:    boolean
  reason?:    string
  warning?:   string
}

export function checkRiskGuardrails(params: {
  profile:       RiskProfile
  drawdownPct:   number
  todayTrades:   number
  portfolioUSD:  number
  amountUSD:     number
}): RiskGuardrailResult {
  const { profile, drawdownPct, todayTrades, portfolioUSD, amountUSD } = params

  if (drawdownPct >= profile.maxDrawdownPct)
    return { allowed: false, reason: `Drawdown ${drawdownPct.toFixed(1)}% exceeds your ${profile.maxDrawdownPct}% limit` }

  if (todayTrades >= profile.maxDailyTrades)
    return { allowed: false, reason: `Daily trade limit ${profile.maxDailyTrades} reached` }

  const maxPositionUSD = portfolioUSD * (profile.maxPositionPct / 100)
  if (amountUSD > maxPositionUSD)
    return { allowed: false, reason: `Position $${amountUSD.toFixed(0)} exceeds ${profile.maxPositionPct}% ($${maxPositionUSD.toFixed(0)}) limit` }

  if (portfolioUSD < 1)
    return { allowed: false, reason: 'Portfolio balance too low' }

  const warnPct = profile.maxDrawdownPct * 0.8
  if (drawdownPct >= warnPct)
    return { allowed: true, warning: `Drawdown ${drawdownPct.toFixed(1)}% approaching ${profile.maxDrawdownPct}% limit` }

  return { allowed: true }
}