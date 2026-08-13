'use client'
/**
 * components/tabs/AgentWalletTab.tsx — v2
 *
 * Redirects to the correct wallet/agent flow:
 *  - New user (no wallet) → Onboarding wizard
 *  - Returning user (wallet loaded) → Live Agent
 *
 * Wallet setup is now handled by LiveAgentTab (Session 2) which embeds
 * the full generate/import/unlock flow for the GOAT Network agent wallet.
 * The BSC competition wallet setup has been removed (Session 1 pivot).
 */

import { useGoatStore }  from '@/lib/goat/store'
import { useStore }      from '@/lib/store'

export default function AgentWalletTab() {
  const { isWalletLoaded, agentAddress, btcBalance, network } = useGoatStore()
  const { setActiveTab } = useStore()

  const networkLabel = network === 'mainnet' ? 'GOAT Mainnet' : 'GOAT Testnet3'

  if (isWalletLoaded && agentAddress) {
    return (
      <div className="max-w-xl mx-auto px-6 py-10 flex flex-col items-center gap-5 text-center">
        <div className="text-4xl"></div>
        <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Wallet ready</h2>
        <div className="rounded-xl p-4 w-full text-left" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>Agent wallet</div>
          <code className="font-mono text-xs break-all" style={{ color: 'var(--text)' }}>{agentAddress}</code>
          <div className="flex gap-4 mt-3">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Network</div>
              <div className="font-mono text-xs font-bold" style={{ color: 'var(--yellow)' }}>{networkLabel}</div>
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>BTC Balance</div>
              <div className="font-mono text-xs font-bold" style={{ color: btcBalance > 0 ? 'var(--green)' : 'var(--red)' }}>
                {btcBalance.toFixed(6)} BTC
              </div>
            </div>
          </div>
        </div>
        <p className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
          Your GOAT Network agent wallet is set up. Head to Live Agent to start autonomous trading.
        </p>
        <div className="flex gap-3">
          <button onClick={() => setActiveTab('live-agent')}
            className="font-mono text-xs font-bold px-5 py-2.5 rounded-lg"
            style={{ background: 'var(--yellow)', color: '#000' }}>
            Go to Live Agent →
          </button>
          <button onClick={() => setActiveTab('performance')}
            className="font-mono text-xs px-4 py-2.5 rounded-lg"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
            Performance
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-10 flex flex-col items-center gap-5 text-center">
      <div className="text-4xl"></div>
      <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Set up your agent wallet</h2>
      <p className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
        Binalyst v2 uses a self-custodial GOAT Network wallet for autonomous trading.
        Your private key is encrypted locally — it never leaves your device.
      </p>
      <div className="grid grid-cols-1 gap-3 w-full">
        <button onClick={() => setActiveTab('onboarding')}
          className="rounded-xl p-5 text-left"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--yellow)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
          <div className="flex items-center gap-3">
            <span className="text-2xl"></span>
            <div>
              <div className="font-bold text-sm mb-0.5" style={{ color: 'var(--text)' }}>New here? Start Onboarding</div>
              <div className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
                7-step wizard: network → wallet → market → strategy → backtest → risk → go live
              </div>
            </div>
          </div>
        </button>
        <button onClick={() => setActiveTab('live-agent')}
          className="rounded-xl p-5 text-left"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--yellow)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <div className="font-bold text-sm mb-0.5" style={{ color: 'var(--text)' }}>Already have a wallet? Import it</div>
              <div className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
                Go straight to Live Agent → import via private key or seed phrase
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
