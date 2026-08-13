'use client'
/**
 * components/tabs/OnboardingTab.tsx — Session 6
 *
 * 7-step gated onboarding wizard. Orchestrates existing components
 * (AgentWalletTab logic, StrategyBuilder, BacktestTab, RiskProfileTab)
 * into a linear flow. Each step gates the next.
 *
 * Steps:
 *   1. Network       — choose GOAT Mainnet / GOAT Testnet3 / BSC
 *   2. Wallet        — connect or generate agent wallet
 *   3. Market type   — crypto / forex / stocks / meme
 *   4. Asset         — symbol picker filtered by market type
 *   5. Strategy      — paste / pick a strategy (pre-built templates)
 *   6. Backtest      — run backtest on selected asset + strategy
 *   7. Risk profile  — set conservative/moderate/aggressive
 *   ✓  Go live       — confirm and navigate to live-agent tab
 */

import { useState, useCallback, useEffect } from 'react'
import { useGoatStore }            from '@/lib/goat/store'
import { useAgentStore }           from '@/lib/agentStore'
import { RISK_PRESETS }            from '@/lib/agentLoop'
import type { RiskPreset }         from '@/lib/agentLoop'
import {
  generateGoatWallet,
  goatWalletFromPrivateKey,
  goatWalletFromMnemonic,
  encryptGoatPrivateKey,
  decryptGoatPrivateKey,
} from '@/lib/goat/client'
import {
  generateAgentWallet,
  walletFromMnemonic,
  encryptPrivateKey,
  decryptPrivateKey,
} from '@/lib/twak/client'
import {
  FOREX_SYMBOLS,
  STOCKS_SYMBOLS,
  MEME_SYMBOLS,
} from '@/lib/skills/twelvedata'
import type { MarketType } from '@/lib/goat/store'
import type { GoatNetwork } from '@/lib/goat/config'
import type { BacktestResult } from '@/lib/backtester'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type NetworkChoice = 'goat-mainnet' | 'goat-testnet3' | 'bsc-mainnet'
type WalletMode    = 'generate' | 'import-key' | 'import-seed' | 'unlock'

const STEP_LABELS = [
  'Network', 'Wallet', 'Market', 'Asset',
  'Strategy', 'Backtest', 'Risk', 'Go Live'
]

const CRYPTO_SYMBOLS = [
  { symbol: 'BTC',  label: 'Bitcoin'   },
  { symbol: 'ETH',  label: 'Ethereum'  },
  { symbol: 'BNB',  label: 'BNB'       },
  { symbol: 'SOL',  label: 'Solana'    },
  { symbol: 'AVAX', label: 'Avalanche' },
  { symbol: 'LINK', label: 'Chainlink' },
  { symbol: 'DOGE', label: 'Dogecoin'  },
  { symbol: 'CAKE', label: 'PancakeSwap'},
]

