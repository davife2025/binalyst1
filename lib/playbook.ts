/**
 * lib/playbook.ts
 * Session N — Bitget Playbook export
 *
 * Converts Binalyst StrategyRule[] + BacktestResult into the JSON format
 * required by Bitget Playbook / getagent-skill for upload and publishing.
 *
 * Reference: https://www.npmjs.com/package/@bitget-ai/getagent-skill
 *
 * Usage:
 *   const playbook = buildPlaybook({ rules, result, config })
 *   const json     = exportPlaybookJson(playbook)
 *   // POST json to Bitget Playbook API or download as .json file
 */

import type { StrategyRule, StrategyCondition } from './signalEngine'
import type { BacktestResult }                   from './backtester'
import type { AdaptiveStrategyConfig }           from './adaptiveStrategy'

// ─────────────────────────────────────────────────────────────────────────────
// Bitget Playbook schema types
// ─────────────────────────────────────────────────────────────────────────────

export interface PlaybookMeta {
  name:        string
  description: string
  author:      string
  version:     string
  createdAt:   string
  tags:        string[]
  symbol:      string   // e.g. 'BTCUSDT'
  interval:    string   // e.g. '1h'
}

export interface PlaybookIndicator {
  name:   string
  params: Record<string, number | string>
}

export interface PlaybookCondition {
  indicator: string
  operator:  '>' | '<' | '>=' | '<=' | '==' | 'cross_above' | 'cross_below'
  value:     number | string
  logic?:    'AND' | 'OR'
}

export interface PlaybookSignal {
  name:       string
  side:       'buy' | 'sell'
  conditions: PlaybookCondition[]
  sizePct:    number
  cooldownMs: number
}

export interface PlaybookRiskConfig {
  maxDrawdownPct:  number
  maxPerTradePct:  number
  maxDailyTrades:  number
  slippagePct:     number
  stopLossPct?:    number
  takeProfitPct?:  number
}

export interface PlaybookBacktestSummary {
  symbol:        string
  interval:      string
  lookbackDays:  number
  totalReturn:   number
  sharpeRatio:   number
  maxDrawdown:   number
  winRate:       number
  totalTrades:   number
  profitFactor:  number
}

export interface BitgetPlaybook {
  schema:    '1.0'
  meta:      PlaybookMeta
  indicators: PlaybookIndicator[]
  signals:   PlaybookSignal[]
  risk:      PlaybookRiskConfig
  backtest?: PlaybookBacktestSummary
  rawRules?: StrategyRule[]   // Binalyst-native rules for round-trip fidelity
}

// ─────────────────────────────────────────────────────────────────────────────
// Condition converter — maps StrategyCondition → PlaybookCondition[]
// ─────────────────────────────────────────────────────────────────────────────

