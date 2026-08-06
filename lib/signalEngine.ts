/**
 * lib/signalEngine.ts
 * Signal aggregation engine — Session J (Bitget Technicals upgrade).
 *
 * Changes from Session B baseline:
 *  - SignalSnapshot extended with technical fields (rsi, macd, bb, regime, adx)
 *  - computeSignalSnapshot() accepts optional TechnicalSnapshot and merges it
 *  - New StrategyCondition types: rsi_above/below, macd_cross, bb_breakout,
 *    bb_squeeze, regime_is, adx_above, stoch_cross, obv_trend
 *  - buildReasoning() includes technical context when available
 *  - All Session B logic preserved — this is a strict superset
 */

import type { CMCSignal, FearAndGreed, CMCToken } from './skills/cmc'
import type { TechnicalSnapshot, MarketRegime }   from './skills/bitget-technicals'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SignalSnapshot {
  symbol:       string
  price:        number
  change1h:     number
  change24h:    number
  change7d:     number
  volume24h:    number
  marketCap:    number
  fearGreed:    number
  fgLabel:      string
  momentum:     number        // -100 to +100 (CMC-derived)
  volumeSpike:  number        // ratio vs avg (1.0 = normal)
  trendScore:   number        // 0–100 directional strength
  signalScore:  number        // 0–100 composite buy signal
  signalDir:    'BUY' | 'SELL' | 'HOLD'
  confidence:   'HIGH' | 'MEDIUM' | 'LOW'
  reasoning:    string
  tags:         SignalTag[]
  updatedAt:    number

  // ── Technical fields (Session J) ──────────────────────────────────────────
  // Populated when TechnicalSnapshot is available; undefined otherwise
  // so all existing code that doesn't use technicals still compiles cleanly.
  technicals?: {
    regime:       MarketRegime
    regimeConf:   number
    adx:          number
    rsi14:        number
    macdHist:     number
    macdCross:    'BULLISH' | 'BEARISH' | 'NONE'
    bbPct:        number        // 0=at lower band, 1=at upper band
    bbWidth:      number        // squeeze indicator (low = compressed)
    emaCross:     'BULLISH' | 'BEARISH' | 'MIXED'
    stochK:       number
    obvTrend:     'UP' | 'DOWN' | 'FLAT'
    atrPct:       number
    techScore:    number        // 0–100 from TechnicalSummary.overallScore
    techSignals:  string[]      // human-readable signal list
  }
}

export type SignalTag =
  | 'extreme_fear'
  | 'extreme_greed'
  | 'volume_spike'
  | 'strong_momentum'
  | 'reversal_watch'
  | 'dca_zone'
  | 'overbought'
  | 'oversold'
  | 'breakout'
  | 'trending_cmc'
  // Session J — technical tags
  | 'rsi_oversold'
  | 'rsi_overbought'
  | 'macd_bull_cross'
  | 'macd_bear_cross'
  | 'bb_squeeze'
  | 'bb_breakout_up'
  | 'bb_breakout_down'
  | 'trending_up'
  | 'trending_down'
  | 'ranging'
  | 'near_support'
  | 'near_resistance'

export interface SignalSummary {
  bullishCount:  number
  bearishCount:  number
  neutralCount:  number
  avgScore:      number
  topBuy:        SignalSnapshot | null
  topSell:       SignalSnapshot | null
  fearGreed:     FearAndGreed
  updatedAt:     number
}

// ─────────────────────────────────────────────────────────────────────────────
// Core signal computation
// ─────────────────────────────────────────────────────────────────────────────

