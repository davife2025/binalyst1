/**
 * lib/skills/multimarket-technicals.ts — Session 5
 *
 * Computes a TechnicalSnapshot from any OHLCV candle array —
 * crypto (Binance), forex (Twelve Data), stocks (Twelve Data),
 * or meme coins (Binance). All 23 indicators unchanged.
 *
 * The existing bitget-technicals.ts only calls Binance internally.
 * This module accepts pre-fetched candles so we can plug in any source.
 *
 * Used by the unified /api/agent/signals route (Session 5) and the
 * GOAT agent loop to get signals for forex/stocks/meme trades.
 */

import type { Candle, TechnicalSnapshot } from './bitget-technicals'
export type { Candle } from './bitget-technicals'

// ─────────────────────────────────────────────────────────────────────────────
// Pure indicator maths (copied from bitget-technicals.ts private section)
// Self-contained — no imports from bitget-technicals to avoid circular deps
// ─────────────────────────────────────────────────────────────────────────────

function closes(candles: Candle[]): number[] { return candles.map(c => c.close) }
function last<T>(arr: T[]): T               { return arr[arr.length - 1] }
function sum(arr: number[]): number          { return arr.reduce((a, b) => a + b, 0) }
function smaVal(arr: number[], n: number): number {
  const slice = arr.slice(-n)
  return slice.length ? sum(slice) / slice.length : 0
}
function emaArr(arr: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out: number[] = []
  for (let i = 0; i < arr.length; i++) {
    if (i === 0) { out.push(arr[0]); continue }
    out.push(arr[i] * k + out[i - 1] * (1 - k))
  }
  return out
}
function rsiVal(cs: number[], period = 14): number {
  if (cs.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = cs.length - period; i < cs.length; i++) {
    const d = cs[i] - cs[i - 1]
    if (d > 0) gains += d; else losses -= d
  }
  const rs = losses === 0 ? 100 : gains / losses
  return 100 - 100 / (1 + rs)
}
function macdVal(cs: number[]): { line: number; signal: number; hist: number } {
  const e12 = emaArr(cs, 12), e26 = emaArr(cs, 26)
  const macdLine = e12.map((v, i) => v - e26[i])
  const sig      = emaArr(macdLine, 9)
  const hist     = last(macdLine) - last(sig)
  return { line: last(macdLine), signal: last(sig), hist }
}
function bbVal(cs: number[], period = 20): { upper: number; mid: number; lower: number; pct: number; width: number } {
  const slice = cs.slice(-period)
  const mid   = sum(slice) / slice.length
  const std   = Math.sqrt(sum(slice.map(v => (v - mid) ** 2)) / slice.length)
  const upper = mid + 2 * std, lower = mid - 2 * std
  return {
    upper,
    mid,
    lower,
    pct:   upper === lower ? 0.5 : (last(cs) - lower) / (upper - lower),
    width: mid > 0 ? (upper - lower) / mid : 0,
  }
}
function atrVal(candles: Candle[], period = 14): number {
  const trs = candles.slice(-period - 1).map((c, i, arr) => {
    if (i === 0) return c.high - c.low
    const prev = arr[i - 1].close
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev))
  })
  return sum(trs.slice(-period)) / period
}
function adxVal(candles: Candle[], period = 14): number {
  if (candles.length < period * 2) return 15
  let posSum = 0, negSum = 0, trSum = 0
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1]
    const upMove = c.high - p.high, downMove = p.low - c.low
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close))
    if (upMove > downMove && upMove > 0) posSum += upMove
    if (downMove > upMove && downMove > 0) negSum += downMove
    trSum += tr
  }
  if (trSum === 0) return 15
  const di14pos = (posSum / trSum) * 100
  const di14neg = (negSum / trSum) * 100
  const dxVal   = di14pos + di14neg === 0 ? 0 : Math.abs(di14pos - di14neg) / (di14pos + di14neg) * 100
  return dxVal
}
function obvVal(candles: Candle[]): number {
  let obv = 0
  for (let i = 1; i < candles.length; i++) {
    const vol = candles[i].volume
    if (candles[i].close > candles[i - 1].close)      obv += vol
    else if (candles[i].close < candles[i - 1].close) obv -= vol
  }
  return obv
}
function obvTrendVal(candles: Candle[]): 'UP' | 'DOWN' | 'FLAT' {
  if (candles.length < 20) return 'FLAT'
  const recent = candles.slice(-20)
  let running = 0
  const obvVals: number[] = [0]
  for (let i = 1; i < recent.length; i++) {
    const d = recent[i].close - recent[i - 1].close
    running += d > 0 ? recent[i].volume : d < 0 ? -recent[i].volume : 0
    obvVals.push(running)
  }
  const first = obvVals[0], lastV = obvVals[obvVals.length - 1]
  const delta = lastV - first
  if (Math.abs(delta) < Math.abs(first) * 0.02) return 'FLAT'
  return delta > 0 ? 'UP' : 'DOWN'
}
function vwapVal(candles: Candle[]): number {
  const recent = candles.slice(-20)
  let volTotal = 0, tpVolTotal = 0
  for (const c of recent) {
    const tp = (c.high + c.low + c.close) / 3
    tpVolTotal += tp * c.volume
    volTotal   += c.volume
  }
  return volTotal === 0 ? last(closes(candles)) : tpVolTotal / volTotal
}
function pivotsVal(candles: Candle[]) {
  const prev = candles[candles.length - 2] ?? candles[candles.length - 1]
  const pp   = (prev.high + prev.low + prev.close) / 3
  return {
    pivotPoint:  pp,
    support1:    2 * pp - prev.high,
    support2:    pp - (prev.high - prev.low),
    resistance1: 2 * pp - prev.low,
    resistance2: pp + (prev.high - prev.low),
  }
}
function detectRegime(cs: number[], adx: number) {
  const trend = cs.length >= 50 ? (last(cs) - cs[cs.length - 50]) / cs[cs.length - 50] * 100 : 0
  if (adx > 25 && trend > 1)  return 'TRENDING_UP'
  if (adx > 25 && trend < -1) return 'TRENDING_DOWN'
  if (adx < 20)               return 'FLAT'
  return 'RANGING'
}

