/**
 * lib/goat/store.ts — Session 2
 *
 * Zustand store for the GOAT Network agent.
 * Fully parallel to lib/agentStore.ts (BSC agent) — separate
 * persistence key, separate wallet, separate trade log.
 * Private key is NEVER persisted.
 */

import { create }              from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { GoatNetwork }    from './config'
import { GOAT_AGENT_DEFAULTS } from './config'
import type { RiskProfile }    from '../agentLoop'
import { RISK_PRESETS }        from '../agentLoop'

export type GoatLoopStatus = 'idle' | 'running' | 'paused' | 'error'
export type MarketType     = 'crypto' | 'forex' | 'stocks' | 'meme'

export interface X402Payment {
  paymentId:  string
  serviceTag: string
  asset:      string
  amount:     string
  to:         string
  status:     string
  authorised: boolean
  timestamp:  number
}

export interface GoatTrade {
  id:          string
  timestamp:   number
  symbol:      string
  side:        'buy' | 'sell'
  amountUSD:   number
  txHash:      string
  status:      'confirmed' | 'failed' | 'simulated' | 'blocked'
  pnlUSD:      number
  marketType:  MarketType
  reason?:     string
}

export interface GoatSession {
  startedAt:     number
  startValueUSD: number
  peakValueUSD:  number
  currentUSD:    number
  drawdownPct:   number
  totalTrades:   number
  todayTrades:   number
  lastRunAt:     number | null
  status:        GoatLoopStatus
  marketType:    MarketType
  network:       GoatNetwork
  riskProfile:   RiskProfile
}

const DEFAULT_SESSION: Omit<GoatSession, 'startedAt'> = {
  startValueUSD: 0,
  peakValueUSD:  0,
  currentUSD:    0,
  drawdownPct:   0,
  totalTrades:   0,
  todayTrades:   0,
  lastRunAt:     null,
  status:        'idle',
  marketType:    'crypto',
  network:       GOAT_AGENT_DEFAULTS.DEFAULT_NETWORK,
  riskProfile:   RISK_PRESETS.moderate,
}

interface GoatStore {
  // ── Network ────────────────────────────────────────────────────────────────
  network:    GoatNetwork
  setNetwork: (n: GoatNetwork) => void

  // ── Wallet (never persisted) ───────────────────────────────────────────────
  agentAddress:   string
  privateKey:     string
  encryptedKey:   string
  isWalletLoaded: boolean
  btcBalance:     number
  portfolioUSD:   number

  setWallet:        (address: string, pk: string) => void
  setEncryptedKey:  (enc: string) => void
  clearWallet:      () => void
  setBtcBalance:    (bal: number) => void
  setPortfolioUSD:  (usd: number) => void

  // ── Market config ──────────────────────────────────────────────────────────
  marketType:    MarketType
  selectedAsset: string
  riskProfile:   RiskProfile

  setMarketType:    (t: MarketType) => void
  setSelectedAsset: (s: string) => void
  setRiskProfile:   (p: RiskProfile) => void

  // ── Execution mode ────────────────────────────────────────────────────────
  // Single source of truth for dry-run vs live, read by both the loop hook
  // (what it sends to /api/goat/loop) and the LiveAgentTab toggle (what the
  // user sees/sets) — previously these were disconnected (see Session 9 fix).
  dryRun:    boolean
  setDryRun: (v: boolean) => void

  // ── Always-buy rule ───────────────────────────────────────────────────────
  // A fixed-size buy that fires every cycle regardless of signal score —
  // e.g. "always buy BTC 5% of portfolio" — independent of the actionable
  // signal filter (MIN_SIGNAL_SCORE) in app/api/goat/loop/route.ts. Still
  // subject to the same guardrails (gas reserve, drawdown, daily limit).
  alwaysBuyEnabled: boolean
  alwaysBuySymbol:  string
  alwaysBuyPct:     number
  setAlwaysBuyRule: (r: { enabled: boolean; symbol: string; pct: number }) => void

  // ── Session ────────────────────────────────────────────────────────────────
  session:       GoatSession | null
  initSession:   (startUSD: number) => void
  updateSession: (u: Partial<GoatSession>) => void
  resetSession:  () => void

  // ── ERC-8004 identity ─────────────────────────────────────────────────────
  agentId:          string | null
  agentURI:         string | null
  setAgentIdentity: (agentId: string, agentURI: string) => void

  // ── x402 payments ──────────────────────────────────────────────────────────
  x402Payments:    X402Payment[]
  addX402Payment:  (p: X402Payment) => void
  totalX402USD:    number
  addX402Spent:    (usd: number) => void