export function computeSignalSnapshot(
  token:         CMCToken,
  fg:            FearAndGreed,
  avgVolume24h?: number,
  trendingRank?: number,
  tech?:         TechnicalSnapshot,   // ← Session J addition
): SignalSnapshot {

  // 1. Momentum: weighted combo of 1h, 24h, 7d changes
  const momentum = clamp(
    token.change1h  * 3 +
    token.change24h * 1 +
    token.change7d  * 0.2,
    -100, 100
  )

  // 2. Volume spike ratio
  const volumeSpike = avgVolume24h && avgVolume24h > 0
    ? token.volume24h / avgVolume24h
    : 1.0

  // 3. Trend score
  const allSameDir =
    (token.change1h > 0 && token.change24h > 0 && token.change7d > 0) ||
    (token.change1h < 0 && token.change24h < 0 && token.change7d < 0)
  const trendScore = clamp(
    allSameDir
      ? 60 + Math.abs(token.change24h) * 2
      : 40 - Math.abs(token.change24h),
    0, 100
  )

  // 4. Fear & Greed bias (unchanged from Session B)
  const fgBias =
    fg.value <= 20 ?  25 :
    fg.value <= 30 ?  15 :
    fg.value <= 44 ?   5 :
    fg.value <= 55 ?   0 :
    fg.value <= 70 ?  -5 :
    fg.value <= 80 ? -15 : -25

  // 5. CMC trending rank boost
  const trendBoost = trendingRank != null && trendingRank <= 20
    ? Math.max(0, 10 - trendingRank * 0.4)
    : 0

  // 6. Volume spike boost
  const volBoost = volumeSpike >= 3 ? 10 : volumeSpike >= 2 ? 5 : 0

  // 7. Technical score boost (Session J)
  // tech.summary.overallScore is 0–100; centre at 50 and scale to ±20 pts
  const techBoost = tech
    ? clamp((tech.summary.overallScore - 50) * 0.4, -20, 20)
    : 0

  // 8. Composite signal score
  const rawScore =
    50 +
    momentum * 0.4 +
    fgBias +
    trendBoost +
    volBoost +
    techBoost

  const signalScore = clamp(rawScore, 0, 100)

  // 9. Direction & confidence
  let signalDir: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'

  if (signalScore >= 68) { signalDir = 'BUY';  confidence = signalScore >= 82 ? 'HIGH' : 'MEDIUM' }
  if (signalScore <= 32) { signalDir = 'SELL'; confidence = signalScore <= 18 ? 'HIGH' : 'MEDIUM' }

  // 10. Tags
  const tags = buildTags(token, fg, momentum, volumeSpike, trendingRank, tech)

  // 11. Reasoning
  const reasoning = buildReasoning(token, fg, momentum, volumeSpike, signalDir, trendingRank, tech)

  // 12. Technical sub-object (Session J)
  const technicals: SignalSnapshot['technicals'] = tech
    ? {
        regime:      tech.regime,
        regimeConf:  tech.regimeConf,
        adx:         tech.adx,
        rsi14:       tech.momentum.rsi14,
        macdHist:    tech.momentum.macdHist,
        macdCross:   tech.momentum.macdCross,
        bbPct:       tech.volatility.bbPct,
        bbWidth:     tech.volatility.bbWidth,
        emaCross:    tech.trend.emaCross,
        stochK:      tech.momentum.stochK,
        obvTrend:    tech.volume.obvTrend,
        atrPct:      tech.volatility.atrPct,
        techScore:   tech.summary.overallScore,
        techSignals: tech.summary.signals,
      }
    : undefined

  return {
    symbol:      token.symbol,
    price:       token.price,
    change1h:    token.change1h,
    change24h:   token.change24h,
    change7d:    token.change7d,
    volume24h:   token.volume24h,
    marketCap:   token.marketCap,
    fearGreed:   fg.value,
    fgLabel:     fg.label,
    momentum,
    volumeSpike,
    trendScore,
    signalScore,
    signalDir,
    confidence,
    reasoning,
    tags,
    technicals,
    updatedAt:   Date.now(),
  }
}

