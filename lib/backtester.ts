/**
 * lib/backtester.ts
 * Session L — Backtester
 *
 * Replays a strategy against historical OHLCV candles and computes:
 *   PnL, Sharpe ratio, max drawdown, win rate, trade log
 *
 * Architecture:
 *   1. Fetch historical candles via Binance public API (no auth)
 *   2. Walk candles chronologically, building a rolling SignalSnapshot at each bar
 *   3. Evaluate StrategyRule[] against each snapshot using evaluateCondition()
 *   4. Simulate fill at next-bar open (realistic — no lookahead)
 *   5. Compute portfolio equity curve, then derive all metrics
 *
 * Supports both Session C rules (sentiment-based) and Session J rules
 * (technical conditions).  Technical indicators are recomputed on each bar
 * using a rolling window — same maths as bitget-technicals.ts but inline
 * to avoid import complexity in the API route.
 */

import axios from 'axios'
import {
  evaluateCondition,
  type StrategyRule,
  type SignalSnapshot,
  type StrategyCondition,
} from './signalEngine'
import type { TechnicalSnapshot } from './skills/bitget-technicals'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestParams {
  rules:           StrategyRule[]
  symbol:          string           // e.g. 'BTC', 'ETH'
  interval:        string           // '1h' | '4h' | '1d'
  startTime:       number           // unix ms
  endTime:         number           // unix ms
  initialCapital:  number           // USD
  /** Fixed fear & greed value to use (real F&G not available historically) */
  mockFearGreed?:  number           // default 50
  /** Session 4: data source. 'crypto' uses Binance (default), others use Twelve Data */
  marketType?:     'crypto' | 'forex' | 'stocks' | 'meme'
}

export interface BacktestTrade {
  openTime:    number
  closeTime:   number
  side:        'BUY' | 'SELL'
  entryPrice:  number
  exitPrice:   number
  sizePct:     number
  pnlUsd:      number
  pnlPct:      number
  holdBars:    number
  rule:        string   // rule id that triggered entry
}

export interface BacktestResult {
  symbol:          string
  interval:        string
  startTime:       number
  endTime:         number
  initialCapital:  number
  finalCapital:    number
  totalReturn:     number     // %
  sharpeRatio:     number
  maxDrawdown:     number     // % (positive number)
  maxDrawdownUsd:  number
  winRate:         number     // %
  totalTrades:     number
  winningTrades:   number
  losingTrades:    number
  avgWin:          number     // %
  avgLoss:         number     // %
  profitFactor:    number     // gross profit / gross loss
  avgHoldBars:     number
  equityCurve:     { time: number; equity: number }[]
  trades:          BacktestTrade[]
  barCount:        number
  rulesEvaluated:  number
}

interface Candle {
  openTime:  number
  open:      number
  high:      number
  low:       number
  close:     number
  volume:    number
}

// ─────────────────────────────────────────────────────────────────────────────
// Candle fetch
// ─────────────────────────────────────────────────────────────────────────────

const BINANCE_BASE = 'https://api.binance.com'

