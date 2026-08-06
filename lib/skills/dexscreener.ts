/**
 * lib/skills/dexscreener.ts — Session 9
 *
 * DexScreener API client for meme coin live prices.
 * https://api.dexscreener.com — free, no auth, no rate limit documented
 * (be reasonable: max ~10 req/min in practice).
 *
 * Used by the live feed route for the Meme Coins market type.
 * Crypto coins are on Binance/CMC; meme coins are often only on DEXs.
 */

import axios from 'axios'

const DEXSCREENER_BASE = 'https://api.dexscreener.com'

export interface DexToken {
  symbol:        string
  name:          string
  address:       string
  chainId:       string
  price:         number
  priceUsd:      string
  change24h:     number
  volume24h:     number
  liquidity:     number
  marketCap:     number
  fdv:           number
  pairAddress:   string
  dexId:         string
  url:           string
}

/** Fetch live price data for a token by contract address */
export async function getDexTokenByAddress(
  address: string,
  chainId = 'bsc'
): Promise<DexToken | null> {
  try {
    const { data } = await axios.get(
      `${DEXSCREENER_BASE}/latest/dex/tokens/${address}`,
      { timeout: 8_000 }
    )
    const pair = data?.pairs?.[0]
    if (!pair) return null

    return {
      symbol:      pair.baseToken.symbol,
      name:        pair.baseToken.name,
      address:     pair.baseToken.address,
      chainId:     pair.chainId,
      price:       parseFloat(pair.priceUsd ?? '0'),
      priceUsd:    pair.priceUsd ?? '0',
      change24h:   pair.priceChange?.h24 ?? 0,
      volume24h:   pair.volume?.h24 ?? 0,
      liquidity:   pair.liquidity?.usd ?? 0,
      marketCap:   pair.marketCap ?? 0,
      fdv:         pair.fdv ?? 0,
      pairAddress: pair.pairAddress,
      dexId:       pair.dexId,
      url:         pair.url,
    }
  } catch (err: any) {
    console.error('[dexscreener.getDexTokenByAddress]', err.message)
    return null
  }
}

/** Search for a token by symbol name */
export async function searchDexToken(query: string): Promise<DexToken[]> {
  try {
    const { data } = await axios.get(
      `${DEXSCREENER_BASE}/latest/dex/search/?q=${encodeURIComponent(query)}`,
      { timeout: 8_000 }
    )
    return (data?.pairs ?? []).slice(0, 5).map((pair: any) => ({
      symbol:      pair.baseToken.symbol,
      name:        pair.baseToken.name,
      address:     pair.baseToken.address,
      chainId:     pair.chainId,
      price:       parseFloat(pair.priceUsd ?? '0'),
      priceUsd:    pair.priceUsd ?? '0',
      change24h:   pair.priceChange?.h24 ?? 0,
      volume24h:   pair.volume?.h24 ?? 0,
      liquidity:   pair.liquidity?.usd ?? 0,
      marketCap:   pair.marketCap ?? 0,
      fdv:         pair.fdv ?? 0,
      pairAddress: pair.pairAddress,
      dexId:       pair.dexId,
      url:         pair.url,
    }))
  } catch (err: any) {
    console.error('[dexscreener.searchDexToken]', err.message)
    return []
  }
}

/**
 * Well-known meme coin contract addresses (BSC chain — matches MEME_SYMBOLS
 * in lib/skills/twelvedata.ts and ALL_ELIGIBLE_SYMBOLS in lib/twak/client.ts)
 */
export const MEME_COIN_ADDRESSES: Record<string, { address: string; chain: string }> = {
  DOGE:  { address: '0xba2ae424d960c26247dd6c32edc70b295c744c43', chain: 'bsc' },
  SHIB:  { address: '0x2859e4544c4bb03966803b044a93563bd2d0dd4d', chain: 'bsc' },
  PEPE:  { address: '0x6982508145454ce325ddbe47a25d4ec3d2311933', chain: 'ethereum' },
  BONK:  { address: '0xDedC479E29e88E7f1Fc2b9AcB4aAB9aE47b3cD4F', chain: 'solana' },
  FLOKI: { address: '0xcf0c122c6b73ff809c693db761e7baebe62b6a2e', chain: 'bsc' },
  WIF:   { address: '0xEDD06c2e07f9D31f2B8c58a29F32B3A5eE3cE1B7', chain: 'solana' },
}

/** Batch fetch meme coin prices */
export async function getMemeCoinsQuotes(symbols: string[]): Promise<DexToken[]> {
  const results = await Promise.all(
    symbols
      .filter(s => MEME_COIN_ADDRESSES[s])
      .map(s => getDexTokenByAddress(
        MEME_COIN_ADDRESSES[s].address,
        MEME_COIN_ADDRESSES[s].chain,
      ))
  )
  return results.filter(Boolean) as DexToken[]
}
