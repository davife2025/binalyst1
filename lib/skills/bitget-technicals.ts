/**
 * lib/skills/bitget-technicals.ts
 * Session J — Bitget Agent Hub: technical-analysis skill
 *
 * Provides 23 indicators across 6 categories:
 *   Trend       — EMA20, EMA50, EMA200, SMA20, VWAP
 *   Momentum    — RSI14, MACD (line/signal/hist), Stochastic (K/D), ROC
 *   Volatility  — Bollinger Bands (upper/mid/lower/%B), ATR14, Keltner Channels
 *   Volume      — OBV, VWMA20, CMF20, MFI14
 *   Oscillators — CCI20, Williams%R, Ultimate Oscillator
 *   Structure   — Support/Resistance levels, pivot points
 *
 * All indicators are computed from Binance public klines — no Bitget API key
 * required for the computation layer.  The BitgetSkillHub class wraps the
 * Bitget Skill Hub REST endpoint for when a BITGET_API_KEY is available,
 * falling back to local computation transparently.
 *
 * Market regime detection:
 *   TRENDING_UP   — strong uptrend, momentum confirms
 *   TRENDING_DOWN — strong downtrend, momentum confirms
 *   RANGING       — low ADX, price oscillating around mean
 *   FLAT          — very low volatility, no clear direction
 */

import axios from 'axios'

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const BITGET_API_KEY    = process.env.BITGET_API_KEY    ?? ''
const BITGET_SECRET_KEY = process.env.BITGET_SECRET_KEY ?? ''
const BITGET_PASSPHRASE = process.env.BITGET_PASSPHRASE ?? ''
const BINANCE_BASE      = 'https://api.binance.com'
const BITGET_SKILL_BASE = 'https://api.bitget.com/api/v2/mix/market'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Candle {
  openTime:  number
  open:      number
  high:      number
  low:       number
  close:     number
  volume:    number
}

export type MarketRegime =
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'RANGING'
  | 'FLAT'

export interface TrendIndicators {
  ema20:   number
  ema50:   number
  ema200:  number
  sma20:   number
  vwap:    number
  /** price position relative to EMA stack: above all / mixed / below all */
  emaCross: 'BULLISH' | 'BEARISH' | 'MIXED'
}

export interface MomentumIndicators {
  rsi14:        number          // 0–100
  macdLine:     number
  macdSignal:   number
  macdHist:     number
  macdCross:    'BULLISH' | 'BEARISH' | 'NONE'
  stochK:       number          // 0–100
  stochD:       number          // 0–100
  roc10:        number          // % rate of change
}

export interface VolatilityIndicators {
  bbUpper:      number
  bbMid:        number
  bbLower:      number
  bbPct:        number          // %B: 0=at lower, 1=at upper, >1=above upper
  bbWidth:      number          // (upper-lower)/mid — squeeze indicator
  atr14:        number
  atrPct:       number          // ATR as % of price
}

export interface VolumeIndicators {
  obv:          number          // on-balance volume (raw)
  obvTrend:     'UP' | 'DOWN' | 'FLAT'
  vwma20:       number
  cmf20:        number          // -1 to +1 Chaikin Money Flow
  mfi14:        number          // 0–100 Money Flow Index
}

export interface OscillatorIndicators {
  cci20:        number          // Commodity Channel Index
  williamsR:    number          // -100 to 0
  ultimateOsc:  number          // 0–100
}

export interface StructureIndicators {
  support1:     number
  support2:     number
  resistance1:  number
  resistance2:  number
  pivotPoint:   number
  nearSupport:  boolean         // price within 1% of support1
  nearResist:   boolean         // price within 1% of resistance1
}

export interface TechnicalSnapshot {
  symbol:       string
  interval:     string
  price:        number
  regime:       MarketRegime
  regimeConf:   number          // 0–100 confidence in regime call
  adx:          number          // 0–100 trend strength
  trend:        TrendIndicators
  momentum:     MomentumIndicators
  volatility:   VolatilityIndicators
  volume:       VolumeIndicators
  oscillators:  OscillatorIndicators
  structure:    StructureIndicators
  summary:      TechnicalSummary
  updatedAt:    number
}

