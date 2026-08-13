/**
 * lib/keeperhub/config.ts
 *
 * KeeperHub configuration.
 * Docs: https://docs.keeperhub.com/api/direct-execution
 *       https://docs.keeperhub.com/api/authentication
 *       https://docs.keeperhub.com/api/chains
 *
 * KeeperHub is the execution + reliability layer: it holds/manages the
 * organization's wallet (Turnkey / Safe under the hood), signs, applies
 * smart gas estimation + MEV-protected private routing, and returns a
 * verified on-chain receipt. Binalyst no longer signs transactions itself
 * for live trades — it asks KeeperHub to.
 */

export const KEEPERHUB_API_BASE =
  process.env.KEEPERHUB_API_BASE_URL ?? 'https://app.keeperhub.com'

/**
 * Chain IDs Binalyst cares about. GOAT Network remains the chain the agent
 * trades on (native BTC gas, Uniswap V3 deployed on mainnet) — KeeperHub
 * is chain-agnostic and just needs the numeric chainId.
 */
export const CHAIN_IDS = {
  goatMainnet:  2345,
  goatTestnet3: 48816,
  ethSepolia:   11155111,
  base:         8453,
} as const

export type ChainKey = keyof typeof CHAIN_IDS

export const KEEPERHUB_DEFAULTS = {
  // Poll interval fallback when the response doesn't send
  // X-Poll-Interval-Hint (docs recommend honoring that header instead).
  POLL_INTERVAL_MS_FALLBACK: 2_000,
  POLL_TIMEOUT_MS:           60_000,
  // Buffer added to estimated gas via gasLimitMultiplier.
  DEFAULT_GAS_LIMIT_MULTIPLIER: '1.2',
}
