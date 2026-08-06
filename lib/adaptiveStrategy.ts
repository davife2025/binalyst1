/**
 * lib/adaptiveStrategy.ts
 * Session K — Adaptive Strategy Engine
 *
 * Implements the BTC adaptive trend + mean-reversion strategy from the
 * hackathon brief.  The engine operates in three modes depending on
 * the market regime detected by lib/skills/bitget-technicals.ts:
 *
 *   TRENDING_UP / TRENDING_DOWN  → Trend-following logic
 *     Buy breakouts, ride momentum, trail stops via ATR
 *
 *   RANGING                      → Mean-reversion logic
 *     Buy oversold bounces (RSI < 35, near lower BB),
 *     sell overbought spikes (RSI > 65, near upper BB)
 *
 *   FLAT                         → Stay flat / hold cash
 *     No new entries; let existing positions run with tight exits
 *
 * This engine sits ABOVE the existing AgentLoop — it generates
 * StrategyRule[] objects that are fed into the existing evaluateRules()
 * pipeline unchanged.  Nothing in agentLoop.ts needs to change.
 *
 * Usage:
 *   import { AdaptiveStrategy } from '@/lib/adaptiveStrategy'
 *   const strategy = new AdaptiveStrategy()
 *   const rules    = strategy.getRulesForSnapshot(techSnap, symbol, portfolioPct)
 */

import type { TechnicalSnapshot, MarketRegime } from './skills/bitget-technicals'
import type { StrategyRule, StrategyCondition }  from './signalEngine'

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface AdaptiveStrategyConfig {
  /** % of portfolio per trend-follow entry (default 12) */
  trendSizePct:     number
  /** % of portfolio per mean-reversion entry (default 8) */
  mrSizePct:        number
  /** RSI threshold below which mean-reversion BUY fires (default 35) */
  mrRsiBuyLevel:    number
  /** RSI threshold above which mean-reversion SELL fires (default 65) */
  mrRsiSellLevel:   number
  /** Min ADX to consider a market trending (default 25) */
  trendAdxMin:      number
  /** BB %B threshold for mean-reversion buy (default 0.2 = near lower band) */
  mrBbBuyPct:       number
  /** BB %B threshold for mean-reversion sell (default 0.8 = near upper band) */
  mrBbSellPct:      number
  /** Cooldown between same-rule fires, ms (default 1h) */
  cooldownMs:       number
  /** Require MACD confirmation for trend entries (default true) */
  requireMacdConfirm: boolean
}

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveStrategyConfig = {
  trendSizePct:       12,
  mrSizePct:           8,
  mrRsiBuyLevel:      35,
  mrRsiSellLevel:     65,
  trendAdxMin:        25,
  mrBbBuyPct:        0.2,
  mrBbSellPct:       0.8,
  cooldownMs:    3_600_000,
  requireMacdConfirm: true,
}

// ─────────────────────────────────────────────────────────────────────────────
// Regime Decision — human-readable explanation of what the engine is doing
// ─────────────────────────────────────────────────────────────────────────────

export interface RegimeDecision {
  regime:      MarketRegime
  regimeConf:  number
  adx:         number
  mode:        'TREND_FOLLOW' | 'MEAN_REVERT' | 'FLAT'
  reasoning:   string
  rules:       StrategyRule[]
}

// ─────────────────────────────────────────────────────────────────────────────
// AdaptiveStrategy class
// ─────────────────────────────────────────────────────────────────────────────

export class AdaptiveStrategy {
  private config: AdaptiveStrategyConfig

