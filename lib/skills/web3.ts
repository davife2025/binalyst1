/**
 * lib/skills/web3.ts
 * Binance Web3 Skills Hub wrappers.
 * All endpoints are public — no API key required.
 */

import axios from 'axios'
import crypto from 'crypto'

const WEB3_BASE  = 'https://web3.binance.com'
const ALPHA_BASE = 'https://www.binance.com'

const HEADERS = {
  'Content-Type':   'application/json',
  'Accept-Encoding': 'identity',
  'clienttype':     'web',
  'clientversion':  '1.2.0',
  'source':         'agent',
  'User-Agent':     'binance-web3/1.4 (Skill)',
}

export type RankType = 'trending' | 'smart_money' | 'social_hype' | 'meme' | 'alpha' | 'traders'
export type ChainId  = '1' | '56' | 'CT_501' | '8453' | '137' | '42161' | '10'

// ─────────────────────────────────────────────────────────────────────────────
// Token Search & Info
// ─────────────────────────────────────────────────────────────────────────────

export async function searchToken({ keyword, chainId = '56' }: { keyword: string; chainId?: string }) {
  try {
    const { data } = await axios.get(
      `${WEB3_BASE}/bapi/defi/v5/public/wallet-direct/buw/wallet/market/token/search`,
      { params: { keyword, chainIds: chainId, orderBy: 'volume24h' }, headers: HEADERS, timeout: 10000 }
    )
    return data.data ?? []
  } catch (err: any) {
    throw new Error(`searchToken failed: ${err.response?.status} ${err.response?.data?.msg ?? err.message}`)
  }
}

