'use client'
/**
 * components/MobileDrawer.tsx — Session 11
 * Updated mobile drawer — 4 clean sections matching the new platform.
 * Removes: Competition, Submission, Mantle, Celo, POKT, Croo, Stellar, Bitget, Dorahacks.
 */

import { useStore }      from '@/lib/store'
import { useGoatStore }  from '@/lib/goat/store'
import { useEffect, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import type { ActiveTab } from '@/lib/store'

type DrawerSection = {
  label: string
  color: string
  items: { id: ActiveTab; label: string; icon: string; desc: string }[]
}

const SECTIONS: DrawerSection[] = [
  {
    label: 'Intelligence',
    color: '#3498db',
    items: [
      { id: 'signals', label: 'CMC Signals',  icon: '📡', desc: 'Fear & Greed · signal scoring' },
      { id: 'events',  label: 'Events Radar', icon: '◎',  desc: 'Listings, airdrops, launchpool' },
      { id: 'chat',    label: 'AI Assistant', icon: '◈',  desc: 'Claude + live market data' },
    ],
  },
  {
    label: 'Agent',
    color: '#F0B90B',
    items: [
      { id: 'onboarding',   label: 'Onboarding',    icon: '🚀', desc: '7-step setup wizard' },
      { id: 'agent-wallet', label: 'Agent Wallet',  icon: '🔐', desc: 'Self-custodial wallet' },
      { id: 'strategy',     label: 'Strategy',      icon: '🧠', desc: 'AI-parsed trading rules' },
      { id: 'backtest',     label: 'Backtest',      icon: '📈', desc: 'Historical simulation' },
      { id: 'risk-profile', label: 'Risk Profile',  icon: '🛡️', desc: 'Guardrails & position sizing' },
      { id: 'wallet',       label: 'Fund & Send',   icon: '💳', desc: 'Fund wallet · send BTC' },
      { id: 'live-agent',   label: 'Live Agent',    icon: '▶',  desc: 'GOAT Network · autonomous' },
      { id: 'performance',  label: 'Performance',   icon: '📊', desc: 'PnL · drawdown · regime' },
      { id: 'goat-identity',label: 'GOAT Identity', icon: '⬡',  desc: 'ERC-8004 · x402 payments' },
    ],
  },
  {
    label: 'Markets',
    color: '#0ECB81',
    items: [
      { id: 'live-prices',   label: 'Live Prices',  icon: '◐',  desc: 'Crypto · Forex · Stocks · Meme' },
      { id: 'crypto-market', label: 'Crypto',       icon: '₿',  desc: 'Bitcoin, ETH, altcoins' },
      { id: 'forex-market',  label: 'Forex',        icon: '💱', desc: 'EUR/USD, GBP/USD, majors' },
      { id: 'stocks-market', label: 'Stocks',       icon: '📈', desc: 'AAPL, TSLA, NVDA, ETFs' },
      { id: 'meme-market',   label: 'Meme coins',   icon: '🐸', desc: 'PEPE, BONK, DOGE, WIF' },
      { id: 'portfolio',     label: 'Portfolio',    icon: '◑',  desc: 'Holdings & P&L' },
      { id: 'alerts',        label: 'Price Alerts', icon: '🔔', desc: 'Push notifications' },
    ],
  },
  {
    label: 'Account',
    color: 'rgba(255,255,255,.3)',
    items: [
      { id: 'volume',   label: 'Volume Dashboard', icon: '📊', desc: 'Cross-chain trade volume' },
      { id: 'learn',    label: 'Learn',            icon: '◉',  desc: 'Crypto academy & quizzes' },
      { id: 'settings', label: 'Settings',         icon: '⚙️', desc: 'Account & preferences' },
    ],
  },
]

interface MobileDrawerProps { isOpen: boolean; onClose: () => void }

export default function MobileDrawer({ isOpen, onClose }: MobileDrawerProps) {
  const { activeTab, setActiveTab } = useStore()
  const { session }                 = useGoatStore()
  const { data: sessionData }       = useSession()
  const isLive = session?.status === 'running'

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  function go(id: ActiveTab) { setActiveTab(id); onClose() }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)' }}
          onClick={onClose}
        />
      )}

      {/* Drawer panel */}
      <div
        className="fixed top-0 left-0 bottom-0 z-50 overflow-y-auto"
        style={{
          width:      280,
          background: 'var(--bg2)',
          borderRight:'1px solid var(--border)',
          transform:  isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform .22s cubic-bezier(.4,0,.2,1)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>

        {/* Header */}
        <div className="flex items-center justify-between p-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md flex items-center justify-center font-black text-sm"
              style={{ background: 'var(--yellow)', color: '#000' }}>B</div>
            <div>
              <div className="font-bold text-sm" style={{ color: 'var(--text)' }}>Binalyst</div>
              <div className="font-mono text-[8px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
                Autonomous Trading
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text3)', fontSize: 20 }}>✕</button>
        </div>

        {/* Agent status strip */}
        {isLive && (
          <div className="flex items-center gap-2 mx-3 mt-3 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(14,203,129,.08)', border: '1px solid rgba(14,203,129,.2)' }}>
            <span className="w-2 h-2 rounded-full shrink-0"
              style={{ background: 'var(--green)', animation: 'blink 1.5s infinite' }} />
            <span className="font-mono text-[10px] font-bold" style={{ color: 'var(--green)' }}>
              GOAT Agent running
            </span>
          </div>
        )}

        {/* Nav sections */}
        {SECTIONS.map(section => (
          <div key={section.label} className="mt-4">
            <div className="px-4 pb-1 font-mono text-[8px] uppercase tracking-widest font-bold"
              style={{ color: section.color }}>
              {section.label}
            </div>
            {section.items.map(item => {
              const active = activeTab === item.id
              return (
                <button key={item.id} onClick={() => go(item.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
                  style={{
                    background: active ? 'rgba(240,185,11,.07)' : 'transparent',
                    borderLeft: active ? '2px solid var(--yellow)' : '2px solid transparent',
                  }}>
                  <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[11px] font-bold truncate"
                      style={{ color: active ? 'var(--yellow)' : 'var(--text)' }}>
                      {item.label}
                    </div>
                    <div className="font-mono text-[9px] truncate" style={{ color: 'var(--text3)' }}>
                      {item.desc}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ))}

        {/* User footer */}
        {sessionData?.user && (
          <div className="mt-4 mx-3 mb-4 p-3 rounded-lg"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
            <div className="font-mono text-[10px] mb-2 truncate" style={{ color: 'var(--text2)' }}>
              {sessionData.user.email}
            </div>
            <button onClick={() => signOut()}
              className="font-mono text-[10px] px-3 py-1.5 rounded-lg w-full"
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </>
  )
}
