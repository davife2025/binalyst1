'use client'

/**
 * components/tabs/DashboardTab.tsx — UI Refresh
 * Binalyst v2 — autonomous trading platform.
 * Pure UI changes only — all hooks, store, and data logic preserved exactly.
 */

import { useStore }        from '@/lib/store'
import { useAgentStore }   from '@/lib/agentStore'
import { useFearAndGreed } from '@/hooks/useSignals'
import { FearGreedMini }   from '@/components/agent/FearGreedGauge'
import { DrawdownBar }     from '@/components/agent/DrawdownGauge'
import { PnLSparkline }    from '@/components/agent/PnLChart'
import { usePortfolio }    from '@/hooks/usePortfolio'

// ── SVG icon helpers (inline, no dependency) ──────────────────────────────────
function Icon({ d, size = 16, stroke = 'currentColor', fill = 'none', viewBox = '0 0 24 24', children }: {
  d?: string; size?: number; stroke?: string; fill?: string; viewBox?: string; children?: any
}) {
  return (
    <svg width={size} height={size} viewBox={viewBox} fill={fill} stroke={stroke}
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {d ? <path d={d} /> : children}
    </svg>
  )
}

const QA_ITEMS = [
  { tab: 'signals',     label: 'Live Signals',     desc: 'CMC F&G + signal scoring',   iconColor: '#3498db',
    icon: <><circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4"/><path d="M17.7 6.3a8 8 0 0 1 0 11.4"/></> },
  { tab: 'strategy',    label: 'Strategy Builder', desc: 'Write & parse your strategy', iconColor: '#F0B90B',
    icon: <><path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16"/></> },
  { tab: 'backtest',    label: 'Backtest',         desc: 'Run on historical data',      iconColor: '#0ECB81',
    icon: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/> },
  { tab: 'chat',        label: 'AI Assistant',     desc: 'Ask anything about markets',  iconColor: '#9b59b6',
    icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/> },
  { tab: 'markets',     label: 'Live Markets',     desc: 'Prices, charts, order book',  iconColor: '#0ECB81',
    icon: <><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></> },
]

const PILLARS = [
  {
    title: 'CMC Intelligence', color: '#3498db',
    desc: 'Fear & Greed index, signal scoring across 149 eligible tokens, trending analysis, x402 pay-per-request data.',
    icon: <><circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4"/><path d="M17.7 6.3a8 8 0 0 1 0 11.4"/><path d="M3.5 3.5a14 14 0 0 0 0 17"/><path d="M20.5 3.5a14 14 0 0 1 0 17"/></>,
  },
  {
    title: 'Autonomous Agent', color: '#F0B90B',
    desc: 'Strategy rules evaluated every 2 minutes. Self-custodial TWAK signing. Guardrails: drawdown cap, daily minimums, eligible-only trades.',
    icon: <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/><path d="M7 9h2l2 2 2-4 2 2h2"/></>,
  },
  {
    title: 'Multi-Chain Ready', color: '#0ECB81',
    desc: 'GOAT Network, Celo, Mantle, Sui, X Layer and more. On-chain proof of every trade. Registered agent identity across networks.',
    icon: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>,
  },
]

const STATUS_CONFIG = {
  idle:         { color: 'var(--text3)',  label: 'Idle',         dot: false },
  running:      { color: '#0ECB81',       label: 'Live',         dot: true  },
  paused:       { color: '#F0B90B',       label: 'Paused',       dot: false },
  error:        { color: '#F6465D',       label: 'Error',        dot: false },
  disqualified: { color: '#F6465D',       label: 'Disqualified', dot: false },
}

// ── GOAT Network logo (SVG) ──────────────────────────────────────────────────────
function BNBLogo({ size = 14, fill = '#000' }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <path d="M12 1.5L14.5 4 12 6.5 9.5 4Z"/>
      <path d="M16.5 6L19 8.5 16.5 11 14 8.5Z"/>
      <path d="M7.5 6L10 8.5 7.5 11 5 8.5Z"/>
      <path d="M12 9L17 13.5 12 18 7 13.5Z"/>
      <path d="M19.5 11L22 13.5 19.5 16 17 13.5Z"/>
      <path d="M4.5 11L7 13.5 4.5 16 2 13.5Z"/>
      <path d="M12 20.5L14.5 18 17 20.5 12 23 7 20.5 9.5 18Z"/>
    </svg>
  )
}

export default function DashboardTab() {
  const { setActiveTab, isConnected } = useStore()
  const {
    session, isWalletLoaded, agentAddress,
    strategyParsed, trades, agentConfig,
  } = useAgentStore()

  const network      = (useAgentStore() as any).network ?? 'testnet'
  const { data: fg } = useFearAndGreed()
  const { snapshot, history } = usePortfolio()

  const agentStatus = session?.status ?? 'idle'
  const statusCfg   = STATUS_CONFIG[agentStatus as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.idle
  const pnlPct      = session?.startValueUSDT && session.startValueUSDT > 0
    ? (((session.currentValueUSDT - session.startValueUSDT) / session.startValueUSDT) * 100) : 0
  const pnlColor    = pnlPct >= 0 ? '#0ECB81' : '#F6465D'
  const drawdownPct = session?.drawdownPct ?? 0
  const totalTrades = session?.totalTrades ?? 0
  const liveTrades  = trades.filter((t: any) => !t.dryRun && t.txHash)

  const steps = [
    { label: 'Wallet Connected',  done: isWalletLoaded,              tab: 'agent-wallet' },
    { label: 'Strategy Defined',  done: strategyParsed.length > 0,   tab: 'strategy'     },
    { label: 'Connect Wallet',    done: isWalletLoaded ?? false, tab: 'agent-wallet' },
    { label: 'Start Agent',       done: agentStatus === 'running',   tab: 'live-agent'   },
  ]
  const setupPct = Math.round((steps.filter(s => s.done).length / steps.length) * 100)
  const allSetUp = steps.every(s => s.done)
  const nextStep = steps.find(s => !s.done)

  // ── Chain context (only relevant when agent is active) ────────────────────
  const agentChain = network === 'mainnet' ? 'GOAT Mainnet' : 'GOAT Testnet3'

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: '#000', position: 'relative' }}>

      {/* Grid overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: `linear-gradient(rgba(240,185,11,.04) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(240,185,11,.04) 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
      }} />

      {/* Dot clusters */}
      <div style={{ position: 'fixed', top: 24, right: 180, pointerEvents: 'none', zIndex: 0,
        display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5 }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(240,185,11,.3)', display: 'block' }} />
        ))}
      </div>
      <div style={{ position: 'fixed', bottom: 100, left: 70, pointerEvents: 'none', zIndex: 0,
        display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5 }}>
        {Array.from({ length: 16 }).map((_, i) => (
          <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(240,185,11,.25)', display: 'block' }} />
        ))}
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col gap-5" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── TOPBAR ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-extrabold uppercase tracking-tight leading-none"
              style={{ fontSize: 28, color: '#fff', letterSpacing: '-.02em' }}>
              Binal<span style={{ color: '#F0B90B' }}>yst</span>
            </h1>
            <p className="mono uppercase tracking-widest mt-1"
              style={{ fontSize: 8, color: 'rgba(255,255,255,.28)', letterSpacing: '.12em' }}>
              AI-Powered Quantitative Trading
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {agentStatus === 'running' && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded"
                style={{ background: 'rgba(14,203,129,.06)', border: '1px solid rgba(14,203,129,.22)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#0ECB81', animation: 'blink 1.5s infinite' }} />
                <span className="mono font-bold uppercase tracking-wider" style={{ fontSize: 9, color: '#0ECB81' }}>
                  Agent Live
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── HERO STAT CARDS ──────────────────────────────────────────────── */}
        <div className="grid gap-3" style={{ gridTemplateColumns: '1.35fr 1fr 1fr 1fr' }}>

          {/* Yellow hero card */}
          <div className="rounded-md p-4 flex flex-col justify-between relative overflow-hidden"
            style={{ background: '#F0B90B', minHeight: 104 }}>
            <div style={{ position: 'absolute', bottom: -18, right: -18, width: 80, height: 80, borderRadius: '50%', border: '14px solid rgba(0,0,0,.09)' }} />
            <div className="mono uppercase tracking-widest font-bold" style={{ fontSize: 8, color: 'rgba(0,0,0,.45)' }}>
              Portfolio Value
            </div>
            <div className="font-extrabold leading-none" style={{ fontSize: 28, color: '#000' }}>
              {snapshot ? '$' + snapshot.totalUSD.toFixed(0)
                : session  ? '$' + (session.currentValueUSDT ?? 0).toFixed(0)
                : '—'}
            </div>
            <div className="mono font-semibold" style={{ fontSize: 8, color: 'rgba(0,0,0,.45)' }}>
              {isWalletLoaded ? 'Live on-chain' : 'Connect wallet'}
            </div>
          </div>

          {/* Return */}
          <div className="rounded-md p-4 flex flex-col justify-between cursor-pointer"
            style={{ background: '#0F0F0F', border: '1px solid rgba(240,185,11,.12)', minHeight: 104 }}
            onClick={() => setActiveTab('performance')}>
            <div className="mono uppercase tracking-widest font-bold" style={{ fontSize: 8, color: 'rgba(255,255,255,.22)' }}>Total Return</div>
            <div className="font-extrabold leading-none" style={{ fontSize: 24, color: pnlColor }}>
              {session ? (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%' : '—'}
            </div>
            <span className="mono font-bold inline-flex items-center gap-1"
              style={{ fontSize: 8, color: '#0ECB81', background: 'rgba(14,203,129,.1)', border: '1px solid rgba(14,203,129,.18)', padding: '2px 7px', borderRadius: 3 }}>
              ↑ from ${session?.startValueUSDT?.toFixed(0) ?? '10,000'}
            </span>
          </div>

          {/* Drawdown */}
          <div className="rounded-md p-4 flex flex-col justify-between cursor-pointer"
            style={{ background: '#0F0F0F', border: '1px solid rgba(240,185,11,.12)', minHeight: 104 }}
            onClick={() => setActiveTab('live-agent')}>
            <div className="mono uppercase tracking-widest font-bold" style={{ fontSize: 8, color: 'rgba(255,255,255,.22)' }}>Drawdown</div>
            <div className="font-extrabold leading-none" style={{ fontSize: 24, color: drawdownPct >= 24 ? '#F0B90B' : '#0ECB81' }}>
              {session ? drawdownPct.toFixed(1) + '%' : '—'}
            </div>
            <span className="mono font-bold inline-flex items-center gap-1"
              style={{ fontSize: 8, color: '#0ECB81', background: 'rgba(14,203,129,.1)', border: '1px solid rgba(14,203,129,.18)', padding: '2px 7px', borderRadius: 3 }}>
              {drawdownPct >= 28 ? 'WARNING' : drawdownPct >= 24 ? 'CAUTION' : 'SAFE'} · cap 30%
            </span>
          </div>

          {/* Trades */}
          <div className="rounded-md p-4 flex flex-col justify-between cursor-pointer"
            style={{ background: '#0F0F0F', border: '1px solid rgba(240,185,11,.12)', minHeight: 104 }}
            onClick={() => setActiveTab('live-agent')}>
            <div className="mono uppercase tracking-widest font-bold" style={{ fontSize: 8, color: 'rgba(255,255,255,.22)' }}>Total Trades</div>
            <div className="font-extrabold leading-none" style={{ fontSize: 24, color: '#fff' }}>
              {totalTrades}
            </div>
            {totalTrades >= 7 && (
              <span className="mono font-bold inline-flex items-center gap-1"
                style={{ fontSize: 8, color: '#0ECB81', background: 'rgba(14,203,129,.1)', border: '1px solid rgba(14,203,129,.18)', padding: '2px 7px', borderRadius: 3 }}>
                ✓ Qualified · {liveTrades.length} on-chain
              </span>
            )}
            {totalTrades < 7 && (
              <span className="mono font-bold" style={{ fontSize: 8, color: 'rgba(255,255,255,.25)' }}>
                {liveTrades.length} live on-chain
              </span>
            )}
          </div>
        </div>

        {/* ── SETUP PROGRESS (hidden once complete) ────────────────────────── */}
        {!allSetUp && (
          <div className="rounded-md p-4" style={{ background: '#0F0F0F', border: '1px solid rgba(240,185,11,.12)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="mono uppercase tracking-widest font-bold" style={{ fontSize: 8, color: 'rgba(255,255,255,.22)' }}>
                Setup Progress
              </span>
              <span className="mono font-extrabold uppercase tracking-wider" style={{ fontSize: 9, color: '#F0B90B' }}>
                {setupPct}% Complete
              </span>
            </div>
            <div className="h-px mb-4 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.07)' }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${setupPct}%`, background: '#F0B90B' }} />
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
              {steps.map(step => (
                <button key={step.label} onClick={() => setActiveTab(step.tab as any)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-left"
                  style={{
                    background: step.done ? 'rgba(14,203,129,.04)' : 'transparent',
                    border: `1px solid ${step.done ? 'rgba(14,203,129,.15)' : 'rgba(255,255,255,.06)'}`,
                  }}>
                  <span className="w-4 h-4 rounded-full flex items-center justify-center font-bold shrink-0"
                    style={{ fontSize: 8, background: step.done ? 'rgba(14,203,129,.18)' : 'rgba(255,255,255,.05)',
                      color: step.done ? '#0ECB81' : 'rgba(255,255,255,.18)' }}>
                    {step.done ? '✓' : '○'}
                  </span>
                  <span className="mono font-semibold uppercase tracking-wide"
                    style={{ fontSize: 7, color: step.done ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.18)' }}>
                    {step.label}
                  </span>
                  {!step.done && <span className="ml-auto mono" style={{ fontSize: 8, color: '#F0B90B' }}>→</span>}
                </button>
              ))}
            </div>
            {nextStep && (
              <button onClick={() => setActiveTab(nextStep.tab as any)}
                className="w-full mt-3 py-2 rounded font-extrabold uppercase tracking-wider"
                style={{ background: '#F0B90B', color: '#000', fontSize: 10 }}>
                Next: {nextStep.label} →
              </button>
            )}
          </div>
        )}

        {/* ── MIDDLE ROW: F&G + PnL + Agent Status ─────────────────────────── */}
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1.7fr 1fr' }}>

          {/* Fear & Greed */}
          <div className="rounded-md p-4 flex flex-col gap-3"
            style={{ background: '#0F0F0F', border: '1px solid rgba(240,185,11,.12)' }}>
            <div className="mono uppercase tracking-widest font-bold" style={{ fontSize: 8, color: 'rgba(255,255,255,.22)' }}>
              CMC Fear & Greed
            </div>
            {fg ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="font-extrabold leading-none" style={{ fontSize: 40, color: '#F0B90B' }}>
                    {Math.round(fg.value)}
                  </span>
                  <span className="mono font-bold uppercase tracking-wider" style={{ fontSize: 10, color: '#F0B90B' }}>
                    {fg.label}
                  </span>
                </div>
                {/* Gradient bar */}
                <div>
                  <div className="rounded-sm relative" style={{ height: 5, background: 'linear-gradient(to right,#F6465D,#e67e22,#F0B90B,#0ECB81,#1abc9c)' }}>
                    <span style={{ position: 'absolute', top: -4, left: `${fg.value}%`, transform: 'translateX(-50%)',
                      width: 2, height: 13, background: '#fff', borderRadius: 1, display: 'block' }} />
                  </div>
                  <div className="flex justify-between mono mt-1" style={{ fontSize: 7, color: 'rgba(255,255,255,.2)' }}>
                    <span>Fear</span><span>Neutral</span><span>Greed</span>
                  </div>
                </div>
                <p className="mono leading-relaxed" style={{ fontSize: 7, color: 'rgba(255,255,255,.28)' }}>
                  {fg.value <= 25 && 'Extreme fear — contrarian buy window.'}
                  {fg.value > 25 && fg.value <= 44 && 'Fear — elevated caution, watch for reversals.'}
                  {fg.value > 44 && fg.value <= 55 && 'Neutral — no strong directional bias.'}
                  {fg.value > 55 && fg.value <= 74 && 'Greed — market optimistic, manage risk.'}
                  {fg.value > 74 && 'Extreme greed — elevated correction risk.'}
                </p>
                <button onClick={() => setActiveTab('signals')}
                  className="mono uppercase tracking-wider font-bold py-1.5 rounded w-full"
                  style={{ fontSize: 7, background: 'transparent', border: '1px solid rgba(240,185,11,.18)', color: 'rgba(240,185,11,.5)' }}>
                  View all signals →
                </button>
              </>
            ) : (
              <div className="flex items-center justify-center h-16 mono" style={{ fontSize: 10, color: 'rgba(255,255,255,.2)' }}>
                Loading...
              </div>
            )}
          </div>

          {/* PnL sparkline */}
          <div className="rounded-md p-4 flex flex-col gap-3"
            style={{ background: '#0F0F0F', border: '1px solid rgba(240,185,11,.12)' }}>
            <div className="flex items-center justify-between">
              <span className="mono uppercase tracking-widest font-bold" style={{ fontSize: 8, color: 'rgba(255,255,255,.22)' }}>
                Agent PnL
              </span>
              {session && (
                <span className="font-extrabold" style={{ fontSize: 14, color: pnlColor }}>
                  {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                </span>
              )}
            </div>
            {history.length >= 2 ? (
              <PnLSparkline history={history} />
            ) : (
              <div className="flex items-center justify-center py-6 mono" style={{ fontSize: 10, color: 'rgba(255,255,255,.2)' }}>
                {session ? 'Collecting hourly data...' : 'Start agent to track PnL'}
              </div>
            )}
            {session && <DrawdownBar drawdownPct={drawdownPct} />}
            <button onClick={() => setActiveTab('live-agent')}
              className="mono uppercase tracking-wider font-bold py-1.5 rounded w-full"
              style={{ fontSize: 7, background: 'transparent', border: '1px solid rgba(240,185,11,.18)', color: 'rgba(240,185,11,.5)' }}>
              Open competition dashboard →
            </button>
          </div>

          {/* Agent status — GOAT Network badge shown here because agent runs on it */}
          <div className="rounded-md p-4 flex flex-col gap-3"
            style={{ background: '#0F0F0F', border: '1px solid rgba(240,185,11,.12)' }}>
            <div className="mono uppercase tracking-widest font-bold" style={{ fontSize: 8, color: 'rgba(255,255,255,.22)' }}>
              Agent Status
            </div>

            {/* Live status pill */}
            <div className="flex items-center gap-2 px-3 py-2 rounded"
              style={{
                background: agentStatus === 'running' ? 'rgba(14,203,129,.06)' : 'rgba(255,255,255,.03)',
                border: `1px solid ${agentStatus === 'running' ? 'rgba(14,203,129,.18)' : 'rgba(255,255,255,.06)'}`,
              }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{
                background: statusCfg.color,
                animation: statusCfg.dot ? 'blink 1.5s infinite' : 'none',
              }} />
              <span className="mono font-bold uppercase tracking-wider" style={{ fontSize: 9, color: statusCfg.color }}>
                {statusCfg.label}
              </span>
            </div>

            {/* Chain badge — only when agent tab is active context */}
            {(isWalletLoaded || agentStatus === 'running') && (
              <div className="flex items-center gap-2 px-3 py-2 rounded"
                style={{ background: 'rgba(240,185,11,.05)', border: '1px solid rgba(240,185,11,.18)' }}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: '#F0B90B' }}>
                  <BNBLogo size={12} fill="#000" />
                </div>
                <div>
                  <div className="mono font-bold uppercase tracking-wider" style={{ fontSize: 9, color: '#F0B90B' }}>
                    GOAT Network
                  </div>
                  <div className="mono" style={{ fontSize: 7, color: 'rgba(255,255,255,.28)' }}>{agentChain}</div>
                </div>
                {agentStatus === 'running' && (
                  <div className="ml-auto flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#0ECB81', animation: 'blink 1.5s infinite' }} />
                    <span className="mono font-bold" style={{ fontSize: 7, color: '#0ECB81' }}>LIVE</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {[
                { label: 'Wallet',   value: isWalletLoaded ? agentAddress.slice(0, 8) + '…' : 'Not connected', ok: isWalletLoaded },
                { label: 'Strategy', value: strategyParsed.length > 0 ? `${strategyParsed.length} rules` : 'None defined', ok: strategyParsed.length > 0 },
                { label: 'Mode',     value: agentConfig.dryRun ? 'Dry Run' : 'Live', ok: !agentConfig.dryRun },
                { label: 'Trades',   value: `${totalTrades} / 7 min`, ok: totalTrades >= 7 },
              ].map(({ label, value, ok }) => (
                <div key={label} className="flex justify-between">
                  <span className="mono uppercase tracking-wider" style={{ fontSize: 8, color: 'rgba(255,255,255,.22)' }}>{label}</span>
                  <span className="mono font-bold" style={{ fontSize: 8, color: ok ? '#0ECB81' : 'rgba(255,255,255,.45)' }}>{value}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setActiveTab('live-agent')}
              className="mono uppercase tracking-wider font-extrabold py-2 rounded w-full"
              style={{ background: '#F0B90B', color: '#000', fontSize: 9, border: 'none' }}>
              {agentStatus === 'running' ? 'View Live Agent →' : 'View Live Agent →'}
            </button>
          </div>
        </div>

        {/* ── QUICK ACTIONS ─────────────────────────────────────────────────── */}
        <div>
          <div className="mono uppercase tracking-widest font-bold mb-3" style={{ fontSize: 8, color: 'rgba(255,255,255,.22)' }}>
            Quick Actions
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            {QA_ITEMS.map(({ tab, label, desc, iconColor, icon }) => (
              <button key={tab} onClick={() => setActiveTab(tab as any)}
                className="flex items-center gap-3 px-3 py-2.5 rounded text-left transition-all"
                style={{ background: '#0F0F0F', border: '1px solid rgba(240,185,11,.1)' }}
                onMouseEnter={(e: any) => (e.currentTarget.style.borderColor = '#F0B90B')}
                onMouseLeave={(e: any) => (e.currentTarget.style.borderColor = 'rgba(240,185,11,.1)')}>
                <div className="w-8 h-8 rounded flex items-center justify-center shrink-0"
                  style={{ background: iconColor + '18', color: iconColor }}>
                  <Icon size={16} stroke={iconColor}>{icon}</Icon>
                </div>
                <div className="min-w-0">
                  <div className="font-bold uppercase tracking-wide" style={{ fontSize: 9, color: '#fff' }}>{label}</div>
                  <div className="mono" style={{ fontSize: 7, color: 'rgba(255,255,255,.28)', marginTop: 2 }}>{desc}</div>
                </div>
                <span className="ml-auto mono" style={{ fontSize: 10, color: 'rgba(240,185,11,.35)' }}>→</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── PLATFORM PILLARS ──────────────────────────────────────────────── */}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          {PILLARS.map(({ title, color, desc, icon }) => (
            <div key={title} className="rounded-md p-4 relative overflow-hidden"
              style={{ background: '#0F0F0F', border: '1px solid rgba(240,185,11,.1)' }}>
              {/* top accent line */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: '#F0B90B', opacity: .35 }} />
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                  style={{ background: color + '18' }}>
                  <Icon size={13} stroke={color}>{icon}</Icon>
                </div>
                <span className="font-extrabold uppercase tracking-wide" style={{ fontSize: 10, color }}>{title}</span>
              </div>
              <p className="mono leading-relaxed" style={{ fontSize: 7, color: 'rgba(255,255,255,.28)' }}>{desc}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
