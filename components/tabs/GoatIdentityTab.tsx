'use client'
/**
 * components/tabs/GoatIdentityTab.tsx — Session 7
 *
 * ERC-8004 Agent Identity + x402 Payment Log dashboard.
 * Replaces the 'goat-identity' placeholder in app/page.tsx.
 *
 * Features:
 *  - Register agent on GOAT Network (ERC-8004) via AgentKit
 *  - View agentId, registration URI, reputation signals
 *  - x402 payment log (what the agent paid for autonomously)
 */

import { useState } from 'react'
import { useGoatStore } from '@/lib/goat/store'

function Mono({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span className="font-mono text-xs" style={style}>{children}</span>
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[9px] uppercase tracking-widest mb-3" style={{ color: 'var(--text3)' }}>{children}</div>
}

function StatRow({ label, value, color = 'var(--text)' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <Mono style={{ color: 'var(--text2)' }}>{label}</Mono>
      <Mono style={{ color }}>{value}</Mono>
    </div>
  )
}

export default function GoatIdentityTab() {
  const {
    privateKey, agentAddress, isWalletLoaded, network,
    agentId, agentURI, setAgentIdentity,
    x402Payments: rawX402Payments, totalX402USD: rawTotalX402,
  } = useGoatStore()

  // Defensive defaults — stale localStorage may have undefined for new fields
  const x402Payments  = rawX402Payments ?? []
  const totalX402USD  = rawTotalX402 ?? 0

  const [registering,  setRegistering]  = useState(false)
  const [repLoading,   setRepLoading]   = useState(false)
  const [error,        setError]        = useState('')
  const [reputation,   setReputation]   = useState<any>(null)
  const [agentName,    setAgentName]    = useState('Binalyst Autonomous Trading Agent')
  const [exposeX402,   setExposeX402]   = useState(false)
  const [copied,       setCopied]       = useState('')

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 1800)
  }

  async function handleRegister() {
    if (!privateKey || !isWalletLoaded) { setError('Unlock your wallet first (Live Agent tab)'); return }
    setRegistering(true); setError('')

    try {
      const res = await fetch('/api/goat/identity', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:     'register',
          privateKey,
          network,
          agentName,
          exposeX402,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Registration failed')
      setAgentIdentity(data.agentId, data.agentURI)
    } catch (e: any) {
      setError(e.message)
    }
    setRegistering(false)
  }

  async function handleGetReputation() {
    if (!privateKey || !agentId) return
    setRepLoading(true); setError('')
    try {
      const res = await fetch('/api/goat/identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reputation', privateKey, network, agentId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed')
      setReputation(data.reputation)
    } catch (e: any) { setError(e.message) }
    setRepLoading(false)
  }

  const networkLabel = network === 'mainnet' ? 'GOAT Mainnet' : 'GOAT Testnet3'
  const explorerBase = network === 'mainnet'
    ? 'https://explorer.goat.network'
    : 'https://explorer.testnet3.goat.network'

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-5">

      <div>
        <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>GOAT Identity</h2>
        <Mono style={{ color: 'var(--text3)' }}>ERC-8004 Agent Identity · {networkLabel} · AgentKit SDK</Mono>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-2.5 font-mono text-[10px]"
          style={{ background: 'rgba(246,70,93,.07)', border: '1px solid rgba(246,70,93,.2)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {!isWalletLoaded && (
        <div className="rounded-lg px-4 py-2.5 font-mono text-[10px]"
          style={{ background: 'rgba(240,185,11,.06)', border: '1px solid rgba(240,185,11,.2)', color: 'var(--yellow)' }}>
          Wallet not unlocked — go to <strong>Live Agent</strong> tab and unlock your GOAT wallet first.
        </div>
      )}

      {/* ── Identity card ───────────────────────────────────────────────── */}
      <Card>
        <SectionLabel>Agent identity · ERC-8004</SectionLabel>

        {agentId ? (
          <div className="flex flex-col gap-0">
            <StatRow label="Status"    value="Registered ✓"   color="var(--green)" />
            <StatRow label="Agent ID"  value={`#${agentId}`}  color="var(--yellow)" />
            <StatRow label="Network"   value={networkLabel} />
            <StatRow label="Owner"     value={agentAddress ? `${agentAddress.slice(0,8)}…${agentAddress.slice(-6)}` : '—'} />
            <div className="flex items-start justify-between py-2">
              <Mono style={{ color: 'var(--text2)' }}>Agent URI</Mono>
              <div className="flex items-center gap-2">
                <Mono style={{ color: 'var(--text3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {agentURI?.slice(0, 40)}…
                </Mono>
                <button onClick={() => copy(agentURI ?? '', 'uri')}
                  className="font-mono text-[9px] px-2 py-0.5 rounded"
                  style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
                  {copied === 'uri' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
              Register this agent's wallet as an ERC-8004 identity (ERC-721 NFT) on {networkLabel}.
              The registration.json is encoded on-chain as a <code>data:</code> URI — no IPFS needed.
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--text3)' }}>Agent name</div>
              <input value={agentName} onChange={e => setAgentName(e.target.value)}
                className="w-full font-mono text-xs px-3 py-2 rounded-lg"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <label className="flex items-center gap-2 font-mono text-[10px]" style={{ color: 'var(--text2)' }}>
              <input type="checkbox" checked={exposeX402} onChange={e => setExposeX402(e.target.checked)} />
              Expose x402 paid endpoint (adds x402Support: true to registration.json)
            </label>
            <button onClick={handleRegister} disabled={registering || !isWalletLoaded}
              className="font-mono text-xs font-bold px-4 py-2.5 rounded-lg"
              style={{ background: 'var(--yellow)', color: '#000', opacity: (!isWalletLoaded || registering) ? 0.4 : 1 }}>
              {registering ? 'Registering via AgentKit…' : 'Register Agent (ERC-8004)'}
            </button>
          </div>
        )}

        {agentId && (
          <div className="mt-4 flex gap-2 flex-wrap">
            <a href={`${explorerBase}/address/${agentAddress}`} target="_blank" rel="noopener noreferrer"
              className="font-mono text-[10px] font-bold px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--yellow)', color: '#000' }}>
              View on Explorer ↗
            </a>
            <button onClick={handleGetReputation} disabled={repLoading}
              className="font-mono text-[10px] px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
              {repLoading ? 'Loading…' : 'Refresh reputation'}
            </button>
          </div>
        )}
      </Card>

      {/* ── Reputation ──────────────────────────────────────────────────── */}
      {reputation && (
        <Card>
          <SectionLabel>Reputation signals · GOAT Reputation Registry</SectionLabel>
          <pre className="font-mono text-[10px] overflow-auto" style={{ color: 'var(--text2)' }}>
            {JSON.stringify(reputation, null, 2)}
          </pre>
        </Card>
      )}

      {/* ── x402 payment log ────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>x402 Autonomous payments</SectionLabel>
          <Mono style={{ color: 'var(--yellow)' }}>${(totalX402USD ?? 0).toFixed(4)} total spent</Mono>
        </div>
        {x402Payments.length === 0 ? (
          <div className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
            No x402 payments yet. When the agent pays for signal data autonomously (e.g. CMC premium, Twelve Data paid tier),
            payments appear here. Requires <code>GOAT_X402_API_KEY</code> in .env.local.
          </div>
        ) : (
          <div>
            {x402Payments.slice(0, 10).map(p => (
              <div key={p.paymentId} className="flex items-center justify-between gap-3 py-2 font-mono text-[10px]"
                style={{ borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text3)' }}>{new Date(p.timestamp).toLocaleTimeString()}</span>
                <span style={{ color: 'var(--text)' }}>{p.serviceTag}</span>
                <span style={{ color: 'var(--yellow)' }}>{p.amount} {p.asset}</span>
                <span style={{ color: p.authorised ? 'var(--green)' : 'var(--red)' }}>
                  {p.authorised ? 'settled' : 'failed'}
                </span>
                <span style={{ color: 'var(--text3)' }}>{p.paymentId.slice(0, 12)}…</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── How x402 works ──────────────────────────────────────────────── */}
      <Card>
        <SectionLabel>How x402 works in this platform</SectionLabel>
        <div className="font-mono text-[10px] leading-relaxed" style={{ color: 'var(--text3)' }}>
          <p className="mb-2">
            x402 is a machine-to-machine HTTP payment protocol. When the agent needs to fetch premium signal data
            from a paid API, it autonomously:
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Receives an HTTP 402 response with payment instructions (price, token, recipient)</li>
            <li>Creates a payment intent (EIP-712 calldata) via the merchant gateway</li>
            <li>Signs the calldata with <code>EvmPayerWalletAdapter</code> (no human approval)</li>
            <li>Submits the signature — token transfer happens on-chain</li>
            <li>Receives the paid resource and continues trading</li>
          </ol>
          <p className="mt-2">
            Requires <code>GOAT_X402_API_KEY</code> + <code>GOAT_X402_BASE_URL</code> in .env.local.
            x402 payments settle in USDC on GOAT Network.
          </p>
        </div>
      </Card>
    </div>
  )
}
