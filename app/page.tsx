'use client'
import ErrorBoundary    from '@/components/ErrorBoundary'
import AutoRestartToast     from '@/components/AutoRestartToast'

/**
 * app/page.tsx — Session H FINAL (REPLACES Session E version)
 * All 19 tabs wired. Adds AgentPerformanceTab from Session G.
 */

import { useState, useEffect } from 'react'
import { useSession }          from 'next-auth/react'
import { useStore }            from '@/lib/store'

// ── Layout ────────────────────────────────────────────────────────────────────
import Sidebar      from '@/components/Sidebar'
import Header       from '@/components/Header'
import BottomNav    from '@/components/BottomNav'
import MobileDrawer from '@/components/MobileDrawer'

// ── Original Binalyst tabs ────────────────────────────────────────────────────
import DashboardTab from '@/components/tabs/DashboardTab'
import ChatTab      from '@/components/tabs/ChatTab'
import MarketsTab   from '@/components/tabs/MarketsTab'
import EventsTab    from '@/components/tabs/EventsTab'
import LearnTab     from '@/components/tabs/LearnTab'
import PortfolioTab from '@/components/tabs/PortfolioTab'
import TradingTab   from '@/components/tabs/TradeTab'
import AlertsTab    from '@/components/tabs/AlertsTab'
import AgentTab     from '@/components/tabs/AgentTab'
import Web3Tab      from '@/components/tabs/Web3Tab'
import SquareTab    from '@/components/tabs/SquareTab'
import MessagingTab from '@/components/tabs/MessagingTab'
import SettingsTab  from '@/components/tabs/SettingsTab'

// ── Autonomous Agent tabs (Sessions A-G) ──────────────────────────────────────
import AgentWalletTab      from '@/components/tabs/AgentWalletTab'
import SignalDashboard     from '@/components/tabs/SignalDashboard'
import StrategyBuilder     from '@/components/tabs/StrategyBuilder'
import AgentPerformanceTab  from '@/components/tabs/AgentPerformanceTab'
import LiveAgentTab          from '@/components/tabs/LiveAgentTab'
import WalletTab             from '@/components/tabs/WalletTab'
import RiskProfileTab       from '@/components/tabs/RiskProfileTab'
import OnboardingTab        from '@/components/tabs/OnboardingTab'
import GoatIdentityTab      from '@/components/tabs/GoatIdentityTab'
import VolumeTab            from '@/components/tabs/VolumeTab'
import LivePricesTab        from '@/components/tabs/LivePricesTab'


import BacktestTab         from '@/components/tabs/BacktestTab'






const TABS: Record<string, React.ReactNode> = {
  // ── Core ────────────────────────────────────────────────────────────────
  home:           <DashboardTab />,
  chat:           <ChatTab />,
  markets:        <MarketsTab />,
  events:         <EventsTab />,
  learn:          <LearnTab />,
  portfolio:      <PortfolioTab />,
  trading:        <TradingTab />,
  alerts:         <AlertsTab />,
  settings:       <SettingsTab />,
  web3:           <Web3Tab />,
  square:         <SquareTab />,
  messaging:      <MessagingTab />,
  // ── Agent ──────────────────────────────────────────────────────────────
  onboarding:     <OnboardingTab />,
  'agent-wallet': <AgentWalletTab />,
  'wallet':        <WalletTab />,
  signals:        <SignalDashboard />,
  strategy:       <StrategyBuilder />,
  backtest:       <BacktestTab />,
  'risk-profile': <RiskProfileTab />,
  'live-agent':   <LiveAgentTab />,
  performance:    <AgentPerformanceTab />,
  // ── Markets ─────────────────────────────────────────────────────────────
  'live-prices':   <LivePricesTab />,
  'crypto-market': <LivePricesTab />,
  'forex-market':  <LivePricesTab />,
  'stocks-market': <LivePricesTab />,
  'meme-market':   <LivePricesTab />,
  // ── Account ─────────────────────────────────────────────────────────────
  volume:          <VolumeTab />,
  'goat-identity': <GoatIdentityTab />,
}

export default function App() {
  const { data: session }           = useSession()
  const { activeTab, setActiveTab } = useStore()
  const [drawer, setDrawer]         = useState(false)
  const isHome                      = activeTab === 'home'

  useEffect(() => {
    if (session) setActiveTab('home')
  }, [session?.user?.email])

  return (
    <>
      {/* ── Desktop ─────────────────────────────────────────────────────── */}
      <div className="hidden md:flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          {!isHome && <Header />}
          <main className="flex-1 overflow-y-auto">
            {TABS[activeTab] ?? TABS.home}
          </main>
        </div>
      </div>

      {/* ── Mobile ──────────────────────────────────────────────────────── */}
      <div className="flex md:hidden flex-col" style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
        {!isHome && (
          <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b"
            style={{
              background:     'rgba(11,14,17,0.95)',
              backdropFilter: 'blur(12px)',
              borderColor:    'var(--border)',
              position:       'sticky',
              top: 0, zIndex: 30,
            }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center font-extrabold text-sm"
                style={{ background: 'var(--yellow)', color: '#000' }}>B</div>
              <span className="font-extrabold text-sm" style={{ color: 'var(--text)' }}>Binalyst</span>
            </div>
            <button onClick={() => setDrawer(true)}
              className="flex flex-col items-center justify-center gap-1 w-9 h-9 rounded-lg"
              style={{ background: 'var(--bg3)' }}>
              {[16, 16, 10].map((w, i) => (
                <span key={i} style={{ width: w, height: 1.5, background: 'var(--text2)', borderRadius: 1, display: 'block' }} />
              ))}
            </button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto" style={{ paddingBottom: 68 }}>
          {TABS[activeTab] ?? TABS.home}
        </main>
        <BottomNav />
        <MobileDrawer isOpen={drawer} onClose={() => setDrawer(false)} />
      </div>
    </>
  )
}
