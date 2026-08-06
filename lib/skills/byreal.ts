/**
 * lib/skills/byreal.ts — Session N4 · POLISHED (fixes Bug #1)
 *
 * FIX: Corrected import paths.
 * - `import type { MantleNetwork } from './config'`
 *   was resolving to lib/skills/config.ts (does not exist).
 *   Fixed to `'../mantle/config'`.
 * - `export { MANTLE_BYBIT_PAIRS } from './config'`
 *   same wrong path — fixed to `'../mantle/config'`.
 *
 * All other logic is unchanged from Session N4.
 */

import { getBybitTicker, bybitTickerToSignalScore } from '../bybit'
import type { MantleNetwork } from '../mantle/config'    // ← FIXED (was './config')

// Re-export config for convenience
export { MANTLE_BYBIT_PAIRS } from '../mantle/config'   // ← FIXED (was './config')

// ─────────────────────────────────────────────────────────────────────────────
// Byreal Skill interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ByrealSkill {
  name:        string
  description: string
  version:     string
  author:      string
  tags:        string[]
  input:       ByrealSkillParam[]
  output:      ByrealSkillParam[]
  handler:     (input: Record<string, any>) => Promise<ByrealSkillResult>
}

export interface ByrealSkillParam {
  name:        string
  type:        'string' | 'number' | 'boolean' | 'object'
  description: string
  required:    boolean
  default?:    any
}

