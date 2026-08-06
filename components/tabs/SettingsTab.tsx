'use client'

import { useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { useStore } from '@/lib/store'

export default function SettingsTab() {
  const { apiKey, apiSecret, isConnected, autoTradeEnabled, setCredentials, clearCredentials, setAutoTrade } = useStore()
  const { data: session } = useSession()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    clearCredentials()
    await signOut({ callbackUrl: '/login' })
  }

  const [keyInput, setKeyInput]       = useState('')
  const [secretInput, setSecretInput] = useState('')
  const [showSecret, setShowSecret]   = useState(false)
  const [testing, setTesting]         = useState(false)
  const [testResult, setTestResult]   = useState<{ ok: boolean; msg: string } | null>(null)

  async function testAndConnect() {
    if (!keyInput.trim() || !secretInput.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/binance/account?action=account', {
        headers: {
          'x-binance-key': keyInput.trim(),
          'x-binance-secret': secretInput.trim(),
        },
      })
      const data = await res.json()
      if (data.success) {
        setCredentials(keyInput.trim(), secretInput.trim())
        setTestResult({ ok: true, msg: `Connected ✓  Account type: ${data.data.accountType}  —  Trading enabled: ${data.data.canTrade}` })
        setKeyInput('')
        setSecretInput('')
      } else {
        setTestResult({ ok: false, msg: data.error || 'Connection failed. Check your API key and secret.' })
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message })
    }
    setTesting(false)
  }

  function disconnect() {
    clearCredentials()
    setTestResult(null)
    setAutoTrade(false)
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{background:"var(--bg)"}}>
    <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-8">

      {/* ── Binance API Key ──────────────────────────────────────── */}
      <section>
        <SectionTitle label="Binance API key" />

        {isConnected ? (
          <div
            className="rounded-md p-5 flex items-start justify-between gap-4"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-md flex items-center justify-center text-lg shrink-0"
                style={{ background: 'rgba(14,203,129,0.12)' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--green)' }}>
                  Binance account connected
                </div>
                <div className="mono text-xs mt-1" style={{ color: 'var(--text3)' }}>
                  Key: {apiKey.slice(0, 8)}••••••••{apiKey.slice(-4)}
                </div>
                <div className="mono text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
                  Keys are held in session memory only — cleared on tab close.
                </div>
              </div>
            </div>
            <button
              onClick={disconnect}
              className="text-xs px-4 py-2 rounded-md shrink-0 transition-all"
              style={{
                background: 'rgba(246,70,93,0.1)',
                border: '1px solid rgba(246,70,93,0.3)',
                color: 'var(--red)',
              }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div
            className="rounded-md p-5 flex flex-col gap-4"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text2)' }}>
              Connect your Binance API key to enable live portfolio, trading, and personalized AI analysis.
              Your keys are{' '}
              <span style={{ color: 'var(--yellow)' }}>never stored on our servers</span> — held in
              browser session memory only.
            </p>

            <div className="flex flex-col gap-3">
              <Field label="API Key">
                <input
                  type="text"
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  placeholder="Paste your Binance API key..."
                  className="w-full mono text-sm px-3 py-2.5 rounded-md outline-none transition-all"
                  style={{
                    background: 'var(--bg3)',
                    border: '1px solid var(--border2)',
                    color: 'var(--text)',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
                />
              </Field>

              <Field label="API Secret">
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={secretInput}
                    onChange={e => setSecretInput(e.target.value)}
                    placeholder="Paste your API secret..."
                    className="w-full mono text-sm px-3 py-2.5 pr-16 rounded-md outline-none transition-all"
                    style={{
                      background: 'var(--bg3)',
                      border: '1px solid var(--border2)',
                      color: 'var(--text)',
                    }}
                    onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
                  />
                  <button
                    onClick={() => setShowSecret(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 mono text-xs"
                    style={{ color: 'var(--text3)' }}
                  >
                    {showSecret ? 'hide' : 'show'}
                  </button>
                </div>
              </Field>
            </div>

            {testResult && (
              <div
                className="mono text-xs p-3 rounded-md"
                style={{
                  background: testResult.ok ? 'rgba(14,203,129,0.08)' : 'rgba(246,70,93,0.08)',
                  border: `1px solid ${testResult.ok ? 'rgba(14,203,129,0.25)' : 'rgba(246,70,93,0.25)'}`,
                  color: testResult.ok ? 'var(--green)' : 'var(--red)',
                }}
              >
                {testResult.msg}
              </div>
            )}

            <button
              onClick={testAndConnect}
              disabled={!keyInput || !secretInput || testing}
              className="flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-bold transition-all"
              style={{
                background: keyInput && secretInput ? 'var(--yellow)' : 'var(--bg4)',
                color: keyInput && secretInput ? '#000' : 'var(--text3)',
                cursor: keyInput && secretInput ? 'pointer' : 'not-allowed',
              }}
            >
              {testing && (
                <span
                  className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin-slow"
                />
              )}
              {testing ? 'Testing connection...' : 'Connect Binance Account'}
            </button>

            <div
              className="text-xs rounded-md p-3"
              style={{ background: 'var(--bg3)', color: 'var(--text3)' }}
            >
              <p className="font-semibold mb-1" style={{ color: 'var(--text2)' }}>
                How to create a Binance API key:
              </p>
              <ol className="list-decimal list-inside space-y-1 mono text-[11px]">
                <li>Binance → Account → API Management</li>
                <li>Create new API key (System Generated)</li>
                <li>Enable: Reading ✓ &nbsp; Spot Trading ✓</li>
                <li>Disable: Withdrawals ✗ (never needed)</li>
                <li>Restrict to your IP for extra security</li>
              </ol>
            </div>
          </div>
        )}
      </section>

      {/* ── Auto-Trade ───────────────────────────────────────────── */}
      <section>
        <SectionTitle label="Auto-trade" />
        <div
          className="rounded-md p-5"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
                Allow AI to execute trades
              </div>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
                When enabled, the AI assistant can place orders directly on Binance. Every trade still
                goes through a dry-run validation and shows you a confirmation before executing.
                {!isConnected && (
                  <span style={{ color: 'var(--text3)' }}> Connect your API key first.</span>
                )}
              </div>
            </div>
            <button
              disabled={!isConnected}
              onClick={() => setAutoTrade(!autoTradeEnabled)}
              className="shrink-0 w-12 h-6 rounded-full relative transition-all"
              style={{
                background: autoTradeEnabled ? 'var(--yellow)' : 'var(--bg4)',
                opacity: isConnected ? 1 : 0.4,
                cursor: isConnected ? 'pointer' : 'not-allowed',
              }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                style={{
                  background: autoTradeEnabled ? '#000' : 'var(--text3)',
                  left: autoTradeEnabled ? '26px' : '2px',
                }}
              />
            </button>
          </div>

          {autoTradeEnabled && (
            <div
              className="mt-4 mono text-xs p-3 rounded-md"
              style={{
                background: 'rgba(246,70,93,0.08)',
                border: '1px solid rgba(246,70,93,0.2)',
                color: 'var(--red)',
              }}
            >
              ⚠ Auto-trade is ON. The AI can place real orders. Use Binance testnet to trial first.
            </div>
          )}
        </div>
      </section>

      {/* ── Account ──────────────────────────────────────────────── */}
      <section>
        <SectionTitle label="Account" />
        <div
          className="rounded-md p-5 flex items-center justify-between gap-4"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded flex items-center justify-center font-bold text-sm shrink-0"
              style={{ background: 'var(--yellow)', color: '#000' }}
            >
              {(session?.user?.name ?? session?.user?.email ?? 'U').slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {session?.user?.name ?? 'User'}
              </div>
              <div className="mono text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
                {session?.user?.email ?? '—'}
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all shrink-0"
            style={{
              background: 'rgba(246,70,93,0.08)',
              border: '1px solid rgba(246,70,93,0.25)',
              color: 'var(--red)',
              cursor: signingOut ? 'not-allowed' : 'pointer',
              opacity: signingOut ? 0.6 : 1,
            }}
          >
            {signingOut && (
              <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin-slow" />
            )}
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </section>

      {/* ── About ────────────────────────────────────────────────── */}
      <section>
        <SectionTitle label="About" />
        <div
          className="rounded-md p-5 flex flex-col gap-2"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
        >
          <Row label="Platform"    value="Binalyst" />
          <Row label="AI Model"    value="Claude (claude-sonnet-4)" />
          <Row label="Build"       value="Session 2 / 12" />
          <Row label="Stack"       value="Next.js 14 · TypeScript · Vercel" />
          <Row label="Data"        value="Binance REST API + WebSocket" />
        </div>
      </section>
    </div>
  </div>
  )
}

function SectionTitle({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="mono font-bold tracking-widest uppercase"
        style={{ fontSize: 9, color: 'var(--text3)', letterSpacing: '.12em' }}>
        {label}
      </div>
      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--text3)' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0"
      style={{ borderColor: 'var(--border)' }}>
      <span className="text-xs" style={{ color: 'var(--text2)' }}>{label}</span>
      <span className="mono text-xs" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  )
}