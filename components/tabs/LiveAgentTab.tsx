'use client'
/**
 * components/tabs/LiveAgentTab.tsx — Session 2
 *
 * GOAT Network Live Agent dashboard.
 * Replaces the 'live-agent' placeholder registered in app/page.tsx.
 * Uses the same CSS variables and patterns as existing tabs.
 */

import { useState }         from 'react'
import { useGoatStore }     from '@/lib/goat/store'
import { useGoatAgentLoop } from '@/hooks/useGoatAgentLoop'
import {
  generateGoatWallet,
  goatWalletFromPrivateKey,
  goatWalletFromMnemonic,
  encryptGoatPrivateKey,
  decryptGoatPrivateKey,
} from '@/lib/goat/client'
import type { GoatNetwork } from '@/lib/goat/config'

const NETWORK_LABELS: Record<GoatNetwork, string> = {
  mainnet:  'GOAT Mainnet',
  testnet3: 'GOAT Testnet3',
}

type WalletStep = 'choose' | 'generate' | 'import' | 'unlock' | 'ready'

function Mono({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono text-xs ${className}`}>{children}</span>
}

function StatCard({ label, value, sub, color = 'var(--text)' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>
        {label}
      </div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="font-mono text-[10px] mt-1" style={{ color: 'var(--text3)' }}>{sub}</div>}
    </div>
  )
}

export default function LiveAgentTab() {
  const {
    agentAddress, privateKey, encryptedKey, isWalletLoaded,
    network, btcBalance, portfolioUSD, session,
    setWallet, setEncryptedKey, clearWallet, setNetwork,
    riskProfile, trades,
  } = useGoatStore()

  const {
    loopStatus, isRunning, nextRunIn, lastError, lastCycle,
    isActive, todayTrades, drawdownPct,
    startLoop, stopLoop, runCycle,
  } = useGoatAgentLoop()

  const [step,        setStep]       = useState<WalletStep>(
    encryptedKey ? 'unlock' : agentAddress ? 'ready' : 'choose'
  )
  const [importMode,  setImportMode] = useState<'key' | 'seed'>('key')
  const [inputVal,    setInputVal]   = useState('')
  const [password,    setPassword]   = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [unlockPass,  setUnlockPass] = useState('')
  const [generated,   setGenerated]  = useState<{ address: string; privateKey: string; mnemonic: string } | null>(null)
  const [showSeed,    setShowSeed]   = useState(false)
  const [dryRun,      setDryRun]     = useState(true)
  const [loading,     setLoading]    = useState(false)
  const [error,       setError]      = useState('')
  const [copied,      setCopied]     = useState('')

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 1800)
  }

  async function handleGenerate() {
    const w = generateGoatWallet()
    setGenerated(w)
    setStep('generate')
    setError('')
  }

  async function handleSaveGenerated() {
    if (!generated) return
    if (password.length < 8)        { setError('Password must be at least 8 characters'); return }
    if (password !== confirmPass)    { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      const enc = await encryptGoatPrivateKey(generated.privateKey, password)
      setEncryptedKey(enc)
      setWallet(generated.address, generated.privateKey)
      setStep('ready')
      setGenerated(null); setPassword(''); setConfirmPass('')
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  async function handleImport() {
    if (!inputVal.trim()) { setError('Enter a private key or seed phrase'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirmPass) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      const w   = importMode === 'key'
        ? goatWalletFromPrivateKey(inputVal)
        : goatWalletFromMnemonic(inputVal)
      const enc = await encryptGoatPrivateKey(w.privateKey, password)
      setEncryptedKey(enc)
      setWallet(w.address, w.privateKey)
      setStep('ready')
      setInputVal(''); setPassword(''); setConfirmPass('')
    } catch (e: any) { setError('Invalid key/phrase: ' + e.message) }
    setLoading(false)
  }

  async function handleUnlock() {
    if (!unlockPass) { setError('Enter your password'); return }
    setLoading(true)
    try {
      const pk = await decryptGoatPrivateKey(encryptedKey, unlockPass)
      const { ethers } = await import('ethers')
      const w = new ethers.Wallet(pk)
      setWallet(w.address, pk)
      setStep('ready')
      setUnlockPass('')
    } catch { setError('Wrong password') }
    setLoading(false)
  }

  const pnlUSD  = session ? session.currentUSD - session.startValueUSD : 0
  const pnlPct  = session?.startValueUSD ? (pnlUSD / session.startValueUSD) * 100 : 0

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Live Agent</h2>
          <Mono className="mt-0.5" ><span style={{ color: 'var(--text3)' }}>GOAT Network · Uniswap V3 · BTC gas · 2-min tick</span></Mono>
        </div>
        <div className="flex items-center gap-2">
          {(['testnet3', 'mainnet'] as GoatNetwork[]).map(n => (
            <button key={n} onClick={() => setNetwork(n)}
              className="font-mono text-[10px] px-3 py-1.5 rounded-full"
              style={{
                background:   network === n ? 'var(--yellow)' : 'var(--bg2)',
                color:        network === n ? '#000' : 'var(--text2)',
                border:       '1px solid var(--border)',
              }}>
              {NETWORK_LABELS[n]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 font-mono text-xs"
          style={{ background: 'rgba(246,70,93,.07)', border: '1px solid rgba(246,70,93,.2)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {/* ── WALLET NOT SET UP ───────────────────────────────────────────────── */}
      {step === 'choose' && (
        <div className="rounded-xl p-6" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <div className="font-mono text-[9px] uppercase tracking-widest mb-4" style={{ color: 'var(--text3)' }}>
            Set up your GOAT Network agent wallet
          </div>
          <p className="text-sm mb-5" style={{ color: 'var(--text2)' }}>
            The agent needs its own self-custodial GOAT Network wallet. Private key is
            encrypted locally — it never leaves this device.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: '⚡', title: 'Generate New', sub: 'Create a fresh GOAT wallet', action: handleGenerate },
              { icon: '🔑', title: 'Import Existing', sub: 'Private key or seed phrase', action: () => setStep('import') },
            ].map(card => (
              <button key={card.title} onClick={card.action}
                className="rounded-xl p-5 text-left transition-all"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--yellow)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <div className="text-2xl mb-2">{card.icon}</div>
                <div className="font-bold text-sm mb-1" style={{ color: 'var(--text)' }}>{card.title}</div>
                <div className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>{card.sub}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── GENERATE ───────────────────────────────────────────────────────── */}
      {step === 'generate' && generated && (
        <div className="rounded-xl p-5 flex flex-col gap-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>New GOAT wallet</div>
          <div className="rounded-lg p-3" style={{ background: 'rgba(246,70,93,.06)', border: '1px solid rgba(246,70,93,.2)' }}>
            <div className="font-mono text-xs font-bold" style={{ color: 'var(--red)' }}>⚠ Back up your seed phrase before continuing</div>
          </div>
          {[
            { label: 'Address', value: generated.address, key: 'addr', mask: false },
            { label: 'Seed phrase', value: generated.mnemonic, key: 'seed', mask: true },
          ].map(row => (
            <div key={row.key}>
              <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>{row.label}</div>
              <div className="flex items-start gap-2">
                <code className="font-mono text-xs flex-1 break-all p-2 rounded-lg" style={{ background: 'var(--bg3)', color: 'var(--text)' }}>
                  {row.mask && !showSeed ? '•'.repeat(40) : row.value}
                </code>
                {row.mask && (
                  <button onClick={() => setShowSeed(s => !s)} className="font-mono text-[10px] px-2 py-1 rounded" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>
                    {showSeed ? 'Hide' : 'Show'}
                  </button>
                )}
                <button onClick={() => copy(row.value, row.key)} className="font-mono text-[10px] px-2 py-1 rounded shrink-0" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>
                  {copied === row.key ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <input type="password" placeholder="Password (min 8 chars)" value={password} onChange={e => setPassword(e.target.value)}
              className="font-mono text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <input type="password" placeholder="Confirm password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
              className="font-mono text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <button onClick={handleSaveGenerated} disabled={loading}
            className="font-mono text-xs font-bold px-4 py-2.5 rounded-lg" style={{ background: 'var(--yellow)', color: '#000' }}>
            {loading ? 'Saving…' : 'Save & Continue'}
          </button>
        </div>
      )}

      {/* ── IMPORT ──────────────────────────────────────────────────────────── */}
      {step === 'import' && (
        <div className="rounded-xl p-5 flex flex-col gap-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Import wallet</div>
          <div className="flex gap-2">
            {(['key', 'seed'] as const).map(m => (
              <button key={m} onClick={() => setImportMode(m)}
                className="font-mono text-[10px] px-3 py-1.5 rounded-full"
                style={{ background: importMode === m ? 'var(--yellow)' : 'var(--bg3)', color: importMode === m ? '#000' : 'var(--text2)', border: '1px solid var(--border)' }}>
                {m === 'key' ? 'Private key' : 'Seed phrase'}
              </button>
            ))}
          </div>
          {importMode === 'key'
            ? <input type="password" placeholder="0x... private key" value={inputVal} onChange={e => setInputVal(e.target.value)}
                className="font-mono text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            : <textarea rows={3} placeholder="Enter 12/24-word seed phrase" value={inputVal} onChange={e => setInputVal(e.target.value)}
                className="font-mono text-xs px-3 py-2 rounded-lg resize-none" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          }
          <div className="grid grid-cols-2 gap-3">
            <input type="password" placeholder="Password (min 8 chars)" value={password} onChange={e => setPassword(e.target.value)}
              className="font-mono text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <input type="password" placeholder="Confirm password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
              className="font-mono text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep('choose')} className="font-mono text-xs px-4 py-2 rounded-lg" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>Back</button>
            <button onClick={handleImport} disabled={loading} className="font-mono text-xs font-bold px-4 py-2 rounded-lg flex-1" style={{ background: 'var(--yellow)', color: '#000' }}>
              {loading ? 'Importing…' : 'Import & Continue'}
            </button>
          </div>
        </div>
      )}

      {/* ── UNLOCK ──────────────────────────────────────────────────────────── */}
      {step === 'unlock' && (
        <div className="rounded-xl p-5 flex flex-col gap-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Unlock GOAT agent wallet</div>
          <input type="password" placeholder="Password" value={unlockPass} onChange={e => setUnlockPass(e.target.value)}
            className="font-mono text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <div className="flex gap-2">
            <button onClick={() => { clearWallet(); setEncryptedKey(''); setStep('choose') }} className="font-mono text-xs px-4 py-2 rounded-lg" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>Start over</button>
            <button onClick={handleUnlock} disabled={loading} className="font-mono text-xs font-bold px-4 py-2 rounded-lg flex-1" style={{ background: 'var(--yellow)', color: '#000' }}>
              {loading ? 'Unlocking…' : 'Unlock'}
            </button>
          </div>
        </div>
      )}

      {/* ── READY — main dashboard ───────────────────────────────────────────── */}
      {step === 'ready' && (
        <>
          {/* Address */}
          <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--text3)' }}>Agent wallet</div>
              <code className="font-mono text-xs break-all" style={{ color: 'var(--text)' }}>{agentAddress}</code>
            </div>
            <button onClick={() => copy(agentAddress, 'addr')} className="font-mono text-[10px] px-2 py-1 rounded shrink-0" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>
              {copied === 'addr' ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="BTC Balance" value={`${btcBalance.toFixed(6)} BTC`} sub="native gas token" color="var(--yellow)" />
            <StatCard label="PnL" value={`${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`} sub={`${pnlUSD >= 0 ? '+' : ''}$${pnlUSD.toFixed(2)}`} color={pnlPct >= 0 ? 'var(--green)' : 'var(--red)'} />
            <StatCard label="Drawdown" value={`${drawdownPct.toFixed(1)}%`} sub={`limit: ${riskProfile.maxDrawdownPct}% (${riskProfile.preset})`} color={drawdownPct > riskProfile.maxDrawdownPct * 0.8 ? 'var(--red)' : 'var(--text)'} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Trades today" value={`${todayTrades}`} sub={`limit: ${riskProfile.maxDailyTrades}`} />
            <StatCard label="Next cycle" value={isActive ? `${nextRunIn}s` : '—'} sub="2-min autonomous tick" color="var(--yellow)" />
            <StatCard label="Risk preset" value={riskProfile.preset} sub={`${riskProfile.maxPositionPct}% pos · ${riskProfile.stopLossPct}% SL`} />
          </div>

          {/* Controls */}
          <div className="rounded-xl p-4 flex items-center justify-between flex-wrap gap-3"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: isActive ? 'var(--green)' : 'var(--text3)', animation: isActive ? 'blink 1.5s infinite' : 'none' }} />
                <span className="font-mono text-xs font-bold" style={{ color: isActive ? 'var(--green)' : 'var(--text3)' }}>
                  {loopStatus.toUpperCase()}
                </span>
              </div>
              {lastError && <div className="font-mono text-[10px]" style={{ color: 'var(--red)' }}>{lastError}</div>}
              {lastCycle && (
                <div className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
                  Last: {lastCycle.executed} executed · {lastCycle.blocked} blocked
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-2 font-mono text-[10px]" style={{ color: 'var(--text2)' }}>
                <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
                Dry run
              </label>
              {!isActive
                ? <button onClick={startLoop} className="font-mono text-xs font-bold px-4 py-2 rounded-lg" style={{ background: 'var(--green)', color: '#000' }}>Start Agent</button>
                : <button onClick={stopLoop}  className="font-mono text-xs font-bold px-4 py-2 rounded-lg" style={{ background: 'var(--red)', color: '#fff' }}>Stop</button>
              }
              <button onClick={runCycle} disabled={isRunning} className="font-mono text-xs px-4 py-2 rounded-lg" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>
                {isRunning ? 'Running…' : 'Run Once'}
              </button>
            </div>
          </div>

          {/* Trade log */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="font-mono text-xs font-bold" style={{ color: 'var(--text)' }}>Recent decisions</span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>GOAT Network · Uniswap V3</span>
            </div>
            {trades.length === 0
              ? <div className="px-4 py-6 font-mono text-xs text-center" style={{ color: 'var(--text3)' }}>No trades yet — start the agent to begin</div>
              : trades.slice(0, 8).map(t => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="font-mono font-bold" style={{ color: 'var(--text)' }}>{t.symbol}</span>
                  <span className="font-mono px-2 py-0.5 rounded text-[9px] font-bold"
                    style={{
                      background: t.side === 'buy' ? 'rgba(14,203,129,.12)' : 'rgba(246,70,93,.12)',
                      color:      t.side === 'buy' ? 'var(--green)' : 'var(--red)',
                    }}>
                    {t.side.toUpperCase()}
                  </span>
                  <span style={{ color: 'var(--text2)' }}>${t.amountUSD.toFixed(2)}</span>
                  <span className="font-mono text-[10px]"
                    style={{ color: t.status === 'confirmed' ? 'var(--green)' : t.status === 'simulated' ? 'var(--yellow)' : t.status === 'blocked' ? 'var(--text3)' : 'var(--red)' }}>
                    {t.status}
                  </span>
                  <span className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
                    {new Date(t.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            }
          </div>
        </>
      )}
    </div>
  )
}