export async function getTokenInfo({ address, chainId = '56' }: { address: string; chainId?: string }) {
  try {
    const { data } = await axios.get(
      `${WEB3_BASE}/bapi/defi/v1/public/wallet-direct/buw/wallet/dex/market/token/meta/info`,
      { params: { chainId, contractAddress: address }, headers: HEADERS, timeout: 10000 }
    )
    return data.data ?? null
  } catch (err: any) {
    throw new Error(`getTokenInfo failed: ${err.response?.status} ${err.response?.data?.msg ?? err.message}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Audit
// ─────────────────────────────────────────────────────────────────────────────

export async function getTokenAudit({ address, chainId = '56' }: { address: string; chainId?: string }) {
  try {
    const { data } = await axios.post(
      `${WEB3_BASE}/bapi/defi/v1/public/wallet-direct/security/token/audit`,
      { binanceChainId: chainId, contractAddress: address, requestId: crypto.randomUUID() },
      { headers: HEADERS, timeout: 15000 }
    )
    return data.data ?? null
  } catch (err: any) {
    throw new Error(`getTokenAudit failed: ${err.response?.status} ${err.response?.data?.msg ?? err.message}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Address Info
// ─────────────────────────────────────────────────────────────────────────────

export async function getAddressInfo({ address, chainId = '56' }: { address: string; chainId?: string }) {
  try {
    const { data } = await axios.get(
      `${WEB3_BASE}/bapi/defi/v3/public/wallet-direct/buw/wallet/address/pnl/active-position-list`,
      { params: { address, chainId, offset: 0 }, headers: HEADERS, timeout: 10000 }
    )
    return data.data ?? null
  } catch (err: any) {
    throw new Error(`getAddressInfo failed: ${err.response?.status} ${err.response?.data?.msg ?? err.message}`)
  }
}

export async function getAddressTokenHoldings({ address, chainId = '56' }: { address: string; chainId?: string }) {
  try {
    const { data } = await axios.get(
      `${WEB3_BASE}/bapi/defi/v2/public/wallet-direct/buw/wallet/address/asset/token-list`,
      { params: { address, chainId }, headers: HEADERS, timeout: 10000 }
    )
    return data.data ?? []
  } catch (err: any) {
    throw new Error(`getAddressTokenHoldings failed: ${err.response?.status} ${err.response?.data?.msg ?? err.message}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Market Rankings
// ─────────────────────────────────────────────────────────────────────────────

export async function getMarketRankings({
  rankType = 'trending',
  chainId  = '56',
  page     = 1,
  size     = 20,
}: {
  rankType?: RankType | string
  chainId?:  string
  period?:   string
  page?:     number
  size?:     number
}) {
  try {
    switch (rankType) {
      case 'trending': {
        const { data } = await axios.get(
          `${WEB3_BASE}/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/trending`,
          { headers: HEADERS, timeout: 10000 }
        )
        return data.data ?? []
      }
      case 'smart_money': {
        const { data } = await axios.get(
          `${WEB3_BASE}/bapi/defi/v1/public/wallet-direct/buw/wallet/market/smart-money/token-inflow`,
          { headers: HEADERS, timeout: 10000 }
        )
        return data.data ?? []
      }
      case 'social_hype': {
        const { data } = await axios.get(
          `${WEB3_BASE}/bapi/defi/v1/public/wallet-direct/buw/wallet/market/social/hype/rank`,
          { headers: HEADERS, timeout: 10000 }
        )
        return data.data ?? []
      }
      case 'meme': {
        const { data } = await axios.get(
          `${WEB3_BASE}/bapi/defi/v1/public/wallet-direct/buw/wallet/market/meme/rank`,
          { headers: HEADERS, timeout: 10000 }
        )
        return data.data ?? []
      }
      case 'alpha': {
        const { data } = await axios.get(
          `${ALPHA_BASE}/bapi/composite/v1/public/marketing/activity/cms/alpha-token-list`,
          { headers: { ...HEADERS, clienttype: 'web' }, timeout: 10000 }
        )
        return data.data ?? []
      }
      default:
        return []
    }
  } catch (err: any) {
    throw new Error(`getMarketRankings(${rankType}) failed: ${err.response?.status} ${err.response?.data?.msg ?? err.message}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Meme Rush
// ─────────────────────────────────────────────────────────────────────────────

export async function getMemeRush({
  chainId = '56',
  sortBy  = 'created',
  page    = 1,
  size    = 20,
}: {
  chainId?: string
  sortBy?:  'created' | 'trending' | 'volume'
  page?:    number
  size?:    number
}) {
  try {
    const stageMap = { created: 'new', trending: 'finalizing', volume: 'migrated' }
    const { data } = await axios.get(
      `${WEB3_BASE}/bapi/defi/v1/public/wallet-direct/buw/wallet/market/meme/rush/list`,
      { params: { stage: stageMap[sortBy] ?? 'new', chainId, limit: size }, headers: HEADERS, timeout: 10000 }
    )
    return data.data ?? []
  } catch (err: any) {
    throw new Error(`getMemeRush failed: ${err.response?.status} ${err.response?.data?.msg ?? err.message}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Alpha Tokens
// ─────────────────────────────────────────────────────────────────────────────

export async function getAlphaTokens() {
  try {
    const { data } = await axios.get(
      `${ALPHA_BASE}/bapi/composite/v1/public/marketing/activity/cms/alpha-token-list`,
      { headers: { ...HEADERS, clienttype: 'web' }, timeout: 10000 }
    )
    return data.data ?? []
  } catch (err: any) {
    throw new Error(`getAlphaTokens failed: ${err.response?.status} ${err.response?.data?.msg ?? err.message}`)
  }
}

export async function getAlphaAirdropInfo({ apiKey, apiSecret }: { apiKey: string; apiSecret: string }) {
  const timestamp = Date.now()
  const qs  = `timestamp=${timestamp}&recvWindow=5000`
  const sig = crypto.createHmac('sha256', apiSecret).update(qs).digest('hex')
  const { data } = await axios.get(
    `https://api.binance.com/sapi/v1/giftcard/cryptography/rsa-public-key?${qs}&signature=${sig}`,
    { headers: { 'X-MBX-APIKEY': apiKey, 'User-Agent': 'binalyst/1.0.0 (Skill)' } }
  )
  return data
}