export function computeSummary(
  signals:  SignalSnapshot[],
  fg:       FearAndGreed,
): SignalSummary {
  const buys  = signals.filter(s => s.signalDir === 'BUY')
  const sells = signals.filter(s => s.signalDir === 'SELL')
  const holds = signals.filter(s => s.signalDir === 'HOLD')
  const avg   = signals.length
    ? signals.reduce((a, b) => a + b.signalScore, 0) / signals.length
    : 50

  const topBuy  = buys.sort((a, b) => b.signalScore - a.signalScore)[0]  ?? null
  const topSell = sells.sort((a, b) => a.signalScore - b.signalScore)[0] ?? null

  return {
    bullishCount: buys.length,
    bearishCount: sells.length,
    neutralCount: holds.length,
    avgScore:     avg,
    topBuy,
    topSell,
    fearGreed:    fg,
    updatedAt:    Date.now(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy rule evaluator
// ─────────────────────────────────────────────────────────────────────────────

export interface StrategyRule {
  id:        string
  symbol:    string
  condition: StrategyCondition
  action:    'BUY' | 'SELL' | 'HOLD'
  sizePct:   number
  priority:  number
  cooldownMs: number
  lastFiredAt?: number
}

export type StrategyCondition =
  // ── Session B conditions (unchanged) ──────────────────────────────────────
  | { type: 'fear_below';       value: number }
  | { type: 'fear_above';       value: number }
  | { type: 'signal_above';     value: number }
  | { type: 'signal_below';     value: number }
  | { type: 'change24h_above';  value: number }
  | { type: 'change24h_below';  value: number }
  | { type: 'price_above';      value: number }
  | { type: 'price_below';      value: number }
  | { type: 'tag_includes';     tag: SignalTag }
  | { type: 'and'; left: StrategyCondition; right: StrategyCondition }
  | { type: 'or';  left: StrategyCondition; right: StrategyCondition }
  // ── Session J conditions (technical) ──────────────────────────────────────
  | { type: 'rsi_above';        value: number }
  | { type: 'rsi_below';        value: number }
  | { type: 'macd_cross';       direction: 'BULLISH' | 'BEARISH' }
  | { type: 'macd_hist_above';  value: number }
  | { type: 'macd_hist_below';  value: number }
  | { type: 'bb_pct_above';     value: number }   // bbPct > value (e.g. 0.8 = near upper)
  | { type: 'bb_pct_below';     value: number }   // bbPct < value (e.g. 0.2 = near lower)
  | { type: 'bb_squeeze';       threshold: number }  // bbWidth < threshold
  | { type: 'bb_breakout' }                          // price outside bands
  | { type: 'regime_is';        regime: MarketRegime }
  | { type: 'adx_above';        value: number }
  | { type: 'adx_below';        value: number }
  | { type: 'stoch_cross';      direction: 'BULLISH' | 'BEARISH' }
  | { type: 'obv_trend';        trend: 'UP' | 'DOWN' | 'FLAT' }
  | { type: 'ema_cross';        cross: 'BULLISH' | 'BEARISH' | 'MIXED' }
  | { type: 'tech_score_above'; value: number }
  | { type: 'tech_score_below'; value: number }
  | { type: 'near_support' }
  | { type: 'near_resistance' }

export function evaluateCondition(
  cond:   StrategyCondition,
  signal: SignalSnapshot,
): boolean {
  const t = signal.technicals  // may be undefined — technical conditions return false if no data

  switch (cond.type) {
    // Session B
    case 'fear_below':      return signal.fearGreed < cond.value
    case 'fear_above':      return signal.fearGreed > cond.value
    case 'signal_above':    return signal.signalScore > cond.value
    case 'signal_below':    return signal.signalScore < cond.value
    case 'change24h_above': return signal.change24h > cond.value
    case 'change24h_below': return signal.change24h < cond.value
    case 'price_above':     return signal.price > cond.value
    case 'price_below':     return signal.price < cond.value
    case 'tag_includes':    return signal.tags.includes(cond.tag)
    case 'and':             return evaluateCondition(cond.left, signal) && evaluateCondition(cond.right, signal)
    case 'or':              return evaluateCondition(cond.left, signal) || evaluateCondition(cond.right, signal)
    // Session J — technical
    case 'rsi_above':        return t ? t.rsi14 > cond.value : false
    case 'rsi_below':        return t ? t.rsi14 < cond.value : false
    case 'macd_cross':       return t ? t.macdCross === cond.direction : false
    case 'macd_hist_above':  return t ? t.macdHist > cond.value : false
    case 'macd_hist_below':  return t ? t.macdHist < cond.value : false
    case 'bb_pct_above':     return t ? t.bbPct > cond.value : false
    case 'bb_pct_below':     return t ? t.bbPct < cond.value : false
    case 'bb_squeeze':       return t ? t.bbWidth < cond.threshold : false
    case 'bb_breakout':      return t ? (t.bbPct > 1 || t.bbPct < 0) : false
    case 'regime_is':        return t ? t.regime === cond.regime : false
    case 'adx_above':        return t ? t.adx > cond.value : false
    case 'adx_below':        return t ? t.adx < cond.value : false
    case 'stoch_cross':      return t
      ? (cond.direction === 'BULLISH' ? t.stochK > 20 && t.stochK < 80 : t.stochK > 80)
      : false
    case 'obv_trend':        return t ? t.obvTrend === cond.trend : false
    case 'ema_cross':        return t ? t.emaCross === cond.cross : false
    case 'tech_score_above': return t ? t.techScore > cond.value : false
    case 'tech_score_below': return t ? t.techScore < cond.value : false
    case 'near_support':     return !!signal.tags.includes('near_support')
    case 'near_resistance':  return !!signal.tags.includes('near_resistance')
    default:                 return false
  }
}

export function evaluateRules(
  rules:   StrategyRule[],
  signals: SignalSnapshot[],
  now      = Date.now(),
): Array<{ rule: StrategyRule; signal: SignalSnapshot }> {
  const fired: Array<{ rule: StrategyRule; signal: SignalSnapshot }> = []

  for (const rule of rules.filter(r => r.action !== 'HOLD').sort((a, b) => b.priority - a.priority)) {
    if (rule.lastFiredAt && now - rule.lastFiredAt < rule.cooldownMs) continue
    const signal = signals.find(s => s.symbol === rule.symbol)
    if (!signal) continue
    if (evaluateCondition(rule.condition, signal)) {
      fired.push({ rule, signal })
    }
  }

  return fired
}

// ─────────────────────────────────────────────────────────────────────────────
// Natural-language strategy parser — Session J extended
// ─────────────────────────────────────────────────────────────────────────────

export function parseSimpleStrategy(text: string): StrategyRule[] {
  const rules: StrategyRule[] = []
  const lines = text.split('\n').filter(l => l.trim())

  for (const line of lines) {
    const l          = line.toLowerCase()
    const sizeMatch  = l.match(/(\d+)%/)
    const sizePct    = sizeMatch ? parseInt(sizeMatch[1]) : 10

    // ── Session B patterns ────────────────────────────────────────────────
    const buyMatch  = l.match(/buy\s+(\w+)\s+when\s+fear\s*[<≤]\s*(\d+)/)
    const sellMatch = l.match(/sell\s+(\w+)\s+when\s+fear\s*[>≥]\s*(\d+)/)
    const sigBuy    = l.match(/buy\s+(\w+)\s+when\s+signal\s*[>≥]\s*(\d+)/)
    const sigSell   = l.match(/sell\s+(\w+)\s+when\s+signal\s*[<≤]\s*(\d+)/)

    if (buyMatch)  rules.push(makeRule(buyMatch[1],  { type: 'fear_below',    value: parseInt(buyMatch[2])  }, 'BUY',  sizePct, rules.length))
    if (sellMatch) rules.push(makeRule(sellMatch[1], { type: 'fear_above',    value: parseInt(sellMatch[2]) }, 'SELL', sizePct, rules.length))
    if (sigBuy)    rules.push(makeRule(sigBuy[1],    { type: 'signal_above',  value: parseInt(sigBuy[2])   }, 'BUY',  sizePct, rules.length))
    if (sigSell)   rules.push(makeRule(sigSell[1],   { type: 'signal_below',  value: parseInt(sigSell[2])  }, 'SELL', sizePct, rules.length))

    // ── Session J patterns — technical conditions ─────────────────────────
    // "buy BTC when RSI drops below 30"
    const rsiBuy  = l.match(/buy\s+(\w+)\s+when\s+rsi\s*(?:drops?\s*)?(?:below|<|≤)\s*(\d+)/)
    const rsiSell = l.match(/sell\s+(\w+)\s+when\s+rsi\s*(?:rises?\s*)?(?:above|>|≥)\s*(\d+)/)
    if (rsiBuy)  rules.push(makeRule(rsiBuy[1],  { type: 'rsi_below', value: parseInt(rsiBuy[2])  }, 'BUY',  sizePct, rules.length))
    if (rsiSell) rules.push(makeRule(rsiSell[1], { type: 'rsi_above', value: parseInt(rsiSell[2]) }, 'SELL', sizePct, rules.length))

    // "buy BTC when MACD crosses bullish"
    const macdBuy  = l.match(/buy\s+(\w+)\s+when\s+macd\s+cross(?:es)?\s+(?:bullish|up|positive)/)
    const macdSell = l.match(/sell\s+(\w+)\s+when\s+macd\s+cross(?:es)?\s+(?:bearish|down|negative)/)
    if (macdBuy)  rules.push(makeRule(macdBuy[1],  { type: 'macd_cross', direction: 'BULLISH' }, 'BUY',  sizePct, rules.length))
    if (macdSell) rules.push(makeRule(macdSell[1], { type: 'macd_cross', direction: 'BEARISH' }, 'SELL', sizePct, rules.length))

    // "buy BTC when trending up" / "hold BTC when ranging"
    const trendUp   = l.match(/buy\s+(\w+)\s+when\s+(?:regime\s+is\s+)?trending\s*up/)
    const trendDown = l.match(/sell\s+(\w+)\s+when\s+(?:regime\s+is\s+)?trending\s*down/)
    if (trendUp)   rules.push(makeRule(trendUp[1],   { type: 'regime_is', regime: 'TRENDING_UP'   }, 'BUY',  sizePct, rules.length))
    if (trendDown) rules.push(makeRule(trendDown[1], { type: 'regime_is', regime: 'TRENDING_DOWN' }, 'SELL', sizePct, rules.length))

    // "buy BTC when BB squeeze detected"
    const bbSqueeze = l.match(/buy\s+(\w+)\s+when\s+bb\s+squeeze/)
    if (bbSqueeze) rules.push(makeRule(bbSqueeze[1], { type: 'bb_squeeze', threshold: 0.03 }, 'BUY', sizePct, rules.length))

    // "buy BTC near support"
    const nearSup = l.match(/buy\s+(\w+)\s+(?:at|near)\s+support/)
    if (nearSup) rules.push(makeRule(nearSup[1], { type: 'near_support' }, 'BUY', sizePct, rules.length))
  }

  return rules
}

function makeRule(
  symbolRaw: string,
  condition: StrategyCondition,
  action:    'BUY' | 'SELL' | 'HOLD',
  sizePct:   number,
  priority:  number,
): StrategyRule {
  return {
    id:         crypto.randomUUID(),
    symbol:     symbolRaw.toUpperCase(),
    condition,
    action,
    sizePct,
    priority,
    cooldownMs: 3_600_000,   // 1 hour default
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function buildTags(
  token:        CMCToken,
  fg:           FearAndGreed,
  momentum:     number,
  volumeSpike:  number,
  trendingRank: number | undefined,
  tech?:        TechnicalSnapshot,
): SignalTag[] {
  const tags: SignalTag[] = []

  // Session B tags
  if (fg.value <= 20)                     tags.push('extreme_fear')
  if (fg.value >= 80)                     tags.push('extreme_greed')
  if (volumeSpike >= 2.5)                 tags.push('volume_spike')
  if (Math.abs(momentum) >= 50)           tags.push('strong_momentum')
  if (token.change24h <= -15)             tags.push('oversold')
  if (token.change24h >= 15)              tags.push('overbought')
  if (fg.value <= 25 && momentum > 10)    tags.push('dca_zone')
  if (trendingRank != null && trendingRank <= 10) tags.push('trending_cmc')
  if (Math.abs(token.change24h) > 10 &&
      Math.sign(token.change1h) !== Math.sign(token.change24h)) {
    tags.push('reversal_watch')
  }

  // Session J — technical tags
  if (tech) {
    const { momentum: m, volatility: v, volume: vol, regime } = tech
    if (m.rsi14 < 30)              tags.push('rsi_oversold')
    if (m.rsi14 > 70)              tags.push('rsi_overbought')
    if (m.macdCross === 'BULLISH') tags.push('macd_bull_cross')
    if (m.macdCross === 'BEARISH') tags.push('macd_bear_cross')
    if (v.bbWidth < 0.03)          tags.push('bb_squeeze')
    if (v.bbPct > 1.0)             tags.push('bb_breakout_up')
    if (v.bbPct < 0.0)             tags.push('bb_breakout_down')
    if (regime === 'TRENDING_UP')   tags.push('trending_up')
    if (regime === 'TRENDING_DOWN') tags.push('trending_down')
    if (regime === 'RANGING' || regime === 'FLAT') tags.push('ranging')
    if (tech.structure.nearSupport) tags.push('near_support')
    if (tech.structure.nearResist)  tags.push('near_resistance')
  }

  return tags
}

function buildReasoning(
  token:        CMCToken,
  fg:           FearAndGreed,
  momentum:     number,
  volumeSpike:  number,
  dir:          string,
  trendingRank: number | undefined,
  tech?:        TechnicalSnapshot,
): string {
  const parts: string[] = []

  // Session B reasoning (preserved)
  parts.push(`${token.symbol}: ${dir}.`)
  parts.push(`24h ${token.change24h >= 0 ? '+' : ''}${token.change24h.toFixed(2)}%, 1h ${token.change1h >= 0 ? '+' : ''}${token.change1h.toFixed(2)}%.`)
  parts.push(`F&G ${fg.value} (${fg.label}).`)
  if (volumeSpike >= 2)  parts.push(`Volume spike ${volumeSpike.toFixed(1)}x.`)
  if (fg.value <= 25)    parts.push('Extreme fear = contrarian buy window.')
  if (fg.value >= 75)    parts.push('Extreme greed = elevated risk.')
  if (Math.abs(momentum) >= 50) parts.push(`Strong momentum (${momentum.toFixed(0)}).`)
  if (trendingRank != null && trendingRank <= 10) parts.push(`CMC trending #${trendingRank}.`)

  // Session J — technical context
  if (tech) {
    const { momentum: m, volatility: v, regime, regimeConf, adx } = tech
    parts.push(`Regime: ${formatRegime(regime)} (${regimeConf.toFixed(0)}% conf, ADX ${adx.toFixed(0)}).`)
    parts.push(`RSI ${m.rsi14.toFixed(0)}${m.rsi14 < 30 ? ' — oversold' : m.rsi14 > 70 ? ' — overbought' : ''}.`)
    if (m.macdCross !== 'NONE') parts.push(`MACD ${m.macdCross.toLowerCase()} cross.`)
    if (v.bbWidth < 0.03) parts.push('BB squeeze — breakout potential.')
    if (v.bbPct > 1)  parts.push('Price above upper BB band.')
    if (v.bbPct < 0)  parts.push('Price below lower BB band.')
    parts.push(`Tech score: ${tech.summary.overallScore}/100.`)
  }

  return parts.join(' ')
}

function formatRegime(regime: MarketRegime): string {
  switch (regime) {
    case 'TRENDING_UP':   return 'Trending Up'
    case 'TRENDING_DOWN': return 'Trending Down'
    case 'RANGING':       return 'Ranging'
    case 'FLAT':          return 'Flat'
  }
}
