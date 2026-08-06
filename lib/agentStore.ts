/**
 * lib/agentStore.ts — Session I (Bug Fix Release)
 *
 * Fixes applied:
 * - Bug 1: Added activeTab / setActiveTab so tab selection survives re-mounts.
 *   Previously CompetitionTab used local useState which reset to 'overview' on
 *   every parent re-render / unmount cycle.
 *
 * Everything else is preserved from Session H.
 */

import { create }                     from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AgentConfig }           from './twak/client'
import { DEFAULT_AGENT_CONFIG }       from './twak/client'
import type { RiskProfile }           from './agentLoop'
import { RISK_PRESETS }               from './agentLoop'

export type AgentNetwork = 'mainnet' | 'testnet'

export const NETWORK_LABELS: Record<AgentNetwork, string> = {
  mainnet: 'BSC Mainnet',
  testnet: 'BSC Testnet',
}

export interface TradeRecord {
  id:          string
  timestamp:   number
  symbol:      string
  side:        'BUY' | 'SELL'
  amountUSDT:  number
  price:       number
  txHash:      string
  pnlUSDT?:    number
  dryRun:      boolean
  status:      'pending' | 'confirmed' | 'failed'
  signalScore: number
  reasoning:   string
}

export interface AgentSession {
  startedAt:        number
  startValueUSDT:   number
  currentValueUSDT: number
  peakValueUSDT:    number
  drawdownPct:      number
  riskProfile:      RiskProfile
  marketType:       'crypto' | 'forex' | 'stocks' | 'meme'
  network:          'goat-mainnet' | 'goat-testnet' | 'bsc-mainnet' | 'bsc-testnet'
  totalTrades:      number
  todayTrades:      number
  lastRunAt:        number | null
  status:           'idle' | 'running' | 'paused' | 'error'
  // Legacy TWAK/BSC competition-registration fields — read by the old
  // "Competition Compliance" hackathon report in lib/exportUtils.ts and
  // the on-chain check in app/api/agent/status/route.ts, but nothing
  // currently writes them onto the session object, so they're always
  // undefined in practice. Optional here reflects that reality. See note
  // below on retiring this along with the rest of the competition stack.
  isRegistered?:    boolean
  registrationTx?:  string
}

export interface StrategyRule {
  id:           string
  symbol:       string
  condition:    any
  action:       'BUY' | 'SELL' | 'HOLD'
  sizePct:      number
  priority:     number
  cooldownMs:   number
  lastFiredAt?: number
  reasoning?:   string
}

// Bug 1 fix: tab type lives here so it persists across re-mounts
export type CompetitionTab = 'overview' | 'trades' | 'decisions'

interface AgentStore {
  // ── Network ───────────────────────────────────────────────────────────────
  network:    AgentNetwork
  setNetwork: (n: AgentNetwork) => void

  // ── Wallet (session-only — never persisted) ───────────────────────────────
  agentAddress:    string
  privateKey:      string
  encryptedKey:    string
  isWalletLoaded:  boolean
  bnbBalance:      number
  usdtBalance:     number

  setWallet:       (address: string, privateKey: string) => void
  setEncryptedKey: (enc: string) => void
  clearWallet:     () => void
  setBNBBalance:   (bal: number) => void
  setUSDTBalance:  (bal: number) => void

  // ── Agent config ──────────────────────────────────────────────────────────
  agentConfig:    AgentConfig
  setAgentConfig:  (cfg: Partial<AgentConfig>) => void
  riskProfile:     RiskProfile
  setRiskProfile:  (p: RiskProfile) => void

  // ── Session ───────────────────────────────────────────────────────────────
  session:       AgentSession | null
  initSession:   (startUSDT: number) => void
  updateSession: (updates: Partial<AgentSession>) => void
  resetSession:  () => void

  // ── Trade log ─────────────────────────────────────────────────────────────
  trades:      TradeRecord[]
  addTrade:    (trade: TradeRecord) => void
  updateTrade: (id: string, updates: Partial<TradeRecord>) => void
  clearTrades: () => void

  // ── Signal cache ──────────────────────────────────────────────────────────
  lastSignals: Record<string, {
    score: number; dir: 'BUY' | 'SELL' | 'HOLD'; reasoning: string; ts: number
  }>
  setSignal: (symbol: string, score: number, dir: 'BUY'|'SELL'|'HOLD', reasoning: string) => void

  // ── Strategy ──────────────────────────────────────────────────────────────
  strategyText:   string
  strategyParsed: StrategyRule[]
  setStrategy:    (text: string, rules: StrategyRule[]) => void

  // ── Bug 1 fix: Competition tab selection persisted in store ───────────────
  activeCompetitionTab:    CompetitionTab
  setActiveCompetitionTab: (tab: CompetitionTab) => void
}