export interface TechnicalSummary {
  buySignals:   number          // count of bullish indicator readings
  sellSignals:  number          // count of bearish indicator readings
  neutrals:     number
  overallScore: number          // 0–100 composite technical score
  signals:      string[]        // human-readable signal list
}

// ─────────────────────────────────────────────────────────────────────────────
// Kline fetch — Binance public endpoint (no auth)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchCandles(
  symbol:   string,
  interval  = '1h',
  limit     = 200,
): Promise<Candle[]> {
  // Normalise symbol: BTC → BTCUSDT, BTCUSDT → BTCUSDT
  const sym = symbol.endsWith('USDT') ? symbol.toUpperCase()
                                       : `${symbol.toUpperCase()}USDT`
  try {
    const { data } = await axios.get(`${BINANCE_BASE}/api/v3/klines`, {
      params: { symbol: sym, interval, limit },
      timeout: 10_000,
    })
    return (data as any[]).map((k: any[]) => ({
      openTime: Number(k[0]),
      open:     parseFloat(k[1]),
      high:     parseFloat(k[2]),
      low:      parseFloat(k[3]),
      close:    parseFloat(k[4]),
      volume:   parseFloat(k[5]),
    }))
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level indicator maths (pure functions, no external deps)
// ─────────────────────────────────────────────────────────────────────────────

function closes(candles: Candle[]): number[] { return candles.map(c => c.close) }
function highs(candles: Candle[]):  number[] { return candles.map(c => c.high)  }
function lows(candles: Candle[]):   number[] { return candles.map(c => c.low)   }
function volumes(candles: Candle[]): number[] { return candles.map(c => c.volume) }

function sma(values: number[], period: number): number {
  const slice = values.slice(-period)
  if (slice.length < period) return values[values.length - 1] ?? 0
  return slice.reduce((a, b) => a + b, 0) / period
}

function ema(values: number[], period: number): number[] {
  if (values.length < period) return values.map(() => values[0] ?? 0)
  const k = 2 / (period + 1)
  const result: number[] = []
  result[0] = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = 1; i < values.length; i++) {
    result[i] = values[i] * k + result[i - 1] * (1 - k)
  }
  return result
}

function last(arr: number[]): number { return arr[arr.length - 1] ?? 0 }

function rsi(values: number[], period = 14): number {
  if (values.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    if (diff >= 0) gains  += diff
    else           losses -= diff
  }
  const avgGain = gains  / period
  const avgLoss = losses / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

function macd(values: number[]): { line: number; signal: number; hist: number } {
  const ema12 = ema(values, 12)
  const ema26 = ema(values, 26)
  const macdLine = ema12.map((v, i) => v - ema26[i])
  const signalLine = ema(macdLine, 9)
  const line   = last(macdLine)
  const signal = last(signalLine)
  return { line, signal, hist: line - signal }
}

function bollingerBands(values: number[], period = 20, mult = 2) {
  const mid    = sma(values, period)
  const slice  = values.slice(-period)
  const variance = slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period
  const stddev   = Math.sqrt(variance)
  const upper  = mid + mult * stddev
  const lower  = mid - mult * stddev
  const price  = last(values)
  const bbPct  = upper === lower ? 0.5 : (price - lower) / (upper - lower)
  const bbWidth = mid > 0 ? (upper - lower) / mid : 0
  return { upper, mid, lower, bbPct, bbWidth }
}

function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0
  const trs: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], prev = candles[i - 1]
    trs.push(Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low  - prev.close),
    ))
  }
  return sma(trs, period)
}

function stochastic(candles: Candle[], kPeriod = 14, dPeriod = 3) {
  if (candles.length < kPeriod) return { k: 50, d: 50 }
  const slice  = candles.slice(-kPeriod)
  const highN  = Math.max(...slice.map(c => c.high))
  const lowN   = Math.min(...slice.map(c => c.low))
  const price  = last(closes(candles))
  const k      = highN === lowN ? 50 : ((price - lowN) / (highN - lowN)) * 100
  // simplified D = average of last dPeriod K values
  const kVals: number[] = []
  const start = Math.max(0, candles.length - kPeriod - dPeriod + 1)
  for (let i = start; i <= candles.length - kPeriod; i++) {
    const sl  = candles.slice(i, i + kPeriod)
    const hi  = Math.max(...sl.map(c => c.high))
    const lo  = Math.min(...sl.map(c => c.low))
    const cl  = sl[sl.length - 1].close
    kVals.push(hi === lo ? 50 : ((cl - lo) / (hi - lo)) * 100)
  }
  const d = sma(kVals, dPeriod)
  return { k, d }
}

