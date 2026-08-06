/**
 * lib/skills/index.ts
 * Unified Skills Hub — Session J update.
 *
 * Exports:
 *   - All Binance Web3 skills (unchanged from previous sessions)
 *   - Bitget technical-analysis skill (new — Session J)
 *
 * Usage:
 *   import { getTechnicalSnapshot, bitgetSkills } from '@/lib/skills'
 *   import { queryMarketRank }                    from '@/lib/skills'
 */

// ── Binance Web3 skills (re-exported unchanged) ────────────────────────────
export {
  CHAIN_IDS,
  queryTokenInfo,
  queryTokenMeta,
  queryTokenKlines,
  queryTokenAudit,
  queryAddressInfo,
  queryAddressTokens,
  queryMarketRank,
  queryMemeRush,
  queryAlphaTokens,
  queryAlphaAirdrops,
  postToSquare,
  chainNameToId,
  riskLevel,
} from './index.binance'

// ── Bitget technical-analysis skill (Session J) ────────────────────────────
export {
  fetchCandles,
  getTechnicalSnapshot,
  getBatchTechnicals,
  bitgetSkills,
  BitgetSkillHub,
} from './bitget-technicals'

export type {
  Candle,
  MarketRegime,
  TechnicalSnapshot,
  TrendIndicators,
  MomentumIndicators,
  VolatilityIndicators,
  VolumeIndicators,
  OscillatorIndicators,
  StructureIndicators,
  TechnicalSummary,
} from './bitget-technicals'

// ── CMC skill (re-exported for convenience) ────────────────────────────────
export {
  getFearAndGreed,
  getFearAndGreedHistory,
  getTopTokens,
  getTokensBySymbols,
  getTrending,
  computeSignal,
  computeBatchSignals,
  COMPETITION_SYMBOLS,
} from './cmc'

// ── Byreal Skills — Mantle AI Trading Agent (Session N4) ─────────────────────
// Agentic Wallets & Economy track — The Turing Test Hackathon
export {
  BYREAL_SKILLS,
  ByrealSkillHub,
  mantleGetPriceSkill,
  mantleSignalScoreSkill,
  mantleRunCycleSkill,
  mantleBenchmarkInfoSkill,
} from './byreal'

export type {
  ByrealSkill,
  ByrealSkillParam,
  ByrealSkillResult,
} from './byreal'

export type {
  FearAndGreed,
  CMCToken,
  CMCSignal,
  TrendingToken,
} from './cmc'