const DEFAULT_SESSION: AgentSession = {
  startedAt:        Date.now(),
  startValueUSDT:   0,
  currentValueUSDT: 0,
  peakValueUSDT:    0,
  drawdownPct:      0,
  riskProfile:      RISK_PRESETS.moderate,
  marketType:       'crypto' as const,
  network:          'bsc-mainnet' as const,
  totalTrades:      0,
  todayTrades:      0,
  lastRunAt:        null,
  status:           'idle',
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set) => ({
      // ── Network ────────────────────────────────────────────────────────
      network:    'testnet',
      setNetwork: (n) => set({ network: n }),

      // ── Wallet ─────────────────────────────────────────────────────────
      agentAddress:   '',
      privateKey:     '',
      encryptedKey:   '',
      isWalletLoaded: false,
      bnbBalance:     0,
      usdtBalance:    0,

      setWallet:       (address, privateKey) =>
        set({ agentAddress: address, privateKey, isWalletLoaded: true }),
      setEncryptedKey: (enc) => set({ encryptedKey: enc }),
      clearWallet:     () =>
        set({ agentAddress: '', privateKey: '', isWalletLoaded: false, bnbBalance: 0, usdtBalance: 0 }),
      setBNBBalance:   (bal) => set({ bnbBalance: bal }),
      setUSDTBalance:  (bal) => set({ usdtBalance: bal }),

      // ── Agent config ────────────────────────────────────────────────────
      agentConfig: DEFAULT_AGENT_CONFIG,
      setAgentConfig: (cfg) =>
        set(s => ({ agentConfig: { ...s.agentConfig, ...cfg } })),
      riskProfile:    RISK_PRESETS.moderate,
      setRiskProfile: (p) => set({ riskProfile: p }),

      // ── Session ─────────────────────────────────────────────────────────
      session: null,

      initSession: (startUSDT) => {
        // Wipe localStorage first so the persisted session (which may have a
        // stale peakValueUSDT from a previous run) is fully replaced.
        // Without this, Zustand rehydrates the old peak on page load and
        // the route receives peakUSD=100 / startUSD=1 → drawdownPct=99%.
        if (typeof window !== 'undefined') {
          localStorage.removeItem('binalyst-agent')
        }
        set({
          session: {
            ...DEFAULT_SESSION,
            startedAt:        Date.now(),
            startValueUSDT:   startUSDT,
            currentValueUSDT: startUSDT,
            peakValueUSDT:    startUSDT,
          },
          trades: [],   // clear old trades so they don't show against new session
        })
      },

      updateSession: (updates) =>
        set(s => ({
          session: s.session ? { ...s.session, ...updates } : null,
        })),

      resetSession: () => {
        if (typeof window !== 'undefined') localStorage.removeItem('binalyst-agent')
        set({ session: null, trades: [] })
      },

      // ── Trade log ────────────────────────────────────────────────────────
      trades: [],

      addTrade: (trade) =>
        set(s => ({ trades: [trade, ...s.trades].slice(0, 500) })),

      updateTrade: (id, updates) =>
        set(s => ({
          trades: s.trades.map(t => t.id === id ? { ...t, ...updates } : t),
        })),

      clearTrades: () => set({ trades: [] }),

      // ── Signal cache ─────────────────────────────────────────────────────
      lastSignals: {},
      setSignal: (symbol, score, dir, reasoning) =>
        set(s => ({
          lastSignals: {
            ...s.lastSignals,
            [symbol]: { score, dir, reasoning, ts: Date.now() },
          },
        })),

      // ── Strategy ─────────────────────────────────────────────────────────
      strategyText:   '',
      strategyParsed: [],
      setStrategy:    (text, rules) => set({ strategyText: text, strategyParsed: rules }),

      // ── Bug 1 fix: tab selection ──────────────────────────────────────────
      activeCompetitionTab:    'overview',
      setActiveCompetitionTab: (tab) => set({ activeCompetitionTab: tab }),
    }),
    {
      name:    'binalyst-agent',
      storage: createJSONStorage(() => {
        // SSR guard — localStorage not available on server
        if (typeof window === 'undefined') {
          return {
            getItem:    () => null,
            setItem:    () => {},
            removeItem: () => {},
          }
        }
        return localStorage
      }),
      // CRITICAL: never persist privateKey
      partialize: (s) => ({
        network:                 s.network,
        agentAddress:            s.agentAddress,
        encryptedKey:            s.encryptedKey,
        agentConfig:             s.agentConfig,
        session:                 s.session,
        trades:                  s.trades.slice(0, 100),
        lastSignals:             s.lastSignals,
        strategyText:            s.strategyText,
        strategyParsed:          s.strategyParsed,
        activeCompetitionTab:    s.activeCompetitionTab,
      }),
    }
  )
)