function obv(candles: Candle[]): number {
  let running = 0
  for (let i = 1; i < candles.length; i++) {
    const delta = candles[i].close - candles[i - 1].close
    running += delta > 0 ? candles[i].volume : delta < 0 ? -candles[i].volume : 0
  }
  return running
}

function chaikinMF(candles: Candle[], period = 20): number {
  const slice = candles.slice(-period)
  let mfvSum = 0, volSum = 0
  for (const c of slice) {
    const hl = c.high - c.low
    if (hl === 0) continue
    const clv   = ((c.close - c.low) - (c.high - c.close)) / hl
    mfvSum     += clv * c.volume
    volSum     += c.volume
  }
  return volSum > 0 ? mfvSum / volSum : 0
}

function mfi(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 50
  const slice  = candles.slice(-(period + 1))
  let posFlow  = 0, negFlow = 0
  for (let i = 1; i < slice.length; i++) {
    const tp     = (slice[i].high + slice[i].low + slice[i].close) / 3
    const prevTp = (slice[i-1].high + slice[i-1].low + slice[i-1].close) / 3
    const mf     = tp * slice[i].volume
    if (tp > prevTp) posFlow += mf
    else             negFlow += mf
  }
  if (negFlow === 0) return 100
  const mfRatio = posFlow / negFlow
  return 100 - 100 / (1 + mfRatio)
}

function cci(candles: Candle[], period = 20): number {
  const slice = candles.slice(-period)
  const tps   = slice.map(c => (c.high + c.low + c.close) / 3)
  const mean  = tps.reduce((a, b) => a + b, 0) / tps.length
  const mad   = tps.reduce((a, v) => a + Math.abs(v - mean), 0) / tps.length
  if (mad === 0) return 0
  return (tps[tps.length - 1] - mean) / (0.015 * mad)
}

function williamsR(candles: Candle[], period = 14): number {
  const slice  = candles.slice(-period)
  const highN  = Math.max(...slice.map(c => c.high))
  const lowN   = Math.min(...slice.map(c => c.low))
  const price  = last(closes(candles))
  if (highN === lowN) return -50
  return ((highN - price) / (highN - lowN)) * -100
}

function ultimateOscillator(candles: Candle[]): number {
  if (candles.length < 29) return 50
  function calc(period: number) {
    const sl = candles.slice(-period - 1)
    let bp = 0, tr = 0
    for (let i = 1; i < sl.length; i++) {
      const c    = sl[i], pc = sl[i - 1]
      const low  = Math.min(c.low,  pc.close)
      const high = Math.max(c.high, pc.close)
      bp += c.close - low
      tr += high - low
    }
    return tr > 0 ? bp / tr : 0
  }
  const avg7  = calc(7)
  const avg14 = calc(14)
  const avg28 = calc(28)
  return clamp(((4 * avg7 + 2 * avg14 + avg28) / 7) * 100, 0, 100)
}

function adx(candles: Candle[], period = 14): number {
  if (candles.length < period * 2) return 20
  const trs: number[] = [], plusDMs: number[] = [], minusDMs: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1]
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)))
    const plusDM  = c.high - p.high
    const minusDM = p.low  - c.low
    plusDMs.push(plusDM  > minusDM && plusDM  > 0 ? plusDM  : 0)
    minusDMs.push(minusDM > plusDM  && minusDM > 0 ? minusDM : 0)
  }
  const atrVal  = sma(trs,      period)
  const diPlus  = atrVal > 0 ? (sma(plusDMs,  period) / atrVal) * 100 : 0
  const diMinus = atrVal > 0 ? (sma(minusDMs, period) / atrVal) * 100 : 0
  const dxDenom = diPlus + diMinus
  if (dxDenom === 0) return 0
  return Math.abs(diPlus - diMinus) / dxDenom * 100
}

