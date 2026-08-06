/**
 * lib/skills/cmc.ts
 * CoinMarketCap AI Agent Hub client.
 * Fetches Fear & Greed, trending, rankings, and metadata.
 * Uses x402 pay-per-request for premium signal endpoints.
 *
 * Hub: https://coinmarketcap.com/api/agent
 */

import axios from 'axios'

const CMC_API_KEY = process.env.CMC_API_KEY ?? ''
const CMC_BASE    = 'https://pro-api.coinmarketcap.com'

// x402 micropayment endpoint (pay-per-request signal data)
const X402_BASE   = 'https://api.coinmarketcap.com/x402'

const cmcHeaders = {
  'X-CMC_PRO_API_KEY': CMC_API_KEY,
  'Accept': 'application/json',
  'Accept-Encoding': 'gzip,deflate,compress',
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FearAndGreed {
  value:       number       // 0–100
  label:       string       // 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
  timestamp:   string
  classification: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed'
}

export interface CMCToken {
  id:              number
  name:            string
  symbol:          string
  slug:            string
  cmc_rank:        number
  price:           number
  volume24h:       number
  marketCap:       number
  change1h:        number
  change24h:       number
  change7d:        number
}

export interface CMCSignal {
  symbol:          string
  price:           number
  change24h:       number
  volume24h:       number
  fearGreed:       number
  momentum:        number   // -100 to 100 composite
  signalScore:     number   // 0–100 buy signal strength
  signalDir:       'BUY' | 'SELL' | 'HOLD'
  confidence:      'HIGH' | 'MEDIUM' | 'LOW'
  reasoning:       string
}

export interface TrendingToken {
  id:       number
  symbol:   string
  name:     string
  rank:     number
  change24h: number
  price:    number
}

// ─────────────────────────────────────────────────────────────────────────────
// Fear & Greed Index
// ─────────────────────────────────────────────────────────────────────────────

export async function getFearAndGreed(): Promise<FearAndGreed> {
  try {
    const { data } = await axios.get(
      `${CMC_BASE}/v3/fear-and-greed/latest`,
      { headers: cmcHeaders, timeout: 10000 }
    )
    const d = data?.data
    const value = d?.value ?? 50
    return {
      value,
      label:          d?.value_classification ?? classifyFG(value),
      timestamp:      d?.update_time ?? new Date().toISOString(),
      classification: classifyFGKey(value),
    }
  } catch {
    // Fallback: scrape from alternative-me
    try {
      const { data } = await axios.get('https://api.alternative.me/fng/', { timeout: 8000 })
      const value = parseInt(data?.data?.[0]?.value ?? '50')
      return {
        value,
        label:          data?.data?.[0]?.value_classification ?? classifyFG(value),
        timestamp:      new Date().toISOString(),
        classification: classifyFGKey(value),
      }
    } catch {
      return { value: 50, label: 'Neutral', timestamp: new Date().toISOString(), classification: 'neutral' }
    }
  }
}

export async function getFearAndGreedHistory(limit = 30): Promise<FearAndGreed[]> {
  try {
    const { data } = await axios.get(
      `${CMC_BASE}/v3/fear-and-greed/historical`,
      { headers: cmcHeaders, params: { limit }, timeout: 10000 }
    )
    return (data?.data ?? []).map((d: any) => ({
      value:          d.value,
      label:          d.value_classification ?? classifyFG(d.value),
      timestamp:      d.update_time,
      classification: classifyFGKey(d.value),
    }))
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Token data
// ─────────────────────────────────────────────────────────────────────────────

export async function getTopTokens(limit = 50): Promise<CMCToken[]> {
  try {
    const { data } = await axios.get(`${CMC_BASE}/v1/cryptocurrency/listings/latest`, {
      headers: cmcHeaders,
      params: { limit, convert: 'USD', sort: 'market_cap' },
      timeout: 10000,
    })
    return (data?.data ?? []).map(normToken)
  } catch {
    return []
  }
}

export async function getTokensBySymbols(symbols: string[]): Promise<CMCToken[]> {
  if (!symbols.length) return []
  try {
    const { data } = await axios.get(`${CMC_BASE}/v1/cryptocurrency/quotes/latest`, {
      headers: cmcHeaders,
      params: { symbol: symbols.join(','), convert: 'USD' },
      timeout: 10000,
    })
    return Object.values(data?.data ?? {}).map(normToken)
  } catch {
    return []
  }
}

export async function getTrending(limit = 20): Promise<TrendingToken[]> {
  try {
    const { data } = await axios.get(`${CMC_BASE}/v1/cryptocurrency/trending/gainers-losers`, {
      headers: cmcHeaders,
      params: { limit, convert: 'USD', time_period: '24h' },
      timeout: 10000,
    })
    return (data?.data ?? []).map((t: any) => ({
      id:       t.id,
      symbol:   t.symbol,
      name:     t.name,
      rank:     t.cmc_rank,
      change24h: t.quote?.USD?.percent_change_24h ?? 0,
      price:    t.quote?.USD?.price ?? 0,
    }))
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal computation
// Combines F&G + price momentum + volume spike → signal score
// ─────────────────────────────────────────────────────────────────────────────

export async function computeSignal(symbol: string): Promise<CMCSignal> {
  const [tokens, fg] = await Promise.allSettled([
    getTokensBySymbols([symbol]),
    getFearAndGreed(),
  ])

  const token  = tokens.status === 'fulfilled' ? tokens.value[0] : null
  const fgData = fg.status    === 'fulfilled' ? fg.value       : { value: 50, label: 'Neutral', timestamp: '', classification: 'neutral' as const }

  if (!token) {
    return {
      symbol, price: 0, change24h: 0, volume24h: 0,
      fearGreed: fgData.value, momentum: 0, signalScore: 50,
      signalDir: 'HOLD', confidence: 'LOW',
      reasoning: `No CMC data found for ${symbol}.`,
    }
  }

  // Momentum: -100 (extreme sell) to +100 (extreme buy)
  const momentumRaw = (token.change24h * 0.5) + (token.change1h * 2)
  const momentum    = Math.max(-100, Math.min(100, momentumRaw))

  // Signal score: weighted combo
  // F&G low (fear) = buy opportunity, high (greed) = caution
  const fgBias     = fgData.value < 30 ? 20 : fgData.value > 70 ? -20 : 0
  const momBias    = momentum * 0.3
  const rawScore   = 50 + fgBias + momBias
  const signalScore = Math.max(0, Math.min(100, rawScore))

  let signalDir: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
  let confidence:  'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'

  if (signalScore >= 65) { signalDir = 'BUY';  confidence = signalScore >= 80 ? 'HIGH' : 'MEDIUM' }
  if (signalScore <= 35) { signalDir = 'SELL'; confidence = signalScore <= 20 ? 'HIGH' : 'MEDIUM' }
  if (signalScore > 35 && signalScore < 65) { signalDir = 'HOLD'; confidence = 'LOW' }

  const reasoning = buildReasoning(symbol, token, fgData, momentum, signalDir)

  return {
    symbol,
    price:      token.price,
    change24h:  token.change24h,
    volume24h:  token.volume24h,
    fearGreed:  fgData.value,
    momentum,
    signalScore,
    signalDir,
    confidence,
    reasoning,
  }
}

export async function computeBatchSignals(symbols: string[]): Promise<CMCSignal[]> {
  return Promise.all(symbols.map(computeSignal))
}

// ─────────────────────────────────────────────────────────────────────────────
// x402 pay-per-request — premium signal data
// Pays a micropayment per API call using x402 protocol
// ─────────────────────────────────────────────────────────────────────────────

export interface X402Config {
  walletAddress: string
  signMessage:   (msg: string) => Promise<string>
}

export async function getX402Signal(
  symbol: string,
  x402Config: X402Config
): Promise<CMCSignal | null> {
  try {
    // 1. Request payment challenge from x402 endpoint
    const challengeRes = await axios.get(`${X402_BASE}/signal/${symbol}`, {
      headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY },
      validateStatus: s => s === 402 || s === 200,
    })

    // If 402, need to pay
    if (challengeRes.status === 402) {
      const { paymentRequired, amount, currency, address: payTo } = challengeRes.data
      // Sign the payment proof locally (self-custodial)
      const proof = await x402Config.signMessage(
        `x402:pay:${amount}:${currency}:${payTo}:${symbol}:${Date.now()}`
      )
      // Retry with payment proof header
      const paidRes = await axios.get(`${X402_BASE}/signal/${symbol}`, {
        headers: {
          'X-CMC_PRO_API_KEY':  CMC_API_KEY,
          'X-Payment-Proof':    proof,
          'X-Payer-Address':    x402Config.walletAddress,
        },
        timeout: 10000,
      })
      return paidRes.data?.signal ?? null
    }

    return challengeRes.data?.signal ?? null
  } catch {
    // Fallback to free signal computation
    return computeSignal(symbol)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normToken(t: any): CMCToken {
  const q = t?.quote?.USD ?? {}
  return {
    id:        t.id,
    name:      t.name,
    symbol:    t.symbol,
    slug:      t.slug ?? '',
    cmc_rank:  t.cmc_rank ?? 9999,
    price:     q.price ?? 0,
    volume24h: q.volume_24h ?? 0,
    marketCap: q.market_cap ?? 0,
    change1h:  q.percent_change_1h ?? 0,
    change24h: q.percent_change_24h ?? 0,
    change7d:  q.percent_change_7d ?? 0,
  }
}

function classifyFG(v: number): string {
  if (v <= 24) return 'Extreme Fear'
  if (v <= 44) return 'Fear'
  if (v <= 55) return 'Neutral'
  if (v <= 74) return 'Greed'
  return 'Extreme Greed'
}

function classifyFGKey(v: number): FearAndGreed['classification'] {
  if (v <= 24) return 'extreme_fear'
  if (v <= 44) return 'fear'
  if (v <= 55) return 'neutral'
  if (v <= 74) return 'greed'
  return 'extreme_greed'
}

function buildReasoning(
  symbol: string,
  token: CMCToken,
  fg: FearAndGreed,
  momentum: number,
  dir: string
): string {
  const parts: string[] = []
  parts.push(`${symbol} is ${dir === 'BUY' ? 'showing strength' : dir === 'SELL' ? 'showing weakness' : 'range-bound'}.`)
  parts.push(`24h: ${token.change24h >= 0 ? '+' : ''}${token.change24h.toFixed(2)}%.`)
  parts.push(`Fear & Greed: ${fg.value} (${fg.label}).`)
  if (fg.value < 30) parts.push('Market fear = potential buy opportunity.')
  if (fg.value > 70) parts.push('Market greed = elevated risk, caution advised.')
  if (Math.abs(momentum) > 40) parts.push(`Strong momentum signal (${momentum.toFixed(0)}).`)
  return parts.join(' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Competition-eligible symbols from CMC (intersect with TWAK eligible list)
// ─────────────────────────────────────────────────────────────────────────────
// COMPETITION_SYMBOLS removed — see lib/skills/twelvedata.ts for curated lists
// @deprecated — still exported because app/api/cmc/route.ts depends on it
export const COMPETITION_SYMBOLS = [
  'ETH','USDT','USDC','XRP','TRX','DOGE','ADA','LINK','BCH','DAI',
  'TON','LTC','AVAX','SHIB','DOT','UNI','AAVE','ATOM','FIL','INJ',
  'FET','BONK','PENGU','CAKE','FLOKI','LDO','BAT','APE','SFP',
  '1INCH','SNX','COMP','SUSHI','ZIL','KAVA','FDUSD','BTT','TWT',
  'AXS','PENDLE','RAY','STG',
]