  constructor(config: Partial<AdaptiveStrategyConfig> = {}) {
    this.config = { ...DEFAULT_ADAPTIVE_CONFIG, ...config }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Given a TechnicalSnapshot, return a set of StrategyRules appropriate
   * for the current market regime.  These rules plug directly into
   * evaluateRules() in signalEngine.ts.
   */
  getDecision(snap: TechnicalSnapshot): RegimeDecision {
    const { regime, regimeConf, adx } = snap

    switch (regime) {
      case 'TRENDING_UP':
        return this.trendFollowDecision(snap, 'UP')
      case 'TRENDING_DOWN':
        return this.trendFollowDecision(snap, 'DOWN')
      case 'RANGING':
        return this.meanReversionDecision(snap)
      case 'FLAT':
      default:
        return this.flatDecision(snap)
    }
  }

  /** Update config at runtime (e.g. from StrategyBuilder UI sliders) */
  updateConfig(patch: Partial<AdaptiveStrategyConfig>) {
    this.config = { ...this.config, ...patch }
  }

  getConfig(): AdaptiveStrategyConfig {
    return { ...this.config }
  }

  // ── Trend-following logic ──────────────────────────────────────────────────

  private trendFollowDecision(
    snap:      TechnicalSnapshot,
    direction: 'UP' | 'DOWN',
  ): RegimeDecision {
    const { config } = this
    const sym        = snap.symbol
    const rules: StrategyRule[] = []

    const isUp = direction === 'UP'

    // ── Entry condition ────────────────────────────────────────────────────
    // Trend-follow entry: EMA cross confirms direction + optional MACD confirm
    let entryCondition: StrategyCondition = {
      type:  'ema_cross',
      cross: isUp ? 'BULLISH' : 'BEARISH',
    }

    if (config.requireMacdConfirm) {
      entryCondition = {
        type:  'and',
        left:  entryCondition,
        right: {
          type:      'macd_hist_above',
          value:     isUp ? 0 : -Infinity as number,
          ...(isUp ? {} : { type: 'macd_hist_below' as const, value: 0 }),
        } as StrategyCondition,
      }
    }

    // Also require ADX > threshold to confirm trend strength
    entryCondition = {
      type:  'and',
      left:  entryCondition,
      right: { type: 'adx_above', value: config.trendAdxMin },
    }

    rules.push({
      id:         `tf-entry-${sym}-${direction}`,
      symbol:     sym,
      condition:  entryCondition,
      action:     isUp ? 'BUY' : 'SELL',
      sizePct:    config.trendSizePct,
      priority:   10,
      cooldownMs: config.cooldownMs,
    })

    // ── Regime-based exit ──────────────────────────────────────────────────
    // Exit when the regime flips: regime_is RANGING or opposite trend
    rules.push({
      id:         `tf-exit-${sym}-${direction}`,
      symbol:     sym,
      condition:  {
        type: 'or',
        left: { type: 'regime_is', regime: 'RANGING' },
        right: {
          type: 'regime_is',
          regime: isUp ? 'TRENDING_DOWN' : 'TRENDING_UP',
        },
      },
      action:    isUp ? 'SELL' : 'BUY',
      sizePct:   config.trendSizePct,
      priority:  9,
      cooldownMs: config.cooldownMs,
    })

    // ── Momentum fading exit ───────────────────────────────────────────────
    // If ADX starts collapsing below 20, trend is exhausting
    rules.push({
      id:         `tf-adx-exit-${sym}-${direction}`,
      symbol:     sym,
      condition:  { type: 'adx_below', value: 20 },
      action:     isUp ? 'SELL' : 'BUY',
      sizePct:    Math.round(config.trendSizePct / 2),
      priority:   8,
      cooldownMs: config.cooldownMs * 2,
    })

    const reasoning = isUp
      ? `Trending up (ADX ${snap.adx.toFixed(0)}, conf ${snap.regimeConf.toFixed(0)}%). ` +
        `EMA stack: ${snap.trend.emaCross}. MACD hist: ${snap.momentum.macdHist.toFixed(4)}. ` +
        `Trend-follow: buy breakouts, exit on regime flip or ADX collapse.`
      : `Trending down (ADX ${snap.adx.toFixed(0)}, conf ${snap.regimeConf.toFixed(0)}%). ` +
        `EMA stack: ${snap.trend.emaCross}. MACD hist: ${snap.momentum.macdHist.toFixed(4)}. ` +
        `Trend-follow: short/sell rallies, exit on regime flip or ADX collapse.`

    return {
      regime:     snap.regime,
      regimeConf: snap.regimeConf,
      adx:        snap.adx,
      mode:       'TREND_FOLLOW',
      reasoning,
      rules,
    }
  }

  // ── Mean-reversion logic ───────────────────────────────────────────────────

  private meanReversionDecision(snap: TechnicalSnapshot): RegimeDecision {
    const { config } = this
    const sym        = snap.symbol
    const rules: StrategyRule[] = []

    // ── Buy oversold ────────────────────────────────────────────────────────
    // RSI < mrRsiBuyLevel AND price near lower BB
    rules.push({
      id:     `mr-buy-${sym}`,
      symbol: sym,
      condition: {
        type: 'and',
        left: { type: 'rsi_below', value: config.mrRsiBuyLevel },
        right: { type: 'bb_pct_below', value: config.mrBbBuyPct },
      },
      action:     'BUY',
      sizePct:    config.mrSizePct,
      priority:   10,
      cooldownMs: config.cooldownMs,
    })

    // ── Sell overbought ─────────────────────────────────────────────────────
    // RSI > mrRsiSellLevel AND price near upper BB
    rules.push({
      id:     `mr-sell-${sym}`,
      symbol: sym,
      condition: {
        type: 'and',
        left: { type: 'rsi_above', value: config.mrRsiSellLevel },
        right: { type: 'bb_pct_above', value: config.mrBbSellPct },
      },
      action:     'SELL',
      sizePct:    config.mrSizePct,
      priority:   10,
      cooldownMs: config.cooldownMs,
    })

    // ── Buy near support ────────────────────────────────────────────────────
    rules.push({
      id:         `mr-support-buy-${sym}`,
      symbol:     sym,
      condition:  { type: 'near_support' },
      action:     'BUY',
      sizePct:    Math.round(config.mrSizePct * 0.6),
      priority:   7,
      cooldownMs: config.cooldownMs * 4,
    })

    // ── Exit if regime shifts to trending ──────────────────────────────────
    rules.push({
      id:     `mr-trend-exit-${sym}`,
      symbol: sym,
      condition: {
        type: 'or',
        left:  { type: 'regime_is', regime: 'TRENDING_UP'   },
        right: { type: 'regime_is', regime: 'TRENDING_DOWN' },
      },
      action:     'SELL',
      sizePct:    config.mrSizePct,
      priority:   9,
      cooldownMs: config.cooldownMs,
    })

    const reasoning =
      `Ranging market (ADX ${snap.adx.toFixed(0)}, conf ${snap.regimeConf.toFixed(0)}%). ` +
      `RSI ${snap.momentum.rsi14.toFixed(0)}, BB%B ${(snap.volatility.bbPct * 100).toFixed(0)}%. ` +
      `Mean-reversion: buy oversold dips (RSI<${config.mrRsiBuyLevel}, BB<${config.mrBbBuyPct*100}%), ` +
      `sell overbought spikes (RSI>${config.mrRsiSellLevel}, BB>${config.mrBbSellPct*100}%).`

    return {
      regime:     snap.regime,
      regimeConf: snap.regimeConf,
      adx:        snap.adx,
      mode:       'MEAN_REVERT',
      reasoning,
      rules,
    }
  }

  // ── Flat / no-trade logic ──────────────────────────────────────────────────

  private flatDecision(snap: TechnicalSnapshot): RegimeDecision {
    const { config } = this
    const sym        = snap.symbol

    // In flat regime generate one very conservative buy rule
    // (to satisfy the competition's min-1-trade-per-day requirement)
    // only fires on an extreme fear + oversold combination
    const rules: StrategyRule[] = [
      {
        id:     `flat-dca-${sym}`,
        symbol: sym,
        condition: {
          type: 'and',
          left:  { type: 'rsi_below',    value: 30 },
          right: { type: 'tech_score_above', value: 55 },
        },
        action:     'BUY',
        sizePct:    Math.round(config.mrSizePct * 0.5),
        priority:   1,
        cooldownMs: config.cooldownMs * 24,   // once per day max
      },
    ]

    const reasoning =
      `Flat market (ADX ${snap.adx.toFixed(0)}, ATR% ${snap.volatility.atrPct.toFixed(2)}%). ` +
      `Low volatility — holding cash. Only opening a position on extreme oversold conditions.`

    return {
      regime:     snap.regime,
      regimeConf: snap.regimeConf,
      adx:        snap.adx,
      mode:       'FLAT',
      reasoning,
      rules,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BTC Adaptive Strategy — pre-configured instance for the hackathon brief
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The named "BTC adaptive trend + mean-reversion strategy" from the brief.
 * Slightly more conservative sizePct than defaults to protect drawdown budget.
 */
export const btcAdaptiveStrategy = new AdaptiveStrategy({
  trendSizePct:       10,
  mrSizePct:           7,
  mrRsiBuyLevel:      32,
  mrRsiSellLevel:     68,
  trendAdxMin:        25,
  mrBbBuyPct:        0.15,
  mrBbSellPct:       0.85,
  cooldownMs:    3_600_000,
  requireMacdConfirm: true,
})

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — formatting for UI display
// ─────────────────────────────────────────────────────────────────────────────

export function regimeLabel(regime: MarketRegime): string {
  switch (regime) {
    case 'TRENDING_UP':   return 'Trending Up'
    case 'TRENDING_DOWN': return 'Trending Down'
    case 'RANGING':       return 'Ranging'
    case 'FLAT':          return 'Flat'
  }
}

export function regimeColor(regime: MarketRegime): string {
  switch (regime) {
    case 'TRENDING_UP':   return 'var(--green)'
    case 'TRENDING_DOWN': return 'var(--red)'
    case 'RANGING':       return 'var(--yellow)'
    case 'FLAT':          return 'var(--text3)'
  }
}

export function regimeBg(regime: MarketRegime): string {
  switch (regime) {
    case 'TRENDING_UP':   return 'rgba(14,203,129,0.12)'
    case 'TRENDING_DOWN': return 'rgba(246,70,93,0.12)'
    case 'RANGING':       return 'rgba(240,185,11,0.12)'
    case 'FLAT':          return 'rgba(255,255,255,0.05)'
  }
}

export function modeLabel(mode: RegimeDecision['mode']): string {
  switch (mode) {
    case 'TREND_FOLLOW': return 'Trend Following'
    case 'MEAN_REVERT':  return 'Mean Reversion'
    case 'FLAT':         return 'Flat — Hold Cash'
  }
}

/**
 * Natural-language template text for the adaptive BTC strategy.
 * Loaded into StrategyBuilder as the "BTC Adaptive" template.
 */
export const BTC_ADAPTIVE_TEMPLATE_TEXT =
`BTC Adaptive Strategy — switches mode based on market regime.

When BTC is trending up (ADX > 25, EMA bullish): buy BTC with 10% when MACD crosses bullish and regime is trending up. Sell when regime changes to ranging or trending down.

When BTC is ranging (ADX < 25): buy BTC with 7% when RSI drops below 32 and BB%B below 15%. Sell BTC when RSI exceeds 68 and BB%B above 85%.

When BTC is flat: hold cash, only buy BTC with 4% if RSI drops below 30 (max once per day).

Never risk more than 12% per trade. Stay flat when ADX below 15.`