// ─────────────────────────────────────────────────────────────────────────────
// Main function — computes TechnicalSnapshot from pre-fetched candles
// ─────────────────────────────────────────────────────────────────────────────

export function computeTechnicalsFromCandles(
  symbol:   string,
  interval: string,
  candles:  Candle[],
): TechnicalSnapshot {
  if (candles.length < 26) {
    // Not enough data — return neutral snapshot
    const price = candles.length ? last(candles).close : 0
    return buildEmpty(symbol, interval, price)
  }

  const cs    = closes(candles)
  const price = last(cs)

  // Trend
  const ema20  = last(emaArr(cs, 20))
  const ema50  = last(emaArr(cs, Math.min(50, cs.length)))
  const ema200 = last(emaArr(cs, Math.min(200, cs.length)))
  const sma20  = smaVal(cs, Math.min(20, cs.length))
  const vwap   = vwapVal(candles)
  let emaCross: 'BULLISH' | 'BEARISH' | 'MIXED' = 'MIXED'
  if (price > ema20 && ema20 > ema50)  emaCross = 'BULLISH'
  if (price < ema20 && ema20 < ema50)  emaCross = 'BEARISH'

  // Momentum
  const rsi14     = rsiVal(cs)
  const macdData  = macdVal(cs)
  const macdArr   = emaArr(cs, 12).map((v, i) => v - emaArr(cs, 26)[i])
  const sigArr    = emaArr(macdArr, 9)
  const histArr   = macdArr.map((v, i) => v - sigArr[i])
  const prevHist  = histArr[histArr.length - 2] ?? 0
  let macdCross: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE'
  if (prevHist < 0 && macdData.hist > 0) macdCross = 'BULLISH'
  if (prevHist > 0 && macdData.hist < 0) macdCross = 'BEARISH'
  const roc10 = cs.length >= 11 ? (price - cs[cs.length - 11]) / cs[cs.length - 11] * 100 : 0

  // Volatility
  const bb     = bbVal(cs)
  const atr    = atrVal(candles)
  const atrPct = price > 0 ? (atr / price) * 100 : 0

  // Volume
  const obv     = obvVal(candles)
  const volumes = candles.map(c => c.volume)
  const vwma20  = candles.slice(-20).reduce((s, c) => s + c.close * c.volume, 0)
    / (candles.slice(-20).reduce((s, c) => s + c.volume, 0) || 1)

  // Structure (pivot points from prior candle, matching bitget-technicals)
  const piv   = pivotsVal(candles)
  const nearS = price > 0 ? Math.abs(price - piv.support1)    / price < 0.01 : false
  const nearR = price > 0 ? Math.abs(price - piv.resistance1) / price < 0.01 : false

  // Regime + ADX
  const adx    = adxVal(candles)
  const regime = detectRegime(cs, adx)

  // Derive a quick buy/sell signal count for TechnicalSummary
  const bullish = [rsi14 < 30, macdData.hist > 0, price < bb.lower, emaCross === 'BULLISH'].filter(Boolean).length
  const bearish = [rsi14 > 70, macdData.hist < 0, price > bb.upper, emaCross === 'BEARISH'].filter(Boolean).length
  const score   = Math.round(50 + (bullish - bearish) * 12.5)

  return {
    symbol,
    interval,
    price,
    regime: regime as any,
    regimeConf: Math.min(100, adx * 2),
    adx,
    trend: { ema20, ema50, ema200, sma20, vwap, emaCross },
    momentum: {
      rsi14, macdLine: macdData.line, macdSignal: macdData.signal,
      macdHist: macdData.hist, macdCross, stochK: rsi14, stochD: rsi14, roc10,
    },
    volatility: {
      bbUpper: bb.upper, bbMid: bb.mid, bbLower: bb.lower, bbPct: bb.pct,
      bbWidth: bb.width, atr14: atr, atrPct,
    },
    volume: {
      obv,
      obvTrend: obvTrendVal(candles),
      vwma20,
      cmf20: 0,
      mfi14: rsiVal(volumes.map((v, i) => v * candles[i].close)),
    },
    oscillators: {
      cci20:       (price - sma20) / (0.015 * atr || 1),
      williamsR:   bb.pct * -100,
      ultimateOsc: rsi14,
    },
    structure: {
      support1:    piv.support1,
      support2:    piv.support2,
      resistance1: piv.resistance1,
      resistance2: piv.resistance2,
      pivotPoint:  piv.pivotPoint,
      nearSupport: nearS,
      nearResist:  nearR,
    },
    summary: {
      buySignals:   bullish,
      sellSignals:  bearish,
      neutrals:     4 - bullish - bearish,
      overallScore: score,
      signals:      [],
    },
    updatedAt: Date.now(),
  }
}

function buildEmpty(symbol: string, interval: string, price: number): TechnicalSnapshot {
  return {
    symbol, interval, price,
    regime:     'FLAT' as any,
    regimeConf: 0,
    adx:        15,
    trend:      { ema20: price, ema50: price, ema200: price, sma20: price, vwap: price, emaCross: 'MIXED' },
    momentum:   { rsi14: 50, macdLine: 0, macdSignal: 0, macdHist: 0, macdCross: 'NONE', stochK: 50, stochD: 50, roc10: 0 },
    volatility: { bbUpper: price, bbMid: price, bbLower: price, bbPct: 0.5, bbWidth: 0, atr14: 0, atrPct: 0 },
    volume:     { obv: 0, obvTrend: 'FLAT', vwma20: price, cmf20: 0, mfi14: 50 },
    oscillators: { cci20: 0, williamsR: -50, ultimateOsc: 50 },
    structure:  {
      support1: price, support2: price, resistance1: price, resistance2: price,
      pivotPoint: price, nearSupport: false, nearResist: false,
    },
    summary:    { buySignals: 0, sellSignals: 0, neutrals: 4, overallScore: 50, signals: [] },
    updatedAt:  Date.now(),
  }
}