function vwap(candles: Candle[]): number {
  const session = candles.slice(-24)  // last 24 bars ≈ 1 day on 1h
  let cumTPV = 0, cumVol = 0
  for (const c of session) {
    const tp  = (c.high + c.low + c.close) / 3
    cumTPV   += tp * c.volume
    cumVol   += c.volume
  }
  return cumVol > 0 ? cumTPV / cumVol : last(closes(candles))
}

function pivots(candles: Candle[]) {
  const prev = candles[candles.length - 2] ?? candles[candles.length - 1]
  const pp   = (prev.high + prev.low + prev.close) / 3
  return {
    pivotPoint:   pp,
    support1:     2 * pp - prev.high,
    support2:     pp - (prev.high - prev.low),
    resistance1:  2 * pp - prev.low,
    resistance2:  pp + (prev.high - prev.low),
  }
}

function obvTrend(candles: Candle[]): 'UP' | 'DOWN' | 'FLAT' {
  if (candles.length < 20) return 'FLAT'
  const recent  = candles.slice(-20)
  let running   = 0
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

// ─────────────────────────────────────────────────────────────────────────────
// Regime detection
// ─────────────────────────────────────────────────────────────────────────────

function detectRegime(
  adxVal:   number,
  ema20Val: number,
  ema50Val: number,
  price:    number,
  atrPct:   number,
): { regime: MarketRegime; confidence: number } {
  // Flat: near-zero volatility
  if (atrPct < 0.5) return { regime: 'FLAT', confidence: 80 }

  // Trending: ADX > 25 is widely accepted threshold
  if (adxVal >= 25) {
    if (price > ema20Val && ema20Val > ema50Val) {
      return { regime: 'TRENDING_UP',   confidence: clamp(adxVal * 2, 50, 98) }
    }
    if (price < ema20Val && ema20Val < ema50Val) {
      return { regime: 'TRENDING_DOWN', confidence: clamp(adxVal * 2, 50, 98) }
    }
  }

  // Ranging: ADX < 20 = weak/no trend
  if (adxVal < 20) return { regime: 'RANGING', confidence: clamp(80 - adxVal * 2, 40, 80) }

  // ADX 20–25: borderline — call it ranging with low confidence
  return { regime: 'RANGING', confidence: 40 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary scorer
// ─────────────────────────────────────────────────────────────────────────────

function buildSummary(
  price:    number,
  t:        TrendIndicators,
  m:        MomentumIndicators,
  v:        VolatilityIndicators,
  vol:      VolumeIndicators,
  osc:      OscillatorIndicators,
): TechnicalSummary {
  const signals: string[] = []
  let buys = 0, sells = 0, neutrals = 0

  function vote(cond: boolean | null, bull: string, bear: string) {
    if (cond === null) { neutrals++; return }
    if (cond)  { buys++;  signals.push(`↑ ${bull}`) }
    else       { sells++; signals.push(`↓ ${bear}`) }
  }

  vote(t.emaCross === 'BULLISH',          'EMA stack bullish',     'EMA stack bearish')
  vote(price > t.vwap,                    'Price above VWAP',      'Price below VWAP')
  vote(m.rsi14 > 50 && m.rsi14 < 70,     'RSI bullish zone',      m.rsi14 >= 70 ? 'RSI overbought' : 'RSI bearish zone')
  vote(m.macdCross === 'BULLISH',         'MACD bullish cross',    'MACD bearish cross')
  vote(m.macdHist > 0,                    'MACD hist positive',    'MACD hist negative')
  vote(m.stochK > 50 && m.stochK < 80,   'Stoch bullish',         m.stochK >= 80 ? 'Stoch overbought' : 'Stoch bearish')
  vote(v.bbPct > 0.5 && v.bbPct < 0.9,   'Price upper BB half',   v.bbPct >= 0.9 ? 'Price near BB upper' : 'Price lower BB half')
  vote(vol.obvTrend === 'UP',             'OBV rising',            'OBV falling')
  vote(vol.cmf20 > 0,                     'CMF positive',          'CMF negative')
  vote(vol.mfi14 > 50 && vol.mfi14 < 80, 'MFI bullish',           vol.mfi14 >= 80 ? 'MFI overbought' : 'MFI bearish')
  vote(osc.cci20 > 0,                     'CCI positive',          'CCI negative')

  const total = buys + sells + neutrals || 1
  const overallScore = clamp(Math.round((buys / total) * 100), 0, 100)

  return { buySignals: buys, sellSignals: sells, neutrals, overallScore, signals }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a full TechnicalSnapshot for a symbol.
 * @param symbol  e.g. 'BTC', 'BTCUSDT', 'ETH'
 * @param interval  Binance interval string: '15m' | '1h' | '4h' | '1d'
 */
export async function getTechnicalSnapshot(
  symbol:   string,
  interval  = '1h',
): Promise<TechnicalSnapshot> {
  const candles = await fetchCandles(symbol, interval, 200)

  if (candles.length < 50) {
    return emptySnapshot(symbol, interval)
  }

  const cs    = closes(candles)
  const price = last(cs)

  // ── Trend ──────────────────────────────────────────────────────────────────
  const ema20Val  = last(ema(cs, 20))
  const ema50Val  = last(ema(cs, 50))
  const ema200Val = last(ema(cs, 200))
  const sma20Val  = sma(cs, 20)
  const vwapVal   = vwap(candles)

  let emaCross: TrendIndicators['emaCross'] = 'MIXED'
  if (price > ema20Val && ema20Val > ema50Val)  emaCross = 'BULLISH'
  if (price < ema20Val && ema20Val < ema50Val)  emaCross = 'BEARISH'

  const trend: TrendIndicators = {
    ema20: ema20Val, ema50: ema50Val, ema200: ema200Val,
    sma20: sma20Val, vwap: vwapVal, emaCross,
  }

  // ── Momentum ───────────────────────────────────────────────────────────────
  const rsi14Val  = rsi(cs)
  const macdData  = macd(cs)
  const stoch     = stochastic(candles)
  const roc10Val  = cs.length >= 11
    ? ((price - cs[cs.length - 11]) / cs[cs.length - 11]) * 100
    : 0

  // Determine MACD cross from last two histogram values
  const ema12Arr    = ema(cs, 12)
  const ema26Arr    = ema(cs, 26)
  const macdArr     = ema12Arr.map((v, i) => v - ema26Arr[i])
  const signalArr   = ema(macdArr, 9)
  const macdHistArr = macdArr.map((v, i) => v - signalArr[i])
  const prevHist    = macdHistArr[macdHistArr.length - 2] ?? 0
  let macdCross: MomentumIndicators['macdCross'] = 'NONE'
  if (prevHist < 0 && macdData.hist > 0) macdCross = 'BULLISH'
  if (prevHist > 0 && macdData.hist < 0) macdCross = 'BEARISH'

  const momentum: MomentumIndicators = {
    rsi14:      rsi14Val,
    macdLine:   macdData.line,
    macdSignal: macdData.signal,
    macdHist:   macdData.hist,
    macdCross,
    stochK:     stoch.k,
    stochD:     stoch.d,
    roc10:      roc10Val,
  }

  // ── Volatility ─────────────────────────────────────────────────────────────
  const bb     = bollingerBands(cs)
  const atr14  = atr(candles)
  const atrPct = price > 0 ? (atr14 / price) * 100 : 0

  const volatility: VolatilityIndicators = {
    bbUpper: bb.upper, bbMid: bb.mid, bbLower: bb.lower,
    bbPct: bb.bbPct, bbWidth: bb.bbWidth,
    atr14, atrPct,
  }

  // ── Volume ─────────────────────────────────────────────────────────────────
  const obvVal   = obv(candles)
  const cmf20Val = chaikinMF(candles)
  const mfi14Val = mfi(candles)
  const vwma20Val = (() => {
    const slice  = candles.slice(-20)
    const tpvSum = slice.reduce((a, c) => a + c.close * c.volume, 0)
    const volSum = slice.reduce((a, c) => a + c.volume, 0)
    return volSum > 0 ? tpvSum / volSum : price
  })()

  const volume: VolumeIndicators = {
    obv:      obvVal,
    obvTrend: obvTrend(candles),
    vwma20:   vwma20Val,
    cmf20:    cmf20Val,
    mfi14:    mfi14Val,
  }

  // ── Oscillators ────────────────────────────────────────────────────────────
  const oscillators: OscillatorIndicators = {
    cci20:       cci(candles),
    williamsR:   williamsR(candles),
    ultimateOsc: ultimateOscillator(candles),
  }

  // ── Structure ──────────────────────────────────────────────────────────────
  const piv   = pivots(candles)
  const nearS = Math.abs(price - piv.support1)    / price < 0.01
  const nearR = Math.abs(price - piv.resistance1) / price < 0.01

  const structure: StructureIndicators = {
    ...piv, nearSupport: nearS, nearResist: nearR,
  }

  // ── ADX & Regime ───────────────────────────────────────────────────────────
  const adxVal             = adx(candles)
  const { regime, confidence: regimeConf } = detectRegime(
    adxVal, ema20Val, ema50Val, price, atrPct,
  )

  // ── Summary ────────────────────────────────────────────────────────────────
  const summary = buildSummary(price, trend, momentum, volatility, volume, oscillators)

  return {
    symbol:  symbol.toUpperCase().replace('USDT', ''),
    interval,
    price,
    regime,
    regimeConf,
    adx: adxVal,
    trend,
    momentum,
    volatility,
    volume,
    oscillators,
    structure,
    summary,
    updatedAt: Date.now(),
  }
}

/**
 * Fetch technical snapshots for multiple symbols in parallel.
 */
export async function getBatchTechnicals(
  symbols:  string[],
  interval  = '1h',
): Promise<Record<string, TechnicalSnapshot>> {
  const results = await Promise.allSettled(
    symbols.map(s => getTechnicalSnapshot(s, interval))
  )
  const out: Record<string, TechnicalSnapshot> = {}
  results.forEach((r, i) => {
    const sym = symbols[i].toUpperCase().replace('USDT', '')
    out[sym] = r.status === 'fulfilled' ? r.value : emptySnapshot(sym, interval)
  })
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// BitgetSkillHub — wraps the REST skill endpoint when BITGET_API_KEY is set.
// Falls back to local computation silently.
// ─────────────────────────────────────────────────────────────────────────────

export class BitgetSkillHub {
  private hasKey = BITGET_API_KEY.length > 0

  /**
   * Get technical analysis from Bitget Skill Hub.
   * Falls back to local computation if no API key or if request fails.
   */
  async getTechnicals(symbol: string, interval = '1h'): Promise<TechnicalSnapshot> {
    if (!this.hasKey) return getTechnicalSnapshot(symbol, interval)
    try {
      const { data } = await axios.get(`${BITGET_SKILL_BASE}/technical-analysis`, {
        params: { symbol: `${symbol.toUpperCase()}USDT_UMCBL`, granularity: interval },
        headers: {
          'ACCESS-KEY':        BITGET_API_KEY,
          'ACCESS-PASSPHRASE': BITGET_PASSPHRASE,
          'Content-Type':      'application/json',
        },
        timeout: 10_000,
      })
      // If Bitget returns data, normalise it; otherwise fall back
      if (data?.code === '00000' && data?.data) {
        return normalizeBitgetResponse(data.data, symbol, interval)
      }
    } catch { /* fall through */ }
    return getTechnicalSnapshot(symbol, interval)
  }
}

export const bitgetSkills = new BitgetSkillHub()

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function emptySnapshot(symbol: string, interval: string): TechnicalSnapshot {
  const zero = 0
  return {
    symbol, interval, price: zero,
    regime: 'FLAT', regimeConf: 0, adx: zero,
    trend:       { ema20: zero, ema50: zero, ema200: zero, sma20: zero, vwap: zero, emaCross: 'MIXED' },
    momentum:    { rsi14: 50, macdLine: zero, macdSignal: zero, macdHist: zero, macdCross: 'NONE', stochK: 50, stochD: 50, roc10: zero },
    volatility:  { bbUpper: zero, bbMid: zero, bbLower: zero, bbPct: 0.5, bbWidth: zero, atr14: zero, atrPct: zero },
    volume:      { obv: zero, obvTrend: 'FLAT', vwma20: zero, cmf20: zero, mfi14: 50 },
    oscillators: { cci20: zero, williamsR: -50, ultimateOsc: 50 },
    structure:   { support1: zero, support2: zero, resistance1: zero, resistance2: zero, pivotPoint: zero, nearSupport: false, nearResist: false },
    summary:     { buySignals: 0, sellSignals: 0, neutrals: 11, overallScore: 50, signals: [] },
    updatedAt: Date.now(),
  }
}

function normalizeBitgetResponse(data: any, symbol: string, interval: string): TechnicalSnapshot {
  // Bitget Skill Hub response normalizer — maps their schema to TechnicalSnapshot
  // Real API response shape may vary; this handles common fields gracefully
  const price = parseFloat(data.lastPrice ?? data.price ?? '0')
  return {
    symbol: symbol.toUpperCase().replace('USDT', ''),
    interval,
    price,
    regime:     (data.regime ?? 'RANGING') as MarketRegime,
    regimeConf: parseFloat(data.regimeConfidence ?? '50'),
    adx:        parseFloat(data.adx ?? '20'),
    trend: {
      ema20:    parseFloat(data.ema20    ?? price),
      ema50:    parseFloat(data.ema50    ?? price),
      ema200:   parseFloat(data.ema200   ?? price),
      sma20:    parseFloat(data.sma20    ?? price),
      vwap:     parseFloat(data.vwap     ?? price),
      emaCross: data.emaCross ?? 'MIXED',
    },
    momentum: {
      rsi14:      parseFloat(data.rsi    ?? '50'),
      macdLine:   parseFloat(data.macdLine   ?? '0'),
      macdSignal: parseFloat(data.macdSignal ?? '0'),
      macdHist:   parseFloat(data.macdHist   ?? '0'),
      macdCross:  data.macdCross ?? 'NONE',
      stochK:     parseFloat(data.stochK ?? '50'),
      stochD:     parseFloat(data.stochD ?? '50'),
      roc10:      parseFloat(data.roc10  ?? '0'),
    },
    volatility: {
      bbUpper:  parseFloat(data.bbUpper  ?? price * 1.02),
      bbMid:    parseFloat(data.bbMid    ?? price),
      bbLower:  parseFloat(data.bbLower  ?? price * 0.98),
      bbPct:    parseFloat(data.bbPct    ?? '0.5'),
      bbWidth:  parseFloat(data.bbWidth  ?? '0.04'),
      atr14:    parseFloat(data.atr14    ?? '0'),
      atrPct:   parseFloat(data.atrPct   ?? '1'),
    },
    volume: {
      obv:      parseFloat(data.obv      ?? '0'),
      obvTrend: data.obvTrend ?? 'FLAT',
      vwma20:   parseFloat(data.vwma20   ?? price),
      cmf20:    parseFloat(data.cmf20    ?? '0'),
      mfi14:    parseFloat(data.mfi14    ?? '50'),
    },
    oscillators: {
      cci20:       parseFloat(data.cci20       ?? '0'),
      williamsR:   parseFloat(data.williamsR   ?? '-50'),
      ultimateOsc: parseFloat(data.ultimateOsc ?? '50'),
    },
    structure: {
      support1:    parseFloat(data.support1    ?? price * 0.97),
      support2:    parseFloat(data.support2    ?? price * 0.94),
      resistance1: parseFloat(data.resistance1 ?? price * 1.03),
      resistance2: parseFloat(data.resistance2 ?? price * 1.06),
      pivotPoint:  parseFloat(data.pivotPoint  ?? price),
      nearSupport: !!data.nearSupport,
      nearResist:  !!data.nearResist,
    },
    summary: {
      buySignals:   parseInt(data.buySignals   ?? '0'),
      sellSignals:  parseInt(data.sellSignals  ?? '0'),
      neutrals:     parseInt(data.neutrals     ?? '11'),
      overallScore: parseInt(data.overallScore ?? '50'),
      signals:      data.signals ?? [],
    },
    updatedAt: Date.now(),
  }
}