const STRATEGY_TEMPLATES = [
  {
    name: 'BTC Adaptive',
    icon: '',
    desc: 'Auto-switches trend-follow ↔ mean-revert by regime',
    text: `Buy BTC with 8% when signal score is above 70 and RSI is below 60.
Sell BTC when signal score is below 35 or RSI exceeds 75.
Hold when regime is flat or drawdown exceeds 10%.`,
  },
  {
    name: 'RSI Mean Reversion',
    icon: '↔',
    desc: 'Buy oversold dips, sell overbought spikes',
    text: `Buy when RSI drops below 30 and BB%B below 20%.
Sell when RSI exceeds 70 and BB%B above 80%.
Hold when ADX is above 25 (trending market).`,
  },
  {
    name: 'Trend Follow',
    icon: '',
    desc: 'Ride strong trends with momentum confirmation',
    text: `Buy when MACD line crosses above signal and ADX is above 25.
Sell when MACD line crosses below signal.
Hold when regime is ranging or flat.`,
  },
  {
    name: 'Fear DCA',
    icon: '',
    desc: 'Accumulate during extreme fear (crypto only)',
    text: `Buy with 10% when Fear & Greed drops below 25.
Buy with 5% when Fear & Greed is below 35 and RSI below 40.
Sell 50% when Fear & Greed exceeds 75.`,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StepHeader({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-0 mb-5 overflow-x-auto pb-1">
      {STEP_LABELS.map((label, i) => {
        const num    = i + 1
        const done   = num < current
        const active = num === current
        return (
          <div key={label} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{
                  background: done ? 'var(--green)' : active ? 'var(--yellow)' : 'var(--bg3)',
                  color:      done ? '#003d1f'       : active ? '#000'         : 'var(--text3)',
                  border:     `1px solid ${done ? 'var(--green)' : active ? 'var(--yellow)' : 'var(--border)'}`,
                }}>
                {done ? '✓' : num}
              </div>
              <span className="font-mono text-[8px] hidden sm:block"
                style={{ color: active ? 'var(--yellow)' : done ? 'var(--green)' : 'var(--text3)' }}>
                {label}
              </span>
            </div>
            {i < total - 1 && (
              <div className="h-px w-6 mx-1 mb-3" style={{ background: done ? 'var(--green)' : 'var(--border)' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl p-5 ${className}`}
      style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[9px] uppercase tracking-widest mb-3" style={{ color: 'var(--text3)' }}>{children}</div>
}

function Btn({ children, onClick, variant = 'primary', disabled = false, className = '' }: {
  children: React.ReactNode; onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean; className?: string
}) {
  const styles = {
    primary:   { background: 'var(--yellow)',  color: '#000',           border: 'none' },
    secondary: { background: 'var(--bg3)',     color: 'var(--text2)',   border: '1px solid var(--border)' },
    ghost:     { background: 'transparent',    color: 'var(--text3)',   border: '1px solid var(--border)' },
  }
  return (
    <button onClick={onClick} disabled={disabled} className={`font-mono text-xs font-bold px-4 py-2.5 rounded-lg transition-opacity ${disabled ? 'opacity-40' : ''} ${className}`}
      style={styles[variant]}>
      {children}
    </button>
  )
}

function PwdInput({ label, value, onChange, placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--text3)' }}>{label}</div>
      <div className="flex gap-2">
        <input type={show ? 'text' : 'password'} value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className="flex-1 font-mono text-xs px-3 py-2 rounded-lg"
          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <button onClick={() => setShow(s => !s)} className="font-mono text-[10px] px-2 py-1 rounded"
          style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function OnboardingTab() {
  const goatStore = useGoatStore()
  const bscStore  = useAgentStore()

  // ── Wizard state ────────────────────────────────────────────────────────
  const [step,          setStep]          = useState(1)
  const [network,       setNetwork]       = useState<NetworkChoice>('goat-testnet3')
  const [marketType,    setMarketType]    = useState<MarketType>('crypto')
  const [selectedAsset, setSelectedAsset] = useState('BTC')
  const [strategy,      setStrategy]     = useState('')
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null)
  const [riskPreset,    setRiskPreset]   = useState<RiskPreset>('moderate')
  const [complete,      setComplete]     = useState(false)

  // ── Wallet state ─────────────────────────────────────────────────────────
  const isGoat       = network !== 'bsc-mainnet'
  const store        = isGoat ? goatStore : bscStore
  const walletLoaded = store.isWalletLoaded

  const [walletMode,  setWalletMode]  = useState<WalletMode>('generate')
  const [inputVal,    setInputVal]    = useState('')
  const [password,    setPassword]    = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [unlockPass,  setUnlockPass]  = useState('')
  const [generated,   setGenerated]   = useState<{ address: string; privateKey: string; mnemonic: string } | null>(null)
  const [walletError, setWalletError] = useState('')
  const [walletLoading, setWalletLoading] = useState(false)
  const [showSeed,    setShowSeed]    = useState(false)
  const [copied,      setCopied]      = useState('')

  // ── Backtest state ───────────────────────────────────────────────────────
  const [backtesting, setBacktesting] = useState(false)
  const [btError,     setBtError]     = useState('')

  // ── Error ─────────────────────────────────────────────────────────────────
  const [error, setError] = useState('')

  // Whether KEEPERHUB_API_KEY is configured server-side — drives the
  // per-network execution badges in Step 1 below (same check as Live Agent).
  const [keeperhubEnabled, setKeeperhubEnabled] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/health').then(r => r.json()).then(d => {
      if (!cancelled) setKeeperhubEnabled(!!d?.features?.keeperhub_execution)
    }).catch(() => { if (!cancelled) setKeeperhubEnabled(false) })
    return () => { cancelled = true }
  }, [])

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 1800)
  }

  // ── Wallet helpers ────────────────────────────────────────────────────────
  async function handleGenerateWallet() {
    const w = isGoat ? generateGoatWallet() : generateAgentWallet()
    setGenerated(w)
    setWalletMode('generate')
    setWalletError('')
  }

  async function handleSaveWallet() {
    if (!generated) return
    if (password.length < 8)        { setWalletError('Password must be at least 8 characters'); return }
    if (password !== confirmPass)    { setWalletError('Passwords do not match'); return }
    setWalletLoading(true)
    try {
      const enc = isGoat
        ? await encryptGoatPrivateKey(generated.privateKey, password)
        : await encryptPrivateKey(generated.privateKey, password)
      store.setEncryptedKey(enc)
      store.setWallet(generated.address, generated.privateKey)
      setGenerated(null); setPassword(''); setConfirmPass('')
    } catch (e: any) { setWalletError(e.message) }
    setWalletLoading(false)
  }

  async function handleImportWallet() {
    if (!inputVal.trim()) { setWalletError('Enter a private key or seed phrase'); return }
    if (password.length < 8) { setWalletError('Password must be at least 8 characters'); return }
    if (password !== confirmPass) { setWalletError('Passwords do not match'); return }
    setWalletLoading(true)
    try {
      const w = walletMode === 'import-key'
        ? (isGoat ? goatWalletFromPrivateKey(inputVal) : goatWalletFromPrivateKey(inputVal))
        : (isGoat ? goatWalletFromMnemonic(inputVal) : walletFromMnemonic(inputVal))
      const enc = isGoat
        ? await encryptGoatPrivateKey(w.privateKey, password)
        : await encryptPrivateKey(w.privateKey, password)
      store.setEncryptedKey(enc)
      store.setWallet(w.address, w.privateKey)
      setInputVal(''); setPassword(''); setConfirmPass('')
    } catch (e: any) { setWalletError('Invalid: ' + e.message) }
    setWalletLoading(false)
  }

  async function handleUnlockWallet() {
    if (!unlockPass) { setWalletError('Enter your password'); return }
    setWalletLoading(true)
    try {
      const pk = isGoat
        ? await decryptGoatPrivateKey(store.encryptedKey, unlockPass)
        : await decryptPrivateKey(store.encryptedKey, unlockPass)
      const { ethers } = await import('ethers')
      const w = new ethers.Wallet(pk)
      store.setWallet(w.address, pk)
      setUnlockPass('')
    } catch { setWalletError('Wrong password') }
    setWalletLoading(false)
  }

  // ── Backtest ─────────────────────────────────────────────────────────────
  async function runBacktest() {
    if (!strategy.trim()) { setBtError('Add a strategy first'); return }
    setBacktesting(true); setBtError('')
    try {
      const end   = Date.now()
      const start = end - 90 * 24 * 60 * 60 * 1000   // 90 days
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol:        selectedAsset,
          interval:      '1h',
          startTime:     start,
          endTime:       end,
          initialCapital: 1000,
          strategyText:  strategy,
          marketType,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setBacktestResult(data.result ?? data)
    } catch (e: any) {
      setBtError(e.message)
    }
    setBacktesting(false)
  }

  // ── Go live ───────────────────────────────────────────────────────────────
  function goLive() {
    const profile = RISK_PRESETS[riskPreset]
    goatStore.setRiskProfile(profile)
    bscStore.setRiskProfile(profile)
    goatStore.setMarketType(marketType)
    goatStore.setSelectedAsset(selectedAsset)
    if (isGoat) goatStore.setNetwork(network === 'goat-mainnet' ? 'mainnet' : 'testnet3')
    setComplete(true)
  }

  // ── Symbols for selected market ───────────────────────────────────────────
  const symbols = marketType === 'forex'  ? FOREX_SYMBOLS.map(s => ({ symbol: s.symbol, label: s.label }))
                : marketType === 'stocks' ? STOCKS_SYMBOLS.map(s => ({ symbol: s.symbol, label: s.label }))
                : marketType === 'meme'   ? MEME_SYMBOLS.map(s => ({ symbol: s.symbol, label: s.label }))
                : CRYPTO_SYMBOLS

  // ── Completion screen ─────────────────────────────────────────────────────
  if (complete) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col items-center gap-5 text-center">
        <div className="text-5xl"></div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>You're set up</h2>
        <p className="font-mono text-xs" style={{ color: 'var(--text3)' }}>
          Head to <strong style={{ color: 'var(--yellow)' }}>Live Agent</strong> in the sidebar to start your autonomous agent.
          Your risk profile, market, asset, and strategy are all saved.
        </p>
        <div className="grid grid-cols-2 gap-3 w-full text-left">
          {[
            { label: 'Network',    value: network },
            { label: 'Market',     value: marketType },
            { label: 'Asset',      value: selectedAsset },
            { label: 'Risk',       value: riskPreset },
          ].map(r => (
            <Card key={r.label}>
              <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>{r.label}</div>
              <div className="font-mono text-sm font-bold capitalize" style={{ color: 'var(--yellow)' }}>{r.value}</div>
            </Card>
          ))}
        </div>
        {network !== 'bsc-mainnet' && (
          <div className="font-mono text-[10px] px-3 py-2 rounded-lg"
            style={{
              background: keeperhubEnabled ? 'rgba(14,203,129,.06)' : 'rgba(240,185,11,.06)',
              border: `1px solid ${keeperhubEnabled ? 'rgba(14,203,129,.2)' : 'rgba(240,185,11,.2)'}`,
              color: keeperhubEnabled ? 'var(--green)' : 'var(--yellow)',
            }}>
            {keeperhubEnabled
              ? '● KeeperHub is configured — this agent will execute through KeeperHub.'
              : '○ KeeperHub is not configured — trades will simulate until KEEPERHUB_API_KEY is set.'}
          </div>
        )}
        <Btn onClick={() => setComplete(false)} variant="ghost">← Back to onboarding</Btn>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-6 flex flex-col gap-5">
      <div>
        <h2 className="text-base font-bold mb-0.5" style={{ color: 'var(--text)' }}>Set up your agent</h2>
        <p className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
          Complete all 7 steps to start autonomous trading
        </p>
      </div>

      <StepHeader current={step} total={STEP_LABELS.length} />

      {error && (
        <div className="rounded-lg px-4 py-2.5 font-mono text-[10px]"
          style={{ background: 'rgba(246,70,93,.07)', border: '1px solid rgba(246,70,93,.2)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {/* ── STEP 1: Network ──────────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <Label>Choose your network</Label>
          <div className="grid grid-cols-1 gap-2">
            {([
              {
                id: 'goat-testnet3', label: 'GOAT Testnet3', sub: 'chain ID 48816 · free test BTC · recommended for first run', icon: '🧪',
                keeperhub: keeperhubEnabled === null ? 'Checking KeeperHub…'
                  : keeperhubEnabled ? '● KeeperHub: live testnet execution (BTC transfers real, swaps simulated — no testnet DEX)'
                  : '○ KeeperHub: not configured — all trades simulate locally',
              },
              {
                id: 'goat-mainnet', label: 'GOAT Mainnet', sub: 'chain ID 2345 · real BTC gas · Uniswap V3 deployed', icon: '🟡',
                keeperhub: keeperhubEnabled === null ? 'Checking KeeperHub…'
                  : keeperhubEnabled ? '● KeeperHub: live execution (signs, gas-estimates, broadcasts real trades)'
                  : '⚠ KeeperHub not configured — mainnet trades will be blocked until KEEPERHUB_API_KEY is set',
              },
              {
                id: 'bsc-mainnet', label: 'BSC Mainnet', sub: 'chain ID 56 · BNB gas · PancakeSwap V2', icon: '🔶',
                keeperhub: '○ Not on KeeperHub — signs locally with the agent wallet',
              },
            ] as const).map(n => (
              <button key={n.id} onClick={() => setNetwork(n.id)}
                className="flex items-start gap-3 rounded-lg p-4 text-left transition-all"
                style={{
                  background:  network === n.id ? 'rgba(240,185,11,.06)' : 'var(--bg3)',
                  border:      `${network === n.id ? 2 : 1}px solid ${network === n.id ? 'var(--yellow)' : 'var(--border)'}`,
                }}>
                <span className="text-xl shrink-0 mt-0.5">{n.icon}</span>
                <div>
                  <div className="font-bold text-sm mb-0.5" style={{ color: network === n.id ? 'var(--yellow)' : 'var(--text)' }}>{n.label}</div>
                  <div className="font-mono text-[10px] mb-1" style={{ color: 'var(--text3)' }}>{n.sub}</div>
                  <div className="font-mono text-[10px]" style={{ color: n.keeperhub.startsWith('⚠') ? 'var(--red)' : n.keeperhub.startsWith('●') ? 'var(--green)' : 'var(--text3)' }}>
                    {n.keeperhub}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Btn onClick={() => setStep(2)}>Continue →</Btn>
          </div>
        </Card>
      )}

      {/* ── STEP 2: Wallet ───────────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <Label>Agent wallet</Label>
          {walletLoaded ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg p-3 flex items-center justify-between gap-2"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--text3)' }}>Wallet loaded</div>
                  <code className="font-mono text-xs break-all" style={{ color: 'var(--green)' }}>{store.agentAddress}</code>
                </div>
                <button onClick={() => copy(store.agentAddress, 'addr')}
                  className="font-mono text-[10px] px-2 py-1 rounded shrink-0"
                  style={{ background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
                  {copied === 'addr' ? 'Copied' : 'Copy'}
                </button>
              </div>
              {walletError && <div className="font-mono text-[10px]" style={{ color: 'var(--red)' }}>{walletError}</div>}
              <div className="flex gap-2 justify-between">
                <Btn variant="ghost" onClick={() => setStep(1)}>← Back</Btn>
                <Btn onClick={() => setStep(3)}>Continue →</Btn>
              </div>
            </div>
          ) : store.encryptedKey ? (
            <div className="flex flex-col gap-3">
              <div className="font-mono text-[10px] mb-1" style={{ color: 'var(--text3)' }}>Wallet found — unlock to continue</div>
              <PwdInput label="Password" value={unlockPass} onChange={setUnlockPass} placeholder="Your wallet password" />
              {walletError && <div className="font-mono text-[10px]" style={{ color: 'var(--red)' }}>{walletError}</div>}
              <div className="flex gap-2 justify-between">
                <Btn variant="ghost" onClick={() => setStep(1)}>← Back</Btn>
                <Btn onClick={handleUnlockWallet} disabled={walletLoading}>{walletLoading ? 'Unlocking…' : 'Unlock'}</Btn>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Mode picker */}
              <div className="flex gap-2 flex-wrap">
                {(['generate', 'import-key', 'import-seed'] as WalletMode[]).map(m => (
                  <button key={m} onClick={() => { setWalletMode(m); setGenerated(null); setWalletError('') }}
                    className="font-mono text-[10px] px-3 py-1.5 rounded-full"
                    style={{
                      background: walletMode === m ? 'var(--yellow)' : 'var(--bg3)',
                      color:      walletMode === m ? '#000' : 'var(--text2)',
                      border:     '1px solid var(--border)',
                    }}>
                    {m === 'generate' ? '⚡ Generate new' : m === 'import-key' ? ' Private key' : 'Seed phrase'}
                  </button>
                ))}
              </div>

              {/* Generate flow */}
              {walletMode === 'generate' && !generated && (
                <Btn onClick={handleGenerateWallet}>Generate wallet</Btn>
              )}
              {walletMode === 'generate' && generated && (
                <div className="flex flex-col gap-3">
                  <div className="rounded-lg p-3" style={{ background: 'rgba(246,70,93,.06)', border: '1px solid rgba(246,70,93,.15)' }}>
                    <div className="font-mono text-[10px] font-bold" style={{ color: 'var(--red)' }}>⚠ Back up your seed phrase before continuing</div>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>Address</div>
                    <div className="flex gap-2 items-center">
                      <code className="font-mono text-xs flex-1 break-all" style={{ color: 'var(--text)' }}>{generated.address}</code>
                      <button onClick={() => copy(generated.address, 'gen-addr')} className="font-mono text-[10px] px-2 py-1 rounded shrink-0" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>
                        {copied === 'gen-addr' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>Seed phrase</div>
                    <div className="flex gap-2 items-start">
                      <code className="font-mono text-xs flex-1 break-all p-2 rounded-lg" style={{ background: 'var(--bg3)', color: 'var(--text)' }}>
                        {showSeed ? generated.mnemonic : '•'.repeat(48)}
                      </code>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button onClick={() => setShowSeed(s => !s)} className="font-mono text-[10px] px-2 py-1 rounded" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>{showSeed ? 'Hide' : 'Show'}</button>
                        <button onClick={() => copy(generated.mnemonic, 'seed')} className="font-mono text-[10px] px-2 py-1 rounded" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>{copied === 'seed' ? 'Copied' : 'Copy'}</button>
                      </div>
                    </div>
                  </div>
                  <PwdInput label="Password (min 8 chars)" value={password} onChange={setPassword} />
                  <PwdInput label="Confirm password" value={confirmPass} onChange={setConfirmPass} />
                  {walletError && <div className="font-mono text-[10px]" style={{ color: 'var(--red)' }}>{walletError}</div>}
                  <Btn onClick={handleSaveWallet} disabled={walletLoading}>{walletLoading ? 'Saving…' : 'Save & continue'}</Btn>
                </div>
              )}

              {/* Import flow */}
              {(walletMode === 'import-key' || walletMode === 'import-seed') && (
                <div className="flex flex-col gap-3">
                  {walletMode === 'import-key'
                    ? <PwdInput label="Private key (0x...)" value={inputVal} onChange={setInputVal} placeholder="0x..." />
                    : (
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--text3)' }}>Seed phrase</div>
                        <textarea rows={3} value={inputVal} onChange={e => setInputVal(e.target.value)}
                          placeholder="word1 word2 word3 ..."
                          className="w-full font-mono text-xs px-3 py-2 rounded-lg resize-none"
                          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                      </div>
                    )
                  }
                  <PwdInput label="Encrypt with password (min 8 chars)" value={password} onChange={setPassword} />
                  <PwdInput label="Confirm password" value={confirmPass} onChange={setConfirmPass} />
                  {walletError && <div className="font-mono text-[10px]" style={{ color: 'var(--red)' }}>{walletError}</div>}
                  <Btn onClick={handleImportWallet} disabled={walletLoading}>{walletLoading ? 'Importing…' : 'Import & continue'}</Btn>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ── STEP 3: Market type ──────────────────────────────────────────── */}
      {step === 3 && (
        <Card>
          <Label>What do you want to trade?</Label>
          <div className="grid grid-cols-2 gap-3">
            {([
              { type: 'crypto', icon: '', label: 'Crypto',     sub: 'BTC, ETH, altcoins — live execution on GOAT / BSC'    },
              { type: 'forex',  icon: '', label: 'Forex',      sub: 'EUR/USD, GBP/USD — signals via Twelve Data'           },
              { type: 'stocks', icon: '', label: 'Stocks',     sub: 'AAPL, TSLA, NVDA — signals via Twelve Data'           },
              { type: 'meme',   icon: '', label: 'Meme coins', sub: 'PEPE, BONK, DOGE — high volatility, tight risk'      },
            ] as { type: MarketType; icon: string; label: string; sub: string }[]).map(m => (
              <button key={m.type} onClick={() => { setMarketType(m.type); setSelectedAsset(
                m.type === 'forex' ? 'EUR/USD' : m.type === 'stocks' ? 'AAPL' : m.type === 'meme' ? 'PEPE' : 'BTC'
              )}}
                className="rounded-xl p-4 text-left transition-all"
                style={{
                  background: marketType === m.type ? 'rgba(240,185,11,.06)' : 'var(--bg3)',
                  border: `${marketType === m.type ? 2 : 1}px solid ${marketType === m.type ? 'var(--yellow)' : 'var(--border)'}`,
                }}>
                <div className="text-2xl mb-2">{m.icon}</div>
                <div className="font-bold text-sm mb-1" style={{ color: marketType === m.type ? 'var(--yellow)' : 'var(--text)' }}>{m.label}</div>
                <div className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>{m.sub}</div>
              </button>
            ))}
          </div>
          {(marketType === 'forex' || marketType === 'stocks') && !process.env.NEXT_PUBLIC_HAS_TWELVE_DATA && (
            <div className="mt-3 rounded-lg p-3 font-mono text-[10px]"
              style={{ background: 'rgba(240,185,11,.06)', border: '1px solid rgba(240,185,11,.2)', color: 'var(--yellow)' }}>
              Requires TWELVE_DATA_API_KEY in .env.local (see Session 4 README)
            </div>
          )}
          <div className="mt-4 flex gap-2 justify-between">
            <Btn variant="ghost" onClick={() => setStep(2)}>← Back</Btn>
            <Btn onClick={() => setStep(4)}>Continue →</Btn>
          </div>
        </Card>
      )}

      {/* ── STEP 4: Asset ────────────────────────────────────────────────── */}
      {step === 4 && (
        <Card>
          <Label>Select asset to trade</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {symbols.map(s => (
              <button key={s.symbol} onClick={() => setSelectedAsset(s.symbol)}
                className="rounded-lg p-3 text-left transition-all"
                style={{
                  background: selectedAsset === s.symbol ? 'rgba(240,185,11,.08)' : 'var(--bg3)',
                  border: `${selectedAsset === s.symbol ? 2 : 1}px solid ${selectedAsset === s.symbol ? 'var(--yellow)' : 'var(--border)'}`,
                }}>
                <div className="font-mono text-xs font-bold" style={{ color: selectedAsset === s.symbol ? 'var(--yellow)' : 'var(--text)' }}>{s.symbol}</div>
                <div className="font-mono text-[9px] mt-0.5" style={{ color: 'var(--text3)' }}>{s.label}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2 justify-between">
            <Btn variant="ghost" onClick={() => setStep(3)}>← Back</Btn>
            <Btn onClick={() => setStep(5)}>Continue →</Btn>
          </div>
        </Card>
      )}

      {/* ── STEP 5: Strategy ─────────────────────────────────────────────── */}
      {step === 5 && (
        <Card>
          <Label>Choose or build a strategy</Label>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {STRATEGY_TEMPLATES.map(t => (
              <button key={t.name} onClick={() => setStrategy(t.text)}
                className="rounded-lg p-3 text-left transition-all"
                style={{
                  background: strategy === t.text ? 'rgba(240,185,11,.08)' : 'var(--bg3)',
                  border: `${strategy === t.text ? 2 : 1}px solid ${strategy === t.text ? 'var(--yellow)' : 'var(--border)'}`,
                }}>
                <div className="text-base mb-1">{t.icon}</div>
                <div className="font-mono text-[10px] font-bold mb-0.5" style={{ color: strategy === t.text ? 'var(--yellow)' : 'var(--text)' }}>{t.name}</div>
                <div className="font-mono text-[9px]" style={{ color: 'var(--text3)' }}>{t.desc}</div>
              </button>
            ))}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--text3)' }}>
            Or write your own
          </div>
          <textarea rows={5} value={strategy} onChange={e => setStrategy(e.target.value)}
            placeholder={`Buy ${selectedAsset} with 8% when RSI drops below 30 and MACD is bullish.\nSell ${selectedAsset} when RSI exceeds 70.\nHold when regime is flat.`}
            className="w-full font-mono text-xs px-3 py-2 rounded-lg resize-none"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <div className="mt-4 flex gap-2 justify-between">
            <Btn variant="ghost" onClick={() => setStep(4)}>← Back</Btn>
            <Btn onClick={() => setStep(6)} disabled={!strategy.trim()}>Continue →</Btn>
          </div>
        </Card>
      )}

      {/* ── STEP 6: Backtest ─────────────────────────────────────────────── */}
      {step === 6 && (
        <Card>
          <Label>Backtest your strategy</Label>
          <div className="font-mono text-[10px] mb-4" style={{ color: 'var(--text3)' }}>
            90-day backtest on <strong style={{ color: 'var(--text)' }}>{selectedAsset}</strong> (1h candles, $1,000 starting capital)
          </div>

          {!backtestResult && !backtesting && (
            <div className="flex flex-col gap-3">
              {btError && <div className="font-mono text-[10px]" style={{ color: 'var(--red)' }}>{btError}</div>}
              <Btn onClick={runBacktest}>Run backtest</Btn>
              <Btn variant="ghost" onClick={() => setStep(7)}>Skip backtest →</Btn>
            </div>
          )}

          {backtesting && (
            <div className="font-mono text-xs text-center py-6" style={{ color: 'var(--text3)' }}>
              Running 90-day backtest on {selectedAsset}…
            </div>
          )}

          {backtestResult && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Return',       value: `${backtestResult.totalReturn >= 0 ? '+' : ''}${backtestResult.totalReturn?.toFixed(1)}%`, color: (backtestResult.totalReturn ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' },
                  { label: 'Max drawdown', value: `${backtestResult.maxDrawdown?.toFixed(1)}%`,  color: 'var(--red)'    },
                  { label: 'Win rate',     value: `${backtestResult.winRate?.toFixed(0)}%`,         color: 'var(--yellow)' },
                  { label: 'Sharpe',       value: backtestResult.sharpeRatio?.toFixed(2) ?? '—',    color: 'var(--text)'   },
                  { label: 'Trades',       value: backtestResult.totalTrades?.toString() ?? '0',    color: 'var(--text)'   },
                  { label: 'Profit factor',value: backtestResult.profitFactor?.toFixed(2) ?? '—',   color: 'var(--text)'   },
                ].map(r => (
                  <div key={r.label} className="rounded-lg p-3" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                    <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>{r.label}</div>
                    <div className="font-mono text-sm font-bold" style={{ color: r.color }}>{r.value}</div>
                  </div>
                ))}
              </div>
              {btError && <div className="font-mono text-[10px]" style={{ color: 'var(--red)' }}>{btError}</div>}
            </div>
          )}

          <div className="mt-4 flex gap-2 justify-between">
            <Btn variant="ghost" onClick={() => setStep(5)}>← Back</Btn>
            <Btn onClick={() => setStep(7)}>Continue →</Btn>
          </div>
        </Card>
      )}

      {/* ── STEP 7: Risk ─────────────────────────────────────────────────── */}
      {step === 7 && (
        <Card>
          <Label>Set your risk profile</Label>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {(Object.keys(RISK_PRESETS) as RiskPreset[]).map(preset => {
              const p = RISK_PRESETS[preset]
              const active = riskPreset === preset
              const color = preset === 'conservative' ? 'var(--blue)' : preset === 'moderate' ? 'var(--yellow)' : 'var(--red)'
              return (
                <button key={preset} onClick={() => setRiskPreset(preset)}
                  className="rounded-xl p-4 text-left"
                  style={{
                    background: active ? 'rgba(240,185,11,.06)' : 'var(--bg3)',
                    border: `${active ? 2 : 1}px solid ${active ? color : 'var(--border)'}`,
                  }}>
                  <div className="font-bold text-sm capitalize mb-2" style={{ color }}>{preset}</div>
                  {[
                    { k: 'Drawdown', v: `${p.maxDrawdownPct}%` },
                    { k: 'Position', v: `${p.maxPositionPct}%` },
                    { k: 'Trades/day', v: `${p.maxDailyTrades}` },
                  ].map(r => (
                    <div key={r.k} className="flex justify-between font-mono text-[9px]" style={{ color: 'var(--text3)' }}>
                      <span>{r.k}</span><span style={{ color: 'var(--text2)' }}>{r.v}</span>
                    </div>
                  ))}
                </button>
              )
            })}
          </div>
          <div className="font-mono text-[10px] mb-4" style={{ color: 'var(--text3)' }}>
            You can adjust this anytime in the <strong style={{ color: 'var(--text)' }}>Risk Profile</strong> tab.
          </div>
          <div className="flex gap-2 justify-between">
            <Btn variant="ghost" onClick={() => setStep(6)}>← Back</Btn>
            <Btn onClick={() => { setStep(8); goLive() }}>Go Live </Btn>
          </div>
        </Card>
      )}

      {/* Step 8 handled by `complete` screen above */}
    </div>
  )
}