function flattenCondition(
  cond:  StrategyCondition,
  logic: 'AND' | 'OR' = 'AND',
): PlaybookCondition[] {
  const out: PlaybookCondition[] = []

  switch (cond.type) {
    case 'and':
      out.push(...flattenCondition(cond.left,  'AND'))
      out.push(...flattenCondition(cond.right, 'AND'))
      break
    case 'or':
      out.push(...flattenCondition(cond.left,  'OR'))
      out.push(...flattenCondition(cond.right, 'OR'))
      break

    // ── Technical conditions ─────────────────────────────────────────────
    case 'rsi_above':
      out.push({ indicator: 'RSI', operator: '>',  value: cond.value, logic })
      break
    case 'rsi_below':
      out.push({ indicator: 'RSI', operator: '<',  value: cond.value, logic })
      break
    case 'macd_cross':
      out.push({
        indicator: 'MACD',
        operator:  cond.direction === 'BULLISH' ? 'cross_above' : 'cross_below',
        value:     0,
        logic,
      })
      break
    case 'macd_hist_above':
      out.push({ indicator: 'MACD_HIST', operator: '>',  value: cond.value, logic })
      break
    case 'macd_hist_below':
      out.push({ indicator: 'MACD_HIST', operator: '<',  value: cond.value, logic })
      break
    case 'bb_pct_above':
      out.push({ indicator: 'BB_PCT', operator: '>',  value: cond.value, logic })
      break
    case 'bb_pct_below':
      out.push({ indicator: 'BB_PCT', operator: '<',  value: cond.value, logic })
      break
    case 'bb_squeeze':
      out.push({ indicator: 'BB_WIDTH', operator: '<', value: cond.threshold, logic })
      break
    case 'bb_breakout':
      out.push({ indicator: 'BB_PCT',   operator: '>', value: 1.0, logic })
      break
    case 'adx_above':
      out.push({ indicator: 'ADX', operator: '>',  value: cond.value, logic })
      break
    case 'adx_below':
      out.push({ indicator: 'ADX', operator: '<',  value: cond.value, logic })
      break
    case 'ema_cross':
      out.push({
        indicator: 'EMA_CROSS',
        operator:  cond.cross === 'BULLISH' ? 'cross_above' : 'cross_below',
        value:     0,
        logic,
      })
      break
    case 'regime_is':
      out.push({ indicator: 'REGIME', operator: '==', value: cond.regime, logic })
      break
    case 'obv_trend':
      out.push({ indicator: 'OBV_TREND', operator: '==', value: cond.trend, logic })
      break
    case 'tech_score_above':
      out.push({ indicator: 'TECH_SCORE', operator: '>',  value: cond.value, logic })
      break
    case 'tech_score_below':
      out.push({ indicator: 'TECH_SCORE', operator: '<',  value: cond.value, logic })
      break
    case 'near_support':
      out.push({ indicator: 'NEAR_SUPPORT', operator: '==', value: 1, logic })
      break
    case 'near_resistance':
      out.push({ indicator: 'NEAR_RESISTANCE', operator: '==', value: 1, logic })
      break

    // ── Sentiment conditions ─────────────────────────────────────────────
    case 'fear_below':
      out.push({ indicator: 'FEAR_GREED', operator: '<', value: cond.value, logic })
      break
    case 'fear_above':
      out.push({ indicator: 'FEAR_GREED', operator: '>', value: cond.value, logic })
      break
    case 'signal_above':
      out.push({ indicator: 'SIGNAL_SCORE', operator: '>', value: cond.value, logic })
      break
    case 'signal_below':
      out.push({ indicator: 'SIGNAL_SCORE', operator: '<', value: cond.value, logic })
      break
    case 'change24h_above':
      out.push({ indicator: 'CHANGE_24H', operator: '>', value: cond.value, logic })
      break
    case 'change24h_below':
      out.push({ indicator: 'CHANGE_24H', operator: '<', value: cond.value, logic })
      break
    case 'price_above':
      out.push({ indicator: 'PRICE', operator: '>', value: cond.value, logic })
      break
    case 'price_below':
      out.push({ indicator: 'PRICE', operator: '<', value: cond.value, logic })
      break
    case 'tag_includes':
      out.push({ indicator: 'TAG', operator: '==', value: cond.tag, logic })
      break

    default:
      break
  }

  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Detect which indicators are used — for the indicators[] section
// ─────────────────────────────────────────────────────────────────────────────

function detectIndicators(rules: StrategyRule[]): PlaybookIndicator[] {
  const used = new Set<string>()

  function walk(cond: StrategyCondition) {
    switch (cond.type) {
      case 'and': case 'or': walk(cond.left); walk(cond.right); break
      case 'rsi_above':    case 'rsi_below':     used.add('RSI');         break
      case 'macd_cross':   case 'macd_hist_above': case 'macd_hist_below': used.add('MACD'); break
      case 'bb_pct_above': case 'bb_pct_below': case 'bb_squeeze': case 'bb_breakout': used.add('BB'); break
      case 'adx_above':    case 'adx_below':     used.add('ADX');         break
      case 'ema_cross':                           used.add('EMA');         break
      case 'stoch_cross':                         used.add('STOCH');       break
      case 'obv_trend':                           used.add('OBV');         break
      case 'tech_score_above': case 'tech_score_below': used.add('TECH_SCORE'); break
      case 'regime_is':                           used.add('REGIME');      break
      default: break
    }
  }

  for (const rule of rules) walk(rule.condition)

  const defaults: Record<string, PlaybookIndicator> = {
    RSI:        { name: 'RSI',         params: { period: 14 }           },
    MACD:       { name: 'MACD',        params: { fast: 12, slow: 26, signal: 9 } },
    BB:         { name: 'BOLL',        params: { period: 20, mult: 2 }  },
    ADX:        { name: 'ADX',         params: { period: 14 }           },
    EMA:        { name: 'EMA',         params: { period20: 20, period50: 50, period200: 200 } },
    STOCH:      { name: 'KDJ',         params: { k: 14, d: 3 }          },
    OBV:        { name: 'OBV',         params: {}                        },
    TECH_SCORE: { name: 'TECH_SCORE',  params: {}                        },
    REGIME:     { name: 'REGIME',      params: { adxMin: 25 }            },
  }

  return Array.from(used).map(k => defaults[k]).filter(Boolean)
}

// ─────────────────────────────────────────────────────────────────────────────
// Main builder
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildPlaybookOptions {
  rules:         StrategyRule[]
  result?:       BacktestResult
  riskConfig?:   Partial<PlaybookRiskConfig>
  adaptiveCfg?:  Partial<AdaptiveStrategyConfig>
  name?:         string
  description?:  string
  author?:       string
  symbol?:       string
  interval?:     string
}

export function buildPlaybook({
  rules,
  result,
  riskConfig,
  adaptiveCfg,
  name        = 'Binalyst BTC Adaptive Strategy',
  description = 'Regime-aware adaptive strategy: trend-follow when trending, mean-revert when ranging, hold cash when flat.',
  author      = 'Binalyst Agent',
  symbol      = 'BTCUSDT',
  interval    = '1h',
}: BuildPlaybookOptions): BitgetPlaybook {

  const signals: PlaybookSignal[] = rules
    .filter(r => r.action !== 'HOLD')
    .map(r => ({
      name:       `${r.symbol} ${r.action} — Rule ${r.id.slice(0, 8)}`,
      side:       r.action.toLowerCase() as 'buy' | 'sell',
      conditions: flattenCondition(r.condition),
      sizePct:    r.sizePct,
      cooldownMs: r.cooldownMs,
    }))

  const risk: PlaybookRiskConfig = {
    maxDrawdownPct: riskConfig?.maxDrawdownPct  ?? 25,
    maxPerTradePct: riskConfig?.maxPerTradePct  ?? adaptiveCfg?.trendSizePct ?? 12,
    maxDailyTrades: riskConfig?.maxDailyTrades  ?? 10,
    slippagePct:    riskConfig?.slippagePct     ?? 1.0,
  }

  const backtest: PlaybookBacktestSummary | undefined = result
    ? {
        symbol:       result.symbol,
        interval:     result.interval,
        lookbackDays: Math.round((result.endTime - result.startTime) / 86_400_000),
        totalReturn:  result.totalReturn,
        sharpeRatio:  result.sharpeRatio,
        maxDrawdown:  result.maxDrawdown,
        winRate:      result.winRate,
        totalTrades:  result.totalTrades,
        profitFactor: result.profitFactor,
      }
    : undefined

  return {
    schema:     '1.0',
    meta: {
      name,
      description,
      author,
      version:   '1.0.0',
      createdAt: new Date().toISOString(),
      tags:      ['adaptive', 'regime', 'technical', 'binalyst', 'btc'],
      symbol,
      interval,
    },
    indicators: detectIndicators(rules),
    signals,
    risk,
    backtest,
    rawRules:   rules,
  }
}

export function exportPlaybookJson(playbook: BitgetPlaybook): string {
  return JSON.stringify(playbook, null, 2)
}

export function downloadPlaybook(playbook: BitgetPlaybook, filename = 'binalyst-playbook.json') {
  const blob = new Blob([exportPlaybookJson(playbook)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