  // ── Trade log ──────────────────────────────────────────────────────────────
  trades:      GoatTrade[]
  addTrade:    (t: GoatTrade) => void
  clearTrades: () => void
}

export const useGoatStore = create<GoatStore>()(
  persist(
    (set, get) => ({
      // ── Network ──────────────────────────────────────────────────────────
      network:    GOAT_AGENT_DEFAULTS.DEFAULT_NETWORK,
      setNetwork: (n) => set({ network: n }),

      // ── Wallet ───────────────────────────────────────────────────────────
      agentAddress:   '',
      privateKey:     '',
      encryptedKey:   '',
      isWalletLoaded: false,
      btcBalance:     0,
      portfolioUSD:   0,

      setWallet:       (address, privateKey) => set({ agentAddress: address, privateKey, isWalletLoaded: true }),
      setEncryptedKey: (enc) => set({ encryptedKey: enc }),
      clearWallet:     () => set({ agentAddress: '', privateKey: '', isWalletLoaded: false, btcBalance: 0, portfolioUSD: 0 }),
      setBtcBalance:   (bal) => set({ btcBalance: bal }),
      setPortfolioUSD: (usd) => set({ portfolioUSD: usd }),

      // ── Market config ─────────────────────────────────────────────────────
      marketType:    'crypto',
      selectedAsset: 'BTC/USDT',
      riskProfile:   RISK_PRESETS.moderate,

      setMarketType:    (t) => set({ marketType: t }),
      setSelectedAsset: (s) => set({ selectedAsset: s }),
      setRiskProfile:   (p) => set({ riskProfile: p }),

      // ── Execution mode ───────────────────────────────────────────────────
      dryRun:    true,   // safe by default — user must explicitly flip to live
      setDryRun: (v) => set({ dryRun: v }),

      // ── Always-buy rule ──────────────────────────────────────────────────
      alwaysBuyEnabled: false,
      alwaysBuySymbol:  'BTC',
      alwaysBuyPct:     5,
      setAlwaysBuyRule: (r) => set({ alwaysBuyEnabled: r.enabled, alwaysBuySymbol: r.symbol, alwaysBuyPct: r.pct }),

      // ── Session ───────────────────────────────────────────────────────────
      session: null,

      initSession: (startUSD) => set({
        session: {
          ...DEFAULT_SESSION,
          startedAt:     Date.now(),
          startValueUSD: startUSD,
          peakValueUSD:  startUSD,
          currentUSD:    startUSD,
          network:       get().network,
          marketType:    get().marketType,
          riskProfile:   get().riskProfile,
        },
      }),

      updateSession: (u) => set(s => ({
        session: s.session ? { ...s.session, ...u } : null,
      })),

      resetSession: () => set({ session: null, trades: [] }),

      // ── ERC-8004 identity ─────────────────────────────────────────────────
      agentId:          null,
      agentURI:         null,
      setAgentIdentity: (agentId, agentURI) => set({ agentId, agentURI }),

      // ── x402 payments ──────────────────────────────────────────────────────
      x402Payments:   [],
      totalX402USD:   0,
      addX402Payment: (p) => set(s => ({ x402Payments: [p, ...s.x402Payments].slice(0, 200) })),
      addX402Spent:   (usd) => set(s => ({ totalX402USD: (s.totalX402USD ?? 0) + usd })),

      // ── Trade log ─────────────────────────────────────────────────────────
      trades:      [],
      addTrade:    (t) => set(s => ({ trades: [t, ...s.trades].slice(0, 500) })),
      clearTrades: () => set({ trades: [] }),
    }),
    {
      name:    'binalyst-goat-agent',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : {
          getItem: () => null, setItem: () => {}, removeItem: () => {},
        }
      ),
      // NEVER persist privateKey
      partialize: (s) => ({
        network:        s.network,
        agentAddress:   s.agentAddress,
        encryptedKey:   s.encryptedKey,
        marketType:     s.marketType,
        selectedAsset:  s.selectedAsset,
        riskProfile:    s.riskProfile,
        dryRun:         s.dryRun,
        alwaysBuyEnabled: s.alwaysBuyEnabled,
        alwaysBuySymbol:  s.alwaysBuySymbol,
        alwaysBuyPct:     s.alwaysBuyPct,
        session:        s.session,
        trades:         s.trades.slice(0, 100),
        agentId:        s.agentId,
        agentURI:       s.agentURI,
        x402Payments:   s.x402Payments.slice(0, 50),
        totalX402USD:   s.totalX402USD,
      }),
    }
  )
)