async function fetchHistoricalCandles(
  symbol:     string,
  interval:   string,
  startTime:  number,
  endTime:    number,
  marketType: 'crypto' | 'forex' | 'stocks' | 'meme' = 'crypto',
): Promise<Candle[]> {
  // Route non-crypto to Twelve Data (Session 4)
  if (marketType !== 'crypto') {
    const { fetchOHLCV } = await import('./skills/twelvedata')
    const tdType = marketType === 'meme' ? 'crypto' : marketType
    return fetchOHLCV(symbol, interval, tdType as any, startTime, endTime)
  }
  const sym    = symbol.endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`
  const all:   Candle[] = []
  let   cursor = startTime

  while (cursor < endTime) {
    const { data } = await axios.get(`${BINANCE_BASE}/api/v3/klines`, {
      params: {
        symbol:    sym,
        interval,
        startTime: cursor,
        endTime,
        limit:     1000,
      },
      timeout: 15_000,
    })
    if (!data || data.length === 0) break
    for (const k of data as any[]) {
      all.push({
        openTime: Number(k[0]),
        open:     parseFloat(k[1]),
        high:     parseFloat(k[2]),
        low:      parseFloat(k[3]),
        close:    parseFloat(k[4]),
        volume:   parseFloat(k[5]),
      })
    }
    cursor = Number(data[data.length - 1][0]) + 1
    if (data.length < 1000) break
  }

  return all
}

// ─────────────────────────────────────────────────────────────────────────────
// Rolling technical indicators (self-contained — mirrors bitget-technicals.ts)
// ─────────────────────────────────────────────────────────────────────────────

function closes(cs: Candle[]) { return cs.map(c => c.close) }

function sma(vals: number[], p: number) {
  const s = vals.slice(-p)
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : vals[vals.length - 1] ?? 0
}

function ema(vals: number[], p: number): number[] {
  if (!vals.length) return []
  const k = 2 / (p + 1)
  const r: number[] = [vals.slice(0, p).reduce((a, b) => a + b, 0) / Math.min(p, vals.length)]
  for (let i = 1; i < vals.length; i++) r.push(vals[i] * k + r[i - 1] * (1 - k))
  return r
}

function last<T>(arr: T[]): T { return arr[arr.length - 1] }

function computeRsi(cs: Candle[], p = 14): number {
  const cl = closes(cs)
  if (cl.length < p + 1) return 50
  let g = 0, l = 0
  for (let i = cl.length - p; i < cl.length; i++) {
    const d = cl[i] - cl[i - 1]
    if (d >= 0) g += d; else l -= d
  }
  const ag = g / p, al = l / p
  if (al === 0) return 100
  return 100 - 100 / (1 + ag / al)
}

function computeMacdHist(cs: Candle[]): { hist: number; cross: 'BULLISH' | 'BEARISH' | 'NONE' } {
  const cl      = closes(cs)
  const e12     = ema(cl, 12)
  const e26     = ema(cl, 26)
  const macdArr = e12.map((v, i) => v - e26[i])
  const sigArr  = ema(macdArr, 9)
  const histArr = macdArr.map((v, i) => v - sigArr[i])
  const hist    = last(histArr)
  const prev    = histArr[histArr.length - 2] ?? 0
  let   cross: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE'
  if (prev < 0 && hist > 0) cross = 'BULLISH'
  if (prev > 0 && hist < 0) cross = 'BEARISH'
  return { hist, cross }
}

function computeBbPct(cs: Candle[], p = 20): number {
  const cl  = closes(cs)
  const mid = sma(cl, p)
  const sl  = cl.slice(-p)
  const sd  = Math.sqrt(sl.reduce((a, v) => a + (v - mid) ** 2, 0) / p)
  const up  = mid + 2 * sd
  const lo  = mid - 2 * sd
  const px  = last(cl)
  return up === lo ? 0.5 : (px - lo) / (up - lo)
}

function computeBbWidth(cs: Candle[], p = 20): number {
  const cl  = closes(cs)
  const mid = sma(cl, p)
  const sl  = cl.slice(-p)
  const sd  = Math.sqrt(sl.reduce((a, v) => a + (v - mid) ** 2, 0) / p)
  return mid > 0 ? (4 * sd) / mid : 0
}

function computeAdx(cs: Candle[], p = 14): number {
  if (cs.length < p * 2) return 20
  const trs: number[] = [], pls: number[] = [], mns: number[] = []
  for (let i = 1; i < cs.length; i++) {
    const c = cs[i], prev = cs[i - 1]
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)))
    const pl = c.high - prev.high, mn = prev.low - c.low
    pls.push(pl > mn && pl > 0 ? pl : 0)
    mns.push(mn > pl && mn > 0 ? mn : 0)
  }
  const atrV  = sma(trs, p)
  const diP   = atrV > 0 ? (sma(pls, p) / atrV) * 100 : 0
  const diM   = atrV > 0 ? (sma(mns, p) / atrV) * 100 : 0
  const denom = diP + diM
  if (!denom) return 0
  return Math.abs(diP - diM) / denom * 100
}

function computeEma20(cs: Candle[]): number {
  return last(ema(closes(cs), 20))
}

function computeEma50(cs: Candle[]): number {
  return last(ema(closes(cs), 50))
}

function computeAtrPct(cs: Candle[], p = 14): number {
  if (cs.length < 2) return 1
  const trs: number[] = []
  for (let i = 1; i < cs.length; i++) {
    const c = cs[i], pr = cs[i - 1]
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - pr.close), Math.abs(c.low - pr.close)))
  }
  const a = sma(trs, p)
  const px = last(closes(cs))
  return px > 0 ? (a / px) * 100 : 1
}

function computeObvTrend(cs: Candle[]): 'UP' | 'DOWN' | 'FLAT' {
  if (cs.length < 20) return 'FLAT'
  const sl  = cs.slice(-20)
  let   cur = 0
  const vals: number[] = [0]
  for (let i = 1; i < sl.length; i++) {
    const d = sl[i].close - sl[i - 1].close
    cur += d > 0 ? sl[i].volume : d < 0 ? -sl[i].volume : 0
    vals.push(cur)
  }
  const delta = last(vals) - vals[0]
  if (Math.abs(delta) < Math.abs(vals[0]) * 0.02) return 'FLAT'
  return delta > 0 ? 'UP' : 'DOWN'
}

function computeStochK(cs: Candle[], p = 14): number {
  const sl   = cs.slice(-p)
  const hi   = Math.max(...sl.map(c => c.high))
  const lo   = Math.min(...sl.map(c => c.low))
  const px   = last(closes(cs))
  return hi === lo ? 50 : ((px - lo) / (hi - lo)) * 100
}

function detectRegime(adxV: number, ema20: number, ema50: number, price: number, atrPct: number) {
  if (atrPct < 0.5) return 'FLAT'
  if (adxV >= 25) {
    if (price > ema20 && ema20 > ema50) return 'TRENDING_UP'
    if (price < ema20 && ema20 < ema50) return 'TRENDING_DOWN'
  }
  return 'RANGING'
}

function buildTechnicalsFromWindow(window: Candle[]): TechnicalSnapshot['momentum'] &
  { bbPct: number; bbWidth: number; emaCross: 'BULLISH'|'BEARISH'|'MIXED'; adx: number;
    regime: string; atrPct: number; obvTrend: string; stochK: number; techScore: number;
    techSignals: string[]; regimeConf: number } {
  const price   = last(closes(window))
  const rsi14   = computeRsi(window)
  const { hist: macdHist, cross: macdCross } = computeMacdHist(window)
  const bbPct   = computeBbPct(window)
  const bbWidth = computeBbWidth(window)
  const adx     = computeAdx(window)
  const ema20   = computeEma20(window)
  const ema50   = computeEma50(window)
  const atrPct  = computeAtrPct(window)
  const regime  = detectRegime(adx, ema20, ema50, price, atrPct)
  const obvTrend = computeObvTrend(window)
  const stochK  = computeStochK(window)

  let emaCross: 'BULLISH'|'BEARISH'|'MIXED' = 'MIXED'
  if (price > ema20 && ema20 > ema50) emaCross = 'BULLISH'
  if (price < ema20 && ema20 < ema50) emaCross = 'BEARISH'

  // Simple tech score
  let buy = 0, tot = 0
  const score = (c: boolean) => { if (c) buy++; tot++ }
  score(emaCross === 'BULLISH')
  score(rsi14 > 50 && rsi14 < 70)
  score(macdHist > 0)
  score(bbPct > 0.5 && bbPct < 0.9)
  score(obvTrend === 'UP')
  const techScore = tot > 0 ? Math.round((buy / tot) * 100) : 50

  return {
    rsi14, macdLine: 0, macdSignal: 0, macdHist, macdCross,
    stochK, stochD: stochK, roc10: 0,
    bbPct, bbWidth, emaCross, adx, regime, atrPct,
    obvTrend: obvTrend as any, techScore, techSignals: [], regimeConf: 70,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build a minimal SignalSnapshot from candle window + tech
// ─────────────────────────────────────────────────────────────────────────────

function buildSnapshot(
  candles:     Candle[],
  symbol:      string,
  fearGreed:   number,
  tech:        ReturnType<typeof buildTechnicalsFromWindow>,
): SignalSnapshot {
  const c        = last(candles)
  const prev     = candles[candles.length - 2] ?? c
  const change1h = prev.close > 0 ? ((c.close - prev.close) / prev.close) * 100 : 0
  // approximate 24h from 24 bars back (works for 1h candles; good enough for 4h/1d too)
  const c24      = candles.length >= 25 ? candles[candles.length - 25] : candles[0]
  const change24h = c24.close > 0 ? ((c.close - c24.close) / c24.close) * 100 : 0
  const c7d      = candles.length >= 169 ? candles[candles.length - 169] : candles[0]
  const change7d  = c7d.close > 0 ? ((c.close - c7d.close) / c7d.close) * 100 : 0

  const techBoost  = Math.round((tech.techScore - 50) * 0.4)
  const fgBias     = fearGreed <= 20 ? 25 : fearGreed <= 44 ? 5 : fearGreed >= 75 ? -15 : 0
  const signalScore = Math.max(0, Math.min(100, 50 + change24h * 2 + fgBias + techBoost))
  const signalDir   = signalScore >= 65 ? 'BUY' : signalScore <= 35 ? 'SELL' : 'HOLD'

  return {
    symbol,
    price:       c.close,
    change1h,
    change24h,
    change7d,
    volume24h:   c.volume,
    marketCap:   0,
    fearGreed,
    fgLabel:     fearGreed <= 25 ? 'Extreme Fear' : fearGreed >= 75 ? 'Extreme Greed' : 'Neutral',
    momentum:    change24h * 3,
    volumeSpike: 1,
    trendScore:  50,
    signalScore,
    signalDir:   signalDir as any,
    confidence:  'MEDIUM',
    reasoning:   '',
    tags:        [
      ...(tech.rsi14 < 30          ? ['rsi_oversold']    : [] as any[]),
      ...(tech.rsi14 > 70          ? ['rsi_overbought']  : [] as any[]),
      ...(tech.macdCross === 'BULLISH' ? ['macd_bull_cross'] : [] as any[]),
      ...(tech.macdCross === 'BEARISH' ? ['macd_bear_cross'] : [] as any[]),
      ...(tech.bbWidth < 0.03      ? ['bb_squeeze']      : [] as any[]),
      ...(tech.regime === 'TRENDING_UP'   ? ['trending_up']   : [] as any[]),
      ...(tech.regime === 'TRENDING_DOWN' ? ['trending_down'] : [] as any[]),
    ],
    technicals: {
      regime:      tech.regime as any,
      regimeConf:  tech.regimeConf,
      adx:         tech.adx,
      rsi14:       tech.rsi14,
      macdHist:    tech.macdHist,
      macdCross:   tech.macdCross,
      bbPct:       tech.bbPct,
      bbWidth:     tech.bbWidth,
      emaCross:    tech.emaCross,
      stochK:      tech.stochK,
      obvTrend:    tech.obvTrend as any,
      atrPct:      tech.atrPct,
      techScore:   tech.techScore,
      techSignals: [],
    },
    updatedAt: c.openTime,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Position tracker
// ─────────────────────────────────────────────────────────────────────────────

interface Position {
  entryBar:   number
  entryPrice: number
  entryTime:  number
  sizePct:    number
  usdSize:    number
  ruleId:     string
}

// ─────────────────────────────────────────────────────────────────────────────
// Main backtest runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runBacktest(params: BacktestParams): Promise<BacktestResult> {
  const {
    rules, symbol, interval, startTime, endTime,
    initialCapital, mockFearGreed = 50,
  } = params

  // ── 1. Fetch candles ───────────────────────────────────────────────────────
  const candles = await fetchHistoricalCandles(symbol, interval, startTime, endTime, params.marketType ?? 'crypto')
  if (candles.length < 60) {
    throw new Error(`Insufficient candle data: got ${candles.length} bars (need ≥ 60)`)
  }

  // ── 2. Walk bars ───────────────────────────────────────────────────────────
  const WINDOW   = 200   // rolling indicator window
  let   capital  = initialCapital
  let   cash     = initialCapital
  const positions: Position[]    = []
  const trades:    BacktestTrade[] = []
  const equity:    { time: number; equity: number }[] = []
  let   peakEquity = initialCapital
  let   maxDD      = 0
  let   maxDDUsd   = 0
  let   rulesEval  = 0

  // Rule cooldown tracker
  const lastFired = new Map<string, number>()

  for (let i = WINDOW; i < candles.length - 1; i++) {
    const window   = candles.slice(i - WINDOW + 1, i + 1)
    const bar      = candles[i]
    const nextBar  = candles[i + 1]
    const tech     = buildTechnicalsFromWindow(window)
    const snapshot = buildSnapshot(window, symbol, mockFearGreed, tech)

    // ── Evaluate rules against snapshot ─────────────────────────────────────
    for (const rule of rules) {
      if (rule.symbol !== symbol.toUpperCase() && rule.symbol !== 'BTC') continue

      // Cooldown check
      const fired = lastFired.get(rule.id) ?? 0
      if (bar.openTime - fired < rule.cooldownMs) continue

      rulesEval++
      const triggers = evaluateCondition(rule.condition, snapshot)
      if (!triggers) continue

      lastFired.set(rule.id, bar.openTime)

      // ── BUY: open long position ─────────────────────────────────────────
      if (rule.action === 'BUY') {
        const usdSize  = (cash * (rule.sizePct / 100))
        if (usdSize < 1) continue       // not enough cash
        cash           -= usdSize
        positions.push({
          entryBar:   i,
          entryPrice: nextBar.open,     // fill at next bar open (no lookahead)
          entryTime:  nextBar.openTime,
          sizePct:    rule.sizePct,
          usdSize,
          ruleId:     rule.id,
        })
      }

      // ── SELL: close all open positions ──────────────────────────────────
      if (rule.action === 'SELL' && positions.length > 0) {
        for (const pos of [...positions]) {
          const exitPrice  = nextBar.open
          const pnlPct     = (exitPrice - pos.entryPrice) / pos.entryPrice * 100
          const pnlUsd     = pos.usdSize * (pnlPct / 100)
          cash            += pos.usdSize + pnlUsd
          trades.push({
            openTime:   pos.entryTime,
            closeTime:  nextBar.openTime,
            side:       'BUY',
            entryPrice: pos.entryPrice,
            exitPrice,
            sizePct:    pos.sizePct,
            pnlUsd,
            pnlPct,
            holdBars:   i - pos.entryBar,
            rule:       pos.ruleId,
          })
        }
        positions.length = 0
      }
    }

    // ── Mark positions to market ─────────────────────────────────────────────
    const posValue = positions.reduce((sum, p) => {
      return sum + p.usdSize * (bar.close / p.entryPrice)
    }, 0)
    capital = cash + posValue

    // Drawdown tracking
    if (capital > peakEquity) peakEquity = capital
    const dd    = (peakEquity - capital) / peakEquity * 100
    const ddUsd = peakEquity - capital
    if (dd > maxDD)    maxDD    = dd
    if (ddUsd > maxDDUsd) maxDDUsd = ddUsd

    equity.push({ time: bar.openTime, equity: capital })
  }

  // ── Close any remaining positions at last close ────────────────────────────
  const lastBar = candles[candles.length - 1]
  for (const pos of positions) {
    const exitPrice  = lastBar.close
    const pnlPct     = (exitPrice - pos.entryPrice) / pos.entryPrice * 100
    const pnlUsd     = pos.usdSize * (pnlPct / 100)
    capital += pnlUsd
    trades.push({
      openTime:   pos.entryTime,
      closeTime:  lastBar.openTime,
      side:       'BUY',
      entryPrice: pos.entryPrice,
      exitPrice,
      sizePct:    pos.sizePct,
      pnlUsd,
      pnlPct,
      holdBars:   candles.length - 1 - pos.entryBar,
      rule:       pos.ruleId,
    })
  }
  equity.push({ time: lastBar.openTime, equity: capital })

  // ── Metrics ───────────────────────────────────────────────────────────────
  const wins       = trades.filter(t => t.pnlPct > 0)
  const losses     = trades.filter(t => t.pnlPct <= 0)
  const winRate    = trades.length > 0 ? (wins.length / trades.length) * 100 : 0
  const avgWin     = wins.length   > 0 ? wins.reduce((a, t) => a + t.pnlPct, 0) / wins.length     : 0
  const avgLoss    = losses.length > 0 ? Math.abs(losses.reduce((a, t) => a + t.pnlPct, 0) / losses.length) : 0
  const grossProfit = wins.reduce((a, t) => a + t.pnlUsd, 0)
  const grossLoss   = Math.abs(losses.reduce((a, t) => a + t.pnlUsd, 0))
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
  const avgHoldBars  = trades.length > 0 ? trades.reduce((a, t) => a + t.holdBars, 0) / trades.length : 0

  // Sharpe: annualised using bar returns
  const returns: number[] = []
  for (let i = 1; i < equity.length; i++) {
    returns.push((equity[i].equity - equity[i - 1].equity) / equity[i - 1].equity)
  }
  const barsPerYear  = interval === '1d' ? 365 : interval === '4h' ? 2190 : 8760
  const meanReturn   = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
  const variance     = returns.length ? returns.reduce((a, r) => a + (r - meanReturn) ** 2, 0) / returns.length : 0
  const stdDev       = Math.sqrt(variance)
  const sharpeRatio  = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(barsPerYear) : 0

  const totalReturn  = ((capital - initialCapital) / initialCapital) * 100

  return {
    symbol:         symbol.toUpperCase().replace('USDT', ''),
    interval,
    startTime,
    endTime,
    initialCapital,
    finalCapital:   capital,
    totalReturn,
    sharpeRatio,
    maxDrawdown:    maxDD,
    maxDrawdownUsd: maxDDUsd,
    winRate,
    totalTrades:    trades.length,
    winningTrades:  wins.length,
    losingTrades:   losses.length,
    avgWin,
    avgLoss,
    profitFactor,
    avgHoldBars,
    equityCurve:    equity,
    trades:         trades.slice(-200),   // cap to 200 for response size
    barCount:       candles.length,
    rulesEvaluated: rulesEval,
  }
}
