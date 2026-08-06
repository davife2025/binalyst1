'use client'

/**
 * components/tabs/StrategyBuilder.tsx
 * Session K — Adaptive strategy upgrade.
 *
 * Changes from Session C:
 *  - New "BTC Adaptive" and "Mean Reversion" templates added
 *  - RegimePanel component: shows live regime + ADX + mode from adaptiveStrategy
 *  - Technical condition labels added to conditionLabel()
 *  - AdaptiveConfig tab: exposes key sliders for adaptive strategy tuning
 *  - All Session C code preserved — strict superset
 */

import { useState, useEffect } from 'react'
import { useAgentStore }       from '@/lib/agentStore'
import { ALL_ELIGIBLE_SYMBOLS } from '@/lib/twak/client'
import {
  AdaptiveStrategy,
  regimeLabel,
  regimeColor,
  regimeBg,
  modeLabel,
  BTC_ADAPTIVE_TEMPLATE_TEXT,
  DEFAULT_ADAPTIVE_CONFIG,
  type RegimeDecision,
  type AdaptiveStrategyConfig,
} from '@/lib/adaptiveStrategy'
import type { TechnicalSnapshot } from '@/lib/skills/bitget-technicals'

// ─────────────────────────────────────────────────────────────────────────────
// Strategy templates — Session K adds BTC Adaptive and Mean Reversion
// ─────────────────────────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    name: 'BTC Adaptive',
    icon: '🧠',
    desc: 'Auto-switches trend-follow ↔ mean-revert by regime',
    text: BTC_ADAPTIVE_TEMPLATE_TEXT,
    isNew: true,
  },
  {
    name: 'Mean Reversion',
    icon: '↔️',
    desc: 'Buy oversold dips, sell overbought spikes (RSI + BB)',
    text: `Buy ETH with 8% when RSI drops below 32 and BB%B below 20%.
Sell ETH when RSI exceeds 68 and BB%B above 80%.
Buy BTC with 7% near support when RSI is below 35.
Sell BTC near resistance when RSI is above 65.
Hold cash when regime is flat or trending down.`,
    isNew: true,
  },
  {
    name: 'Fear DCA',
    icon: '😨',
    desc: 'Buy during extreme fear, sell into greed',
    text: `Buy ETH with 10% of portfolio when Fear & Greed drops below 25 (extreme fear).
Buy CAKE with 8% when Fear & Greed is below 30 and signal score above 65.
Sell ETH when Fear & Greed exceeds 75 (extreme greed).
Sell CAKE when 24h change exceeds +20%.
Always keep at least 20% in USDT as reserve.`,
    isNew: false,
  },
  {
    name: 'Momentum Rider',
    icon: '🚀',
    desc: 'Chase strong momentum with tight stops',
    text: `Buy AVAX with 12% when signal score exceeds 75 and 24h change is above 5%.
Buy BTC with 10% when CMC trending and signal score above 70.
Sell AVAX when signal score drops below 45.
Sell BTC when 24h change drops below -8%.
Rotate into USDT when Fear & Greed exceeds 80.`,
    isNew: false,
  },
  {
    name: 'Sentiment Rotator',
    icon: '🔄',
    desc: 'Rotate between assets based on sentiment shifts',
    text: `When Fear & Greed is below 35, allocate 15% to ETH and 10% to ADA.
When Fear & Greed is between 50-65, rotate 12% into LINK and DOT.
When Fear & Greed exceeds 70, sell altcoins and move 80% to USDT.
Buy DOGE with 8% when volume spike detected and signal above 68.`,
    isNew: false,
  },
  {
    name: 'Conservative DCA',
    icon: '🛡️',
    desc: 'Small steady positions, low risk, max drawdown protection',
    text: `Buy ETH with 8% every time signal score exceeds 70. Max 2 buys per day.
Buy USDT when drawdown approaches 20% (exit all positions).
Sell ETH when profit exceeds 15% on the position.
Never risk more than 10% per trade.
Hold FDUSD as base currency between trades.`,
    isNew: false,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Condition label — extended with Session J technical conditions
// ─────────────────────────────────────────────────────────────────────────────
const CONDITION_LABELS: Record<string, string> = {
  // Session C
  fear_below:       'Fear & Greed <',
  fear_above:       'Fear & Greed >',
  signal_above:     'Signal score >',
  signal_below:     'Signal score <',
  change24h_above:  '24h change >',
  change24h_below:  '24h change <',
  price_above:      'Price >',
  price_below:      'Price <',
  tag_includes:     'Tag =',
  and:              'AND',
  or:               'OR',
  // Session J — technical
  rsi_above:        'RSI >',
  rsi_below:        'RSI <',
  macd_cross:       'MACD cross',
  macd_hist_above:  'MACD hist >',
  macd_hist_below:  'MACD hist <',
  bb_pct_above:     'BB%B >',
  bb_pct_below:     'BB%B <',
  bb_squeeze:       'BB squeeze',
  bb_breakout:      'BB breakout',
  regime_is:        'Regime =',
  adx_above:        'ADX >',
  adx_below:        'ADX <',
  stoch_cross:      'Stoch cross',
  obv_trend:        'OBV trend',
  ema_cross:        'EMA cross',
  tech_score_above: 'Tech score >',
  tech_score_below: 'Tech score <',
  near_support:     'Near support',
  near_resistance:  'Near resistance',
}

function conditionLabel(cond: any): string {
  if (!cond) return '—'
  if (cond.type === 'and') return `(${conditionLabel(cond.left)} AND ${conditionLabel(cond.right)})`
  if (cond.type === 'or')  return `(${conditionLabel(cond.left)} OR ${conditionLabel(cond.right)})`
  const label = CONDITION_LABELS[cond.type] ?? cond.type
  const val   = cond.value ?? cond.tag ?? cond.direction ?? cond.regime ?? cond.trend ?? cond.cross ?? cond.threshold ?? ''
  return `${label} ${val}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk config
// ─────────────────────────────────────────────────────────────────────────────
const RISK_CONFIG = {
  LOW:    { color: 'var(--green)',  bg: 'rgba(14,203,129,0.1)',  border: 'rgba(14,203,129,0.25)' },
  MEDIUM: { color: 'var(--yellow)', bg: 'rgba(240,185,11,0.1)', border: 'rgba(240,185,11,0.25)' },
  HIGH:   { color: 'var(--red)',    bg: 'rgba(246,70,93,0.1)',  border: 'rgba(246,70,93,0.25)'  },
}

// ─────────────────────────────────────────────────────────────────────────────
// RegimePanel — shows live market regime + adaptive mode indicator
// Loads BTC technicals from the /api/technicals endpoint (Session J)
// ─────────────────────────────────────────────────────────────────────────────
function RegimePanel({ adaptiveCfg }: { adaptiveCfg: AdaptiveStrategyConfig }) {
  const [snap,    setSnap]    = useState<TechnicalSnapshot | null>(null)
  const [decision, setDecision] = useState<RegimeDecision | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res  = await fetch('/api/technicals?symbol=BTC&interval=1h')
        const data = await res.json()
        if (data.snapshot) {
          setSnap(data.snapshot)
          const strategy = new AdaptiveStrategy(adaptiveCfg)
          setDecision(strategy.getDecision(data.snapshot))
        }
      } catch { /* silent */ } finally {
        setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 120_000) // refresh every 2 min
    return () => clearInterval(id)
  }, [adaptiveCfg])

  if (loading) {
    return (
      <div className="rounded-md p-5 flex items-center gap-3"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
        <span className="w-4 h-4 rounded-full border-2 border-yellow-400/30 border-t-yellow-400 animate-spin-slow" />
        <span className="mono text-xs" style={{ color: 'var(--text3)' }}>Loading BTC regime…</span>
      </div>
    )
  }

  if (!snap || !decision) {
    return (
      <div className="rounded-md p-4 mono text-xs" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
        Regime data unavailable — connect Binance API or check network.
      </div>
    )
  }

  const rColor = regimeColor(decision.regime)
  const rBg    = regimeBg(decision.regime)

  return (
    <div className="rounded-md p-5 flex flex-col gap-4"
      style={{ background: 'var(--bg2)', border: `1px solid var(--border)` }}>

      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
          Live BTC Market Regime
        </div>
        <div className="mono text-[10px]" style={{ color: 'var(--text3)' }}>
          Updated {new Date(snap.updatedAt).toLocaleTimeString()}
        </div>
      </div>

      {/* Regime badge + mode */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full"
          style={{ background: rBg, border: `1px solid ${rColor}40` }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: rColor }} />
          <span className="mono text-sm font-bold" style={{ color: rColor }}>
            {regimeLabel(decision.regime)}
          </span>
          <span className="mono text-[10px]" style={{ color: rColor }}>
            {decision.regimeConf.toFixed(0)}%
          </span>
        </div>
        <div className="mono text-xs px-3 py-1.5 rounded-md"
          style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>
          Mode: <span style={{ color: 'var(--yellow)' }}>{modeLabel(decision.mode)}</span>
        </div>
        <div className="mono text-xs" style={{ color: 'var(--text3)' }}>
          ADX <span style={{ color: 'var(--text)' }}>{decision.adx.toFixed(0)}</span>
        </div>
      </div>

      {/* Key indicators row */}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          {
            label: 'RSI 14',
            value: snap.momentum.rsi14.toFixed(0),
            color: snap.momentum.rsi14 < 30 ? 'var(--green)'
                 : snap.momentum.rsi14 > 70 ? 'var(--red)'
                 : 'var(--text)',
          },
          {
            label: 'MACD',
            value: snap.momentum.macdCross !== 'NONE'
              ? snap.momentum.macdCross
              : snap.momentum.macdHist > 0 ? '+' : '−',
            color: snap.momentum.macdHist > 0 ? 'var(--green)' : 'var(--red)',
          },
          {
            label: 'BB %B',
            value: `${(snap.volatility.bbPct * 100).toFixed(0)}%`,
            color: snap.volatility.bbPct > 0.8 ? 'var(--red)'
                 : snap.volatility.bbPct < 0.2 ? 'var(--green)'
                 : 'var(--text)',
          },
          {
            label: 'Tech Score',
            value: `${snap.summary.overallScore}/100`,
            color: snap.summary.overallScore > 65 ? 'var(--green)'
                 : snap.summary.overallScore < 35 ? 'var(--red)'
                 : 'var(--yellow)',
          },
        ].map(item => (
          <div key={item.label} className="rounded-md p-2.5 text-center"
            style={{ background: 'var(--bg3)' }}>
            <div className="mono text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>
              {item.label}
            </div>
            <div className="mono text-sm font-bold" style={{ color: item.color }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Reasoning */}
      <div className="mono text-[10px] leading-relaxed" style={{ color: 'var(--text3)' }}>
        {decision.reasoning}
      </div>

      {/* Active rules count */}
      <div className="mono text-[10px] px-3 py-1.5 rounded-md inline-flex items-center gap-2 self-start"
        style={{ background: 'rgba(240,185,11,0.08)', border: '1px solid rgba(240,185,11,0.15)' }}>
        <span style={{ color: 'var(--yellow)', display:'flex', alignItems:'center' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </span>
        <span style={{ color: 'var(--text2)' }}>
          {decision.rules.length} adaptive rules active for this regime
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function StrategyBuilder() {
  const { strategyText, strategyParsed, setStrategy, agentConfig, setAgentConfig } = useAgentStore()

  const [text,          setText]          = useState(strategyText || '')
  const [parsing,       setParsing]       = useState(false)
  const [result,        setResult]        = useState<any>(null)
  const [error,         setError]         = useState('')
  const [activeTab,     setActiveTab]     = useState<'write' | 'rules' | 'adaptive' | 'config'>('write')
  const [showTokens,    setShowTokens]    = useState(false)
  const [adaptiveCfg,   setAdaptiveCfg]  = useState<AdaptiveStrategyConfig>(DEFAULT_ADAPTIVE_CONFIG)
  const [showRegime,    setShowRegime]    = useState(false)

  // ── Parse strategy ────────────────────────────────────────────────────────
  async function handleParse() {
    if (!text.trim()) { setError('Write a strategy first.'); return }
    setParsing(true); setError(''); setResult(null)
    try {
      const res  = await fetch('/api/agent/strategy', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ strategyText: text }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.error ?? 'Parse failed'); return }
      setResult(data)
      setStrategy(text, data.rules)
      const symbols = [...new Set(data.rules.map((r: any) => r.symbol))] as string[]
      setAgentConfig({ allowedTokens: symbols })
      setActiveTab('rules')
    } catch (e: any) { setError(e.message) }
    setParsing(false)
  }

  function loadTemplate(t: typeof TEMPLATES[0]) {
    setText(t.text)
    setResult(null)
    setActiveTab('write')
    // Auto-show regime panel for adaptive templates
    if (t.name === 'BTC Adaptive' || t.name === 'Mean Reversion') {
      setShowRegime(true)
    }
  }

  function removeRule(id: string) {
    if (!result) return
    const rules = result.rules.filter((r: any) => r.id !== id)
    setResult({ ...result, rules })
    setStrategy(text, rules)
  }

  function patchAdaptive(patch: Partial<AdaptiveStrategyConfig>) {
    setAdaptiveCfg(prev => ({ ...prev, ...patch }))
  }

  const riskCfg = result
    ? RISK_CONFIG[result.riskLevel as keyof typeof RISK_CONFIG] ?? RISK_CONFIG.MEDIUM
    : null

  const TABS = [
    { id: 'write',    label: '✏ Strategy' },
    { id: 'rules',    label: `⚡ Rules${result ? ` (${result.rules?.length ?? 0})` : ''}` },
    { id: 'adaptive', label: '🧠 Adaptive' },
    { id: 'config',   label: '⚙ Config' },
  ] as const

  return (
    <div className="flex-1 overflow-y-auto" style={{background:"var(--bg)"}}>
    <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-extrabold uppercase tracking-tight" style={{ color: 'var(--text)' }}>Strategy <span style={{color:"var(--yellow)"}}>Builder</span></h2>
          <p className="mono text-xs mt-1" style={{ color: 'var(--text3)' }}>
            Write in plain English → AI parses into executable rules · Regime-aware adaptive engine
          </p>
        </div>
        {result && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded"
            style={{ background: riskCfg!.bg, border: `1px solid ${riskCfg!.border}` }}>
            <span className="mono text-[10px] font-bold" style={{ color: riskCfg!.color }}>
              {result.riskLevel} RISK
            </span>
          </div>
        )}
      </div>

      {/* Templates */}
      <div>
        <div className="mono text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--text3)' }}>
          Strategy Templates
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {TEMPLATES.map(t => (
            <button key={t.name} onClick={() => loadTemplate(t)}
              className="flex items-start gap-3 px-4 py-3 rounded-md text-left transition-all relative"
              style={{ background: 'var(--bg2)', border: `1px solid ${t.isNew ? 'rgba(240,185,11,0.3)' : 'var(--border)'}` }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--yellow)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = t.isNew ? 'rgba(240,185,11,0.3)' : 'var(--border)')}>
              {t.isNew && (
                <span className="absolute top-2 right-2 mono text-[8px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background: 'rgba(240,185,11,0.15)', color: 'var(--yellow)' }}>
                  NEW
                </span>
              )}
              <span className="text-xl shrink-0">{t.icon}</span>
              <div>
                <div className="text-xs font-bold" style={{ color: 'var(--text)' }}>{t.name}</div>
                <div className="mono text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>{t.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b pb-0" style={{ borderColor: 'var(--border)' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className="mono text-xs px-4 py-2 rounded-t-lg transition-all"
            style={{
              background:   activeTab === tab.id ? 'var(--bg2)' : 'transparent',
              color:        activeTab === tab.id ? 'var(--yellow)' : 'var(--text3)',
              borderBottom: activeTab === tab.id ? '2px solid var(--yellow)' : '2px solid transparent',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Write ────────────────────────────────────────────────────────── */}
      {activeTab === 'write' && (
        <div className="flex flex-col gap-4">

          {/* Live regime panel toggle */}
          <div className="flex items-center justify-between">
            <span className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
              Live Regime Overlay
            </span>
            <button onClick={() => setShowRegime(v => !v)}
              className="mono text-[10px] px-3 py-1 rounded-md transition-all"
              style={{
                background: showRegime ? 'rgba(240,185,11,0.1)' : 'var(--bg2)',
                border: '1px solid var(--border)',
                color: showRegime ? 'var(--yellow)' : 'var(--text3)',
              }}>
              {showRegime ? '▲ Hide' : '▼ Show BTC Regime'}
            </button>
          </div>
          {showRegime && <RegimePanel adaptiveCfg={adaptiveCfg} />}

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
                Strategy (plain English)
              </label>
              <span className="mono text-[9px]" style={{ color: 'var(--text3)' }}>
                {text.length} chars
              </span>
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={10}
              placeholder={`Describe your strategy in plain English. Examples:\n\nBuy BTC with 10% when RSI drops below 32 and regime is trending up.\nSell BTC when MACD crosses bearish.\nBuy ETH with 8% when Fear & Greed drops below 25.\nSell ETH when signal score drops below 40.`}
              className="mono text-sm px-4 py-3 rounded-md outline-none resize-none leading-relaxed"
              style={{
                background: 'var(--bg2)',
                border:     '1px solid var(--border2)',
                color:      'var(--text)',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
            />
          </div>

          {/* Technical condition cheatsheet */}
          <div className="rounded-md p-4" style={{ background: 'rgba(240,185,11,0.04)', border: '1px solid rgba(240,185,11,0.12)' }}>
            <div className="mono text-[10px] font-bold mb-2" style={{ color: 'var(--yellow)' }}>
              Technical Condition Phrases (Session J)
            </div>
            <div className="grid gap-y-1 gap-x-4 mono text-[10px]" style={{ gridTemplateColumns: '1fr 1fr', color: 'var(--text3)' }}>
              {[
                ['RSI below 32',            'rsi_below condition'],
                ['RSI above 68',            'rsi_above condition'],
                ['MACD crosses bullish',    'macd_cross BULLISH'],
                ['MACD crosses bearish',    'macd_cross BEARISH'],
                ['BB squeeze detected',     'bb_squeeze < 0.03'],
                ['regime is trending up',   'regime_is TRENDING_UP'],
                ['regime is ranging',       'regime_is RANGING'],
                ['near support',            'near_support flag'],
              ].map(([phrase, desc]) => (
                <div key={phrase} className="flex gap-2">
                  <span style={{ color: 'var(--text2)' }}>"{phrase}"</span>
                  <span>→ {desc}</span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={handleParse} disabled={parsing || !text.trim()}
            className="py-3 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-all"
            style={{
              background: parsing || !text.trim() ? 'var(--bg4)' : 'var(--yellow)',
              color:      parsing || !text.trim() ? 'var(--text3)' : '#000',
              cursor:     parsing || !text.trim() ? 'not-allowed' : 'pointer',
            }}>
            {parsing && (
              <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin-slow" />
            )}
            {parsing ? 'Parsing with AI...' : '⚡ Parse Strategy → Rules'}
          </button>
        </div>
      )}

      {/* ── Tab: Rules ────────────────────────────────────────────────────────── */}
      {activeTab === 'rules' && (
        <div className="flex flex-col gap-4">
          {!result ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3"
              style={{ background: 'var(--bg2)', border: '1px dashed var(--border)', borderRadius: 12 }}>
              <div style={{width:32,height:32,borderRadius:6,background:"rgba(240,185,11,.08)",border:"1px solid rgba(240,185,11,.15)",opacity:.6,margin:"0 auto"}}></div>
              <div className="mono text-xs" style={{ color: 'var(--text3)' }}>
                Write a strategy and click Parse to generate rules
              </div>
              <button onClick={() => setActiveTab('write')}
                className="mono text-xs px-4 py-2 rounded-md"
                style={{ background: 'var(--yellow)', color: '#000' }}>
                ← Write Strategy
              </button>
            </div>
          ) : (
            <>
              {result.summary && (
                <div className="rounded-md p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                  <div className="mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>
                    Strategy Summary
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>{result.summary}</p>
                </div>
              )}

              {result.warnings?.length > 0 && (
                <div className="rounded-md p-4"
                  style={{ background: 'rgba(240,185,11,0.06)', border: '1px solid rgba(240,185,11,0.2)' }}>
                  <div className="mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--yellow)' }}>Warnings</div>
                  {result.warnings.map((w: string, i: number) => (
                    <div key={i} className="mono text-xs" style={{ color: 'var(--text2)' }}>⚠ {w}</div>
                  ))}
                </div>
              )}

              <div className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
                Parsed Rules ({result.rules?.length ?? 0})
              </div>

              <div className="flex flex-col gap-2">
                {(result.rules ?? []).map((rule: any, i: number) => {
                  // Detect if this is a technical rule for the badge
                  const isTech = rule.condition &&
                    ['rsi_above','rsi_below','macd_cross','bb_pct_above','bb_pct_below',
                     'regime_is','adx_above','adx_below','bb_squeeze','ema_cross',
                     'tech_score_above','near_support','near_resistance'].some(
                       t => JSON.stringify(rule.condition).includes(t)
                     )
                  return (
                    <div key={rule.id ?? i} className="rounded-md p-4 flex items-start gap-3"
                      style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                      <div className="w-6 h-6 rounded flex items-center justify-center mono text-[10px] font-bold shrink-0 mt-0.5"
                        style={{ background: 'var(--bg4)', color: 'var(--text3)' }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="mono text-xs font-extrabold" style={{ color: 'var(--text)' }}>
                            {rule.symbol}
                          </span>
                          <span className="mono text-[10px] px-2 py-0.5 rounded font-bold"
                            style={{
                              background: rule.action === 'BUY' ? 'rgba(14,203,129,0.15)' : 'rgba(246,70,93,0.15)',
                              color:      rule.action === 'BUY' ? 'var(--green)' : 'var(--red)',
                            }}>
                            {rule.action}
                          </span>
                          <span className="mono text-[10px]" style={{ color: 'var(--yellow)' }}>
                            {rule.sizePct}% portfolio
                          </span>
                          {isTech && (
                            <span className="mono text-[9px] px-2 py-0.5 rounded"
                              style={{ background: 'rgba(240,185,11,0.1)', color: 'var(--yellow)', border: '1px solid rgba(240,185,11,0.2)' }}>
                              📊 Technical
                            </span>
                          )}
                          <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>
                            cooldown {rule.cooldownMs >= 3600000
                              ? `${(rule.cooldownMs / 3600000).toFixed(0)}h`
                              : `${(rule.cooldownMs / 60000).toFixed(0)}m`}
                          </span>
                        </div>
                        <div className="mono text-[10px] px-2 py-1 rounded mb-1"
                          style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>
                          WHEN: {conditionLabel(rule.condition)}
                        </div>
                        {rule.reasoning && (
                          <div className="mono text-[10px] leading-snug" style={{ color: 'var(--text3)' }}>
                            {rule.reasoning}
                          </div>
                        )}
                      </div>
                      <button onClick={() => removeRule(rule.id)}
                        className="mono text-sm px-2 rounded shrink-0"
                        style={{ color: 'var(--text3)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}>
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
              <button onClick={() => setActiveTab('config')}
                className="py-2.5 rounded-md mono text-sm font-bold"
                style={{ background: 'var(--yellow)', color: '#000' }}>
                Save & Configure Agent →
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Adaptive ─────────────────────────────────────────────────────── */}
      {activeTab === 'adaptive' && (
        <div className="flex flex-col gap-4">
          <div className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
            Adaptive Strategy Configuration
          </div>

          {/* Live regime */}
          <RegimePanel adaptiveCfg={adaptiveCfg} />

          {/* Sliders */}
          <div className="rounded-md p-5 flex flex-col gap-5"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
              Tune Strategy Parameters
            </div>
            <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {[
                {
                  label: 'Trend Entry Size %',
                  key:   'trendSizePct' as const,
                  min: 3, max: 25, step: 1,
                  hint: 'Portfolio % per trend-follow entry',
                  warn: adaptiveCfg.trendSizePct >= 20,
                },
                {
                  label: 'Mean-Rev Entry Size %',
                  key:   'mrSizePct' as const,
                  min: 2, max: 20, step: 1,
                  hint: 'Portfolio % per mean-reversion entry',
                  warn: adaptiveCfg.mrSizePct >= 18,
                },
                {
                  label: 'RSI Buy Level',
                  key:   'mrRsiBuyLevel' as const,
                  min: 20, max: 45, step: 1,
                  hint: 'Mean-rev BUY fires when RSI below this',
                  warn: false,
                },
                {
                  label: 'RSI Sell Level',
                  key:   'mrRsiSellLevel' as const,
                  min: 55, max: 80, step: 1,
                  hint: 'Mean-rev SELL fires when RSI above this',
                  warn: false,
                },
                {
                  label: 'Trend ADX Min',
                  key:   'trendAdxMin' as const,
                  min: 15, max: 40, step: 1,
                  hint: 'Min ADX to consider market trending',
                  warn: false,
                },
              ].map(({ label, key, min, max, step, hint, warn }) => (
                <div key={key} className="flex flex-col gap-2">
                  <div className="flex justify-between">
                    <label className="mono text-[10px] uppercase tracking-widest"
                      style={{ color: warn ? 'var(--yellow)' : 'var(--text3)' }}>
                      {label}
                    </label>
                    <span className="mono text-xs font-bold"
                      style={{ color: warn ? 'var(--yellow)' : 'var(--text)' }}>
                      {adaptiveCfg[key]}
                    </span>
                  </div>
                  <input
                    type="range" min={min} max={max} step={step}
                    value={adaptiveCfg[key]}
                    onChange={e => patchAdaptive({ [key]: parseFloat(e.target.value) })}
                    className="w-full"
                    style={{ accentColor: 'var(--yellow)' }}
                  />
                  <div className="mono text-[9px]" style={{ color: 'var(--text3)' }}>{hint}</div>
                </div>
              ))}
            </div>

            {/* MACD confirm toggle */}
            <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div>
                <div className="mono text-xs font-semibold" style={{ color: 'var(--text)' }}>
                  Require MACD Confirmation
                </div>
                <div className="mono text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
                  Trend entries only fire when MACD histogram confirms direction
                </div>
              </div>
              <button
                onClick={() => patchAdaptive({ requireMacdConfirm: !adaptiveCfg.requireMacdConfirm })}
                className="w-12 h-6 rounded-full relative transition-all shrink-0"
                style={{ background: adaptiveCfg.requireMacdConfirm ? 'var(--green)' : 'var(--bg4)' }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                  style={{
                    background: adaptiveCfg.requireMacdConfirm ? '#000' : 'var(--text3)',
                    left: adaptiveCfg.requireMacdConfirm ? '26px' : '2px',
                  }} />
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              setText(BTC_ADAPTIVE_TEMPLATE_TEXT)
              setActiveTab('write')
            }}
            className="py-2.5 rounded-md mono text-sm font-bold"
            style={{ background: 'var(--yellow)', color: '#000' }}>
            Load BTC Adaptive Template →
          </button>
        </div>
      )}

      {/* ── Tab: Config (Session C — unchanged) ─────────────────────────────── */}
      {activeTab === 'config' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-md p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="mono text-[10px] uppercase tracking-widest mb-4" style={{ color: 'var(--text3)' }}>
              Guardrail Configuration
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {[
                {
                  label: 'Max Drawdown %',   key: 'maxDrawdownPct',
                  min: 5, max: 29, step: 1,
                  warn: agentConfig.maxDrawdownPct >= 25,
                  hint: 'Moderate risk: keep below 20%. Aggressive: up to 25%.',
                },
                {
                  label: 'Max Per-Trade %',  key: 'maxPerTradePct',
                  min: 3, max: 25, step: 1,
                  warn: agentConfig.maxPerTradePct >= 20,
                  hint: 'Max % of portfolio per single trade.',
                },
                {
                  label: 'Max Daily Trades', key: 'maxDailyTrades',
                  min: 1, max: 20, step: 1,
                  warn: false,
                  hint: 'Minimum 1/day required to qualify.',
                },
                {
                  label: 'Slippage %',       key: 'slippagePct',
                  min: 0.1, max: 5, step: 0.1,
                  warn: agentConfig.slippagePct >= 3,
                  hint: 'Max allowed price impact per swap.',
                },
              ].map(({ label, key, min, max, step, warn, hint }) => (
                <div key={key} className="flex flex-col gap-2">
                  <div className="flex justify-between">
                    <label className="mono text-[10px] uppercase tracking-widest"
                      style={{ color: warn ? 'var(--yellow)' : 'var(--text3)' }}>
                      {label}
                    </label>
                    <span className="mono text-xs font-bold"
                      style={{ color: warn ? 'var(--yellow)' : 'var(--text)' }}>
                      {agentConfig[key as keyof typeof agentConfig]}
                      {key.includes('Pct') ? '%' : ''}
                    </span>
                  </div>
                  <input
                    type="range" min={min} max={max} step={step}
                    value={agentConfig[key as keyof typeof agentConfig] as number}
                    onChange={e => setAgentConfig({ [key]: parseFloat(e.target.value) })}
                    className="w-full"
                    style={{ accentColor: 'var(--yellow)' }}
                  />
                  <div className="mono text-[9px]" style={{ color: 'var(--text3)' }}>{hint}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Dry run toggle */}
          <div className="rounded-md p-5 flex items-center justify-between"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Dry Run Mode</div>
              <div className="mono text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
                Simulate trades without executing on-chain.
              </div>
            </div>
            <button
              onClick={() => setAgentConfig({ dryRun: !agentConfig.dryRun })}
              className="w-12 h-6 rounded-full relative transition-all shrink-0"
              style={{ background: agentConfig.dryRun ? 'var(--green)' : 'var(--red)' }}>
              <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                style={{ background: '#000', left: agentConfig.dryRun ? '2px' : '26px' }} />
            </button>
          </div>

          {/* Autonomous mode toggle */}
          <div className="rounded-md p-5 flex items-center justify-between"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Autonomous Mode</div>
              <div className="mono text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
                Agent evaluates rules and signs transactions automatically every 2 minutes.
              </div>
            </div>
            <button
              onClick={() => setAgentConfig({ autonomousMode: !agentConfig.autonomousMode })}
              className="w-12 h-6 rounded-full relative transition-all shrink-0"
              style={{ background: agentConfig.autonomousMode ? 'var(--yellow)' : 'var(--bg4)' }}>
              <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                style={{
                  background: agentConfig.autonomousMode ? '#000' : 'var(--text3)',
                  left: agentConfig.autonomousMode ? '26px' : '2px',
                }} />
            </button>
          </div>

          {!agentConfig.dryRun && agentConfig.autonomousMode && (
            <div className="rounded-md p-4"
              style={{ background: 'rgba(246,70,93,0.08)', border: '1px solid rgba(246,70,93,0.25)' }}>
              <div className="mono text-xs font-bold" style={{ color: 'var(--red)' }}>
                ⚠ LIVE AUTONOMOUS MODE ENABLED
              </div>
              <div className="mono text-[10px] mt-1" style={{ color: 'var(--text2)' }}>
                The agent will sign and execute real on-chain transactions without confirmation.
                Ensure guardrails are correct and you have sufficient funds for gas.
              </div>
            </div>
          )}

          <button
            onClick={() => {
              if (strategyParsed.length > 0) {
                alert('✓ Strategy and config saved. Go to the Live Agent tab to start the agent.')
              }
            }}
            className="py-3 rounded-md text-sm font-bold"
            style={{ background: 'var(--yellow)', color: '#000' }}>
            ✓ Save Configuration
          </button>
        </div>
      )}
    </div>
  </div>
  )
}