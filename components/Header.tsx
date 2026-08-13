'use client'

/**
 * components/Header.tsx — Session I
 * Updated branding to reflect BNB Chain AI Trading Platform.
 * Adds live competition badge when agent is running on mainnet.
 * Preserves all existing tab titles and indicator logic.
 */

import { useStore }      from '@/lib/store'
import { useAgentStore } from '@/lib/agentStore'
import { useGoatStore }  from '@/lib/goat/store'
import KeeperHubStatusPanel from '@/components/agent/KeeperHubStatusPanel'

const TAB_TITLES: Record<string, { title: string; sub: string; pillar?: string }> = {
  // Core
  chat:      { title: 'AI Assistant',        sub: 'Powered by Claude + live Binance data',      pillar: 'TOOLS' },
  markets:   { title: 'Live Markets',        sub: 'Real-time prices & analysis',                pillar: 'BINANCE' },
  events:    { title: 'Events Radar',        sub: 'Listings, airdrops, launchpool & more',      pillar: 'BINANCE' },
  learn:     { title: 'Crypto Academy',      sub: 'Learn Binance products & trading',           pillar: 'TOOLS' },
  portfolio: { title: 'My Portfolio',        sub: 'Holdings, P&L & AI advisor',                pillar: 'BINANCE' },
  trading:   { title: 'Trading',             sub: 'Place and manage Binance orders',            pillar: 'BINANCE' },
  alerts:    { title: 'Price Alerts',        sub: 'Browser push notifications on price targets', pillar: 'BINANCE' },
  agent:     { title: 'Rules Agent',         sub: 'Simple rules engine · checks every 2 min',  pillar: 'AGENT' },
  web3:      { title: 'Web3 Intelligence',   sub: 'On-chain analytics · Binance Skills Hub',   pillar: 'INTELLIGENCE' },
  settings:  { title: 'Settings',            sub: 'API keys, preferences & auto-trade',        pillar: 'TOOLS' },
  square:    { title: 'Binance Square',      sub: 'Post & engage with the community',          pillar: 'TOOLS' },
  messaging: { title: 'Messaging',           sub: 'Telegram & WhatsApp bot integration',       pillar: 'TOOLS' },
  // Agent tabs
  'agent-wallet': { title: 'Agent Wallet',  sub: 'Self-custodial BSC wallet · TWAK local signing', pillar: 'AGENT' },
  signals:        { title: 'CMC Signals',   sub: 'Fear & Greed · signal scoring · market intelligence', pillar: 'INTELLIGENCE' },
  strategy:       { title: 'Strategy Builder', sub: 'Natural language → AI-parsed trading rules',  pillar: 'AGENT' },
  competition:    { title: 'Competition',   sub: 'Live PnL · drawdown gauge · BSC trade log',    pillar: 'AGENT' },
  performance:    { title: 'Performance',   sub: 'Live portfolio · hourly PnL · price alerts',   pillar: 'AGENT' },
  submission:     { title: 'Submission',    sub: 'Dorahacks writeup · evidence export',          pillar: 'AGENT' },
  // GOAT / KeeperHub tabs
  onboarding:     { title: 'Onboarding',    sub: 'GOAT Network · KeeperHub execution setup',     pillar: 'AGENT' },
  'live-agent':   { title: 'Live Agent',    sub: 'GOAT Network · KeeperHub execution · Uniswap V3', pillar: 'AGENT' },
  'wallet':       { title: 'Agent Wallet',  sub: 'GOAT Network · self-custodial · KeeperHub-executed sends', pillar: 'AGENT' },
  'goat-identity':{ title: 'GOAT Identity', sub: 'ERC-8004 on-chain agent identity',             pillar: 'AGENT' },
  'risk-profile': { title: 'Risk Profile',  sub: 'Position sizing, drawdown & trade limits',     pillar: 'AGENT' },
  backtest:       { title: 'Backtest',      sub: 'Run your strategy against historical data',    pillar: 'AGENT' },
}

const PILLAR_COLORS: Record<string, string> = {
  INTELLIGENCE: '#3498db',
  AGENT:        'var(--yellow)',
  BINANCE:      'var(--green)',
  TOOLS:        'var(--text3)',
}

// Tabs whose wallet/network pill should reflect the GOAT store + KeeperHub,
// not the BSC agent store.
const GOAT_TABS = new Set(['onboarding', 'live-agent', 'wallet', 'goat-identity'])

export default function Header() {
  const { activeTab, isConnected, autoTradeEnabled } = useStore()
  const { session, isWalletLoaded } = useAgentStore()
  const network   = (useAgentStore() as any).network ?? 'testnet'

  const goat = useGoatStore()
  const isGoatTab = GOAT_TABS.has(activeTab)

  const meta      = TAB_TITLES[activeTab] ?? TAB_TITLES.chat
  const isLive    = session?.status === 'running' && network === 'mainnet'
  const pillarColor = meta.pillar ? PILLAR_COLORS[meta.pillar] : 'var(--text3)'

  return (
    <header
      className="flex items-center justify-between px-6 h-16 shrink-0 border-b"
      style={{
        background:     'rgba(11,14,17,0.9)',
        backdropFilter: 'blur(12px)',
        borderColor:    'var(--border)',
      }}>

      {/* Left: title + breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        {meta.pillar && (
          <span className="mono text-[9px] font-bold px-2 py-1 rounded hidden sm:block"
            style={{ background: `${pillarColor}15`, color: pillarColor, border: `1px solid ${pillarColor}30` }}>
            {meta.pillar}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-base font-extrabold leading-tight truncate" style={{ color: 'var(--text)' }}>
            {meta.title}
          </h1>
          <p className="mono text-[10px] mt-0.5 truncate" style={{ color: 'var(--text3)' }}>
            {meta.sub}
          </p>
        </div>
      </div>

      {/* Right: status indicators */}
      <div className="flex items-center gap-2 shrink-0 ml-4">

        {/* Live competition badge */}
        {isLive && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full mono text-[10px] font-bold"
            style={{
              background: 'rgba(14,203,129,0.1)',
              border:     '1px solid rgba(14,203,129,0.3)',
              color:      'var(--green)',
            }}>
            <span className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--green)', animation: 'blink 1s infinite' }} />
            LIVE TRADING
          </div>
        )}

        {/* Auto-trade badge */}
        {autoTradeEnabled && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full mono text-[10px] font-bold"
            style={{
              background: 'rgba(246,70,93,0.12)',
              border:     '1px solid rgba(246,70,93,0.3)',
              color:      'var(--red)',
            }}>
            <span className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--red)', animation: 'blink 1.5s infinite' }} />
            AUTO-TRADE
          </div>
        )}

        {/* AI online */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full mono text-[10px]"
          style={{
            background: 'rgba(14,203,129,0.08)',
            border:     '1px solid rgba(14,203,129,0.2)',
            color:      'var(--green)',
          }}>
          <span className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--green)', animation: 'blink 2s infinite' }} />
          AI Online
        </div>

        {/* Binance connection */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full mono text-[10px]"
          style={{
            background: isConnected ? 'rgba(240,185,11,0.08)' : 'var(--bg3)',
            border:     isConnected ? '1px solid rgba(240,185,11,0.25)' : '1px solid var(--border)',
            color:      isConnected ? 'var(--yellow)' : 'var(--text3)',
          }}>
          <span className="w-1.5 h-1.5 rounded-full"
            style={{
              background: isConnected ? 'var(--yellow)' : 'var(--text3)',
              animation:  isConnected ? 'blink 2s infinite' : 'none',
            }} />
          {isConnected ? 'Binance ✓' : 'No key'}
        </div>

        {/* Agent wallet indicator — GOAT chain pill + separate KeeperHub
            execution-status panel on GOAT tabs, BSC pill elsewhere.
            KeeperHub is intentionally its own control: it's the execution
            layer, not a chain, so it doesn't belong folded into the
            network pill — see components/agent/KeeperHubStatusPanel.tsx */}
        {isGoatTab ? (
          goat.isWalletLoaded && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full mono text-[10px] font-bold"
                style={{
                  background: goat.network === 'mainnet' ? 'rgba(240,185,11,0.08)' : 'rgba(14,203,129,0.08)',
                  border:     `1px solid ${goat.network === 'mainnet' ? 'rgba(240,185,11,0.2)' : 'rgba(14,203,129,0.2)'}`,
                  color:      goat.network === 'mainnet' ? 'var(--yellow)' : 'var(--green)',
                }}>
                <span className="w-1.5 h-1.5 rounded-full"
                  style={{ background: goat.network === 'mainnet' ? 'var(--yellow)' : 'var(--green)' }} />
                {goat.network === 'mainnet' ? 'GOAT Mainnet' : 'GOAT Testnet3'}
              </div>
              <KeeperHubStatusPanel />
            </div>
          )
        ) : (
          isWalletLoaded && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full mono text-[10px]"
              style={{
                background: network === 'mainnet' ? 'rgba(246,70,93,0.08)' : 'rgba(14,203,129,0.08)',
                border:     network === 'mainnet' ? '1px solid rgba(246,70,93,0.2)' : '1px solid rgba(14,203,129,0.2)',
                color:      network === 'mainnet' ? 'var(--red)' : 'var(--green)',
              }}>
              <span className="w-1.5 h-1.5 rounded-full"
                style={{ background: network === 'mainnet' ? 'var(--red)' : 'var(--green)' }} />
              {network === 'mainnet' ? 'Mainnet' : 'Testnet'}
            </div>
          )
        )}
      </div>
    </header>
  )
}