export interface ByrealSkillResult {
  success:  boolean
  data?:    Record<string, any>
  error?:   string
  metadata?: {
    executedAt:  number
    durationMs:  number
    skillName:   string
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill helpers
// ─────────────────────────────────────────────────────────────────────────────

async function withTiming<T>(
  skillName: string,
  fn: () => Promise<T>,
): Promise<ByrealSkillResult & { data?: any }> {
  const start = Date.now()
  try {
    const data = await fn()
    return {
      success:  true,
      data:     data as Record<string, any>,
      metadata: { executedAt: start, durationMs: Date.now() - start, skillName },
    }
  } catch (err: any) {
    return {
      success:  false,
      error:    err.message,
      metadata: { executedAt: start, durationMs: Date.now() - start, skillName },
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill 1 — mantle_get_price
// ─────────────────────────────────────────────────────────────────────────────

export const mantleGetPriceSkill: ByrealSkill = {
  name:        'mantle_get_price',
  description: 'Fetch the current spot price for a Bybit trading pair (e.g. MNTUSDT, ETHUSDT). Returns last price, 24h change, high, low, and volume.',
  version:     '1.0.0',
  author:      'Binalyst',
  tags:        ['mantle', 'price', 'bybit', 'market-data', 'trading'],
  input: [
    { name: 'symbol', type: 'string', description: 'Bybit trading pair (e.g. MNTUSDT)', required: true },
  ],
  output: [
    { name: 'symbol',       type: 'string', description: 'Trading pair symbol',          required: true },
    { name: 'lastPrice',    type: 'number', description: 'Last traded price in USDT',    required: true },
    { name: 'price24hPcnt', type: 'number', description: '24h price change percentage',  required: true },
    { name: 'highPrice24h', type: 'number', description: '24h high',                     required: true },
    { name: 'lowPrice24h',  type: 'number', description: '24h low',                      required: true },
    { name: 'volume24h',    type: 'number', description: '24h volume (base asset)',       required: true },
  ],
  handler: async ({ symbol }) => withTiming('mantle_get_price', async () => {
    const ticker = await getBybitTicker(String(symbol).toUpperCase())
    if (!ticker) throw new Error(`No ticker data found for ${symbol}`)
    return {
      symbol:       ticker.symbol,
      lastPrice:    ticker.lastPrice,
      price24hPcnt: ticker.price24hPcnt * 100,
      highPrice24h: ticker.highPrice24h,
      lowPrice24h:  ticker.lowPrice24h,
      volume24h:    ticker.volume24h,
      turnover24h:  ticker.turnover24h,
      bid1Price:    ticker.bid1Price,
      ask1Price:    ticker.ask1Price,
    }
  }),
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill 2 — mantle_signal_score
// ─────────────────────────────────────────────────────────────────────────────

export const mantleSignalScoreSkill: ByrealSkill = {
  name:        'mantle_signal_score',
  description: "Score a Bybit trading pair's signal strength (0-100) and return a trading direction (BUY/SELL/HOLD) with reasoning. Uses price momentum and range position. Designed for agentic trading pipelines.",
  version:     '1.0.0',
  author:      'Binalyst',
  tags:        ['mantle', 'signal', 'ai', 'trading', 'score', 'bybit'],
  input: [
    { name: 'symbol', type: 'string', description: 'Bybit trading pair (e.g. MNTUSDT)', required: true },
  ],
  output: [
    { name: 'symbol',    type: 'string', description: 'Trading pair',                           required: true },
    { name: 'score',     type: 'number', description: 'Signal score 0-100 (>=65 BUY, <=35 SELL)', required: true },
    { name: 'direction', type: 'string', description: 'BUY | SELL | HOLD',                      required: true },
    { name: 'reasoning', type: 'string', description: 'Human-readable signal reasoning',         required: true },
    { name: 'price',     type: 'number', description: 'Current price at scoring time',           required: true },
  ],
  handler: async ({ symbol }) => withTiming('mantle_signal_score', async () => {
    const sym    = String(symbol).toUpperCase()
    const ticker = await getBybitTicker(sym)
    if (!ticker) throw new Error(`No ticker data for ${sym}`)
    const signal = bybitTickerToSignalScore(ticker)
    return {
      symbol:    sym,
      score:     signal.score,
      direction: signal.direction,
      reasoning: signal.reasoning,
      price:     ticker.lastPrice,
      timestamp: Date.now(),
    }
  }),
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill 3 — mantle_run_cycle
// ─────────────────────────────────────────────────────────────────────────────

export const mantleRunCycleSkill: ByrealSkill = {
  name:        'mantle_run_cycle',
  description: 'Trigger one Mantle AI Trading Agent decision cycle. Fetches Bybit prices, scores signals, evaluates guardrails, and returns trade decisions (dry-run by default). Requires agent privateKey — handle securely.',
  version:     '1.0.0',
  author:      'Binalyst',
  tags:        ['mantle', 'agent', 'trading', 'cycle', 'autonomous'],
  input: [
    { name: 'privateKey', type: 'string',  description: 'Agent wallet private key (never logged)', required: true },
    { name: 'network',    type: 'string',  description: 'mainnet | testnet',                       required: false, default: 'testnet' },
    { name: 'dryRun',     type: 'boolean', description: 'Simulate without on-chain execution',     required: false, default: true },
    { name: 'symbols',    type: 'string',  description: 'Comma-separated Bybit pairs',             required: false, default: 'MNTUSDT,ETHUSDT,BTCUSDT' },
  ],
  output: [
    { name: 'decisions',    type: 'number', description: 'Total signals evaluated',         required: true },
    { name: 'executed',     type: 'number', description: 'Trades executed or simulated',    required: true },
    { name: 'blocked',      type: 'number', description: 'Trades blocked by guardrails',    required: true },
    { name: 'portfolioUSD', type: 'number', description: 'Current portfolio USD value',     required: true },
    { name: 'trades',       type: 'object', description: 'Array of trade decision records', required: true },
  ],
  handler: async ({ privateKey, network = 'testnet', dryRun = true, symbols = 'MNTUSDT,ETHUSDT,BTCUSDT' }) => {
    return withTiming('mantle_run_cycle', async () => {
      const symbolList = String(symbols).split(',').map((s: string) => s.trim().toUpperCase())
      const baseUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

      const res = await fetch(`${baseUrl}/api/mantle-agent/loop`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey,
          network,
          config: { dryRun, autonomousMode: !dryRun, symbols: symbolList },
        }),
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Cycle failed')

      return {
        decisions:    data.decisions,
        executed:     data.executed,
        blocked:      data.blocked,
        portfolioUSD: data.portfolioUSD,
        mntBalance:   data.mntBalance,
        mntPrice:     data.mntPrice,
        trades: (data.trades ?? []).map((t: any) => ({
          symbol:    t.symbol,
          side:      t.side,
          score:     t.signalScore,
          amountUSD: t.amountUSD,
          status:    t.status,
          reasoning: t.reasoning,
        })),
        cycleAt: data.cycleAt,
      }
    })
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill 4 — mantle_benchmark_info
// ─────────────────────────────────────────────────────────────────────────────

export const mantleBenchmarkInfoSkill: ByrealSkill = {
  name:        'mantle_benchmark_info',
  description: 'Get on-chain benchmarking stats for a Mantle AI agent. Returns benchmark sink address, Mantle explorer URL, and estimated gas cost per decision record. Turing Test Hackathon feature #1.',
  version:     '1.0.0',
  author:      'Binalyst',
  tags:        ['mantle', 'benchmark', 'on-chain', 'transparency', 'turing-test'],
  input: [
    { name: 'agentAddress', type: 'string', description: 'Agent wallet address (0x...)', required: true },
    { name: 'network',      type: 'string', description: 'mainnet | testnet',            required: false, default: 'mainnet' },
  ],
  output: [
    { name: 'sinkUrl',         type: 'string', description: 'Mantle explorer URL for benchmark records', required: true },
    { name: 'gasEstimateUSD',  type: 'number', description: 'Estimated USD gas cost per benchmark write', required: true },
    { name: 'explorerApiDocs', type: 'string', description: 'Mantle explorer API docs URL',              required: true },
  ],
  handler: async ({ agentAddress, network = 'mainnet' }) => {
    return withTiming('mantle_benchmark_info', async () => {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      const res     = await fetch(
        `${baseUrl}/api/mantle-agent/benchmark?address=${encodeURIComponent(agentAddress)}&network=${network}`,
      )
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Benchmark info failed')
      return data
    })
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill 5 — mantle_agent_identity
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// Skill registry
// ─────────────────────────────────────────────────────────────────────────────

export const BYREAL_SKILLS: ByrealSkill[] = [
  mantleGetPriceSkill,
  mantleSignalScoreSkill,
  mantleRunCycleSkill,
  mantleBenchmarkInfoSkill,
]

export const ByrealSkillHub = {
  skills: BYREAL_SKILLS,

  get: (name: string): ByrealSkill | undefined =>
    BYREAL_SKILLS.find(s => s.name === name),

  execute: async (name: string, input: Record<string, any>): Promise<ByrealSkillResult> => {
    const skill = BYREAL_SKILLS.find(s => s.name === name)
    if (!skill) {
      return {
        success: false,
        error:   `Skill '${name}' not found. Available: ${BYREAL_SKILLS.map(s => s.name).join(', ')}`,
      }
    }
    return skill.handler(input)
  },

  manifest: () => ({
    name:        'binalyst-mantle-agent',
    version:     '1.0.0',
    author:      'Binalyst',
    description: 'Mantle AI Trading Agent skills — The Turing Test Hackathon (AI Trading & Strategy + Agentic Wallets & Economy tracks).',
    tags:        ['mantle', 'ai-trading', 'bybit', 'turing-test', 'erc8004'],
    skills:      BYREAL_SKILLS.map(({ handler: _h, ...meta }) => meta),
  }),
}
