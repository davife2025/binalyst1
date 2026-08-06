/**
 * lib/goat/config.ts — Session 2
 *
 * GOAT Network configuration.
 * All contract addresses verified from:
 * - Uniswap Governance RFC (canonically approved March 2025):
 *   https://gov.uniswap.org/t/rfc-deploy-uniswap-v3-on-goat-network/25338
 * - GOAT Network official docs:
 *   https://docs.goat.network/docs/build/networks-rpc
 *
 * IMPORTANT: Native gas token is BTC (18 decimals, symbol 'BTC').
 * ethers.formatEther() and parseEther() work correctly — same 18 decimals.
 * Display labels say 'BTC', NOT 'ETH'.
 */

export type GoatNetwork = 'mainnet' | 'testnet3'

// ── Chain IDs ─────────────────────────────────────────────────────────────────
export const GOAT_CHAIN_ID: Record<GoatNetwork, number> = {
  mainnet:  2345,
  testnet3: 48816,
}

// ── RPC endpoints ─────────────────────────────────────────────────────────────
export const GOAT_RPC: Record<GoatNetwork, string> = {
  mainnet:  'https://rpc.goat.network',
  testnet3: 'https://rpc.testnet3.goat.network',
}

export const GOAT_RPC_BACKUP: Record<GoatNetwork, string> = {
  mainnet:  'https://goat-mainnet-alpha.drpc.org',
  testnet3: 'https://rpc.testnet3.goat.network',
}

// ── Block explorers ───────────────────────────────────────────────────────────
export const GOAT_EXPLORER: Record<GoatNetwork, string> = {
  mainnet:  'https://explorer.goat.network',
  testnet3: 'https://explorer.testnet3.goat.network',
}

// ── Native currency ───────────────────────────────────────────────────────────
// BTC is the gas token on both mainnet and testnet3. 18 decimals, same as ETH.
export const GOAT_NATIVE = {
  name:     'Bitcoin',
  symbol:   'BTC',
  decimals: 18,
}

// ── Uniswap V3 contracts — canonically deployed on GOAT mainnet ───────────────
// Source: Uniswap Governance RFC approved March 2025
// https://gov.uniswap.org/t/rfc-deploy-uniswap-v3-on-goat-network/25338
export const UNISWAP_V3_CONTRACTS = {
  factory:          '0xcb2436774C3e191c85056d248EF4260ce5f27A9D',
  swapRouter02:     '0xaa52bB8110fE38D0d2d2AF0B85C3A3eE622CA455',
  universalRouter:  '0x738fD6d10bCc05c230388B4027CAd37f82fe2AF2',
  quoterV2:         '0x5911cB3633e764939edc2d92b7e1ad375Bb57649',
  nftPositionMgr:   '0x743E03cceB4af2efA3CC76838f6E8B50B63F184c',
  permit2:          '0xB952578f3520EE8Ea45b7914994dcf4702cEe578',
  multicall2:       '0x5d6b0f5335ec95cD2aB7E52f2A0750dd86502435',
}

// Note: Uniswap V3 is deployed on mainnet only.
// For testnet3, use native BTC transfers only (no DEX swap contracts verified yet).

// ── WBTC token address on GOAT mainnet ────────────────────────────────────────
// WBTC = wrapped BTC for use in Uniswap V3 pools (ERC-20)
// Address to be confirmed from explorer.goat.network/tokens before mainnet use.
// Set to empty string as a safe guard — client checks before swapping.
export const WBTC_GOAT_MAINNET = '' // TODO: verify on explorer.goat.network/tokens

// ── USDC on GOAT mainnet ──────────────────────────────────────────────────────
// Bridged USDC address — verify on explorer.goat.network/tokens before use
export const USDC_GOAT_MAINNET = '' // TODO: verify on explorer.goat.network/tokens

// ── Agent defaults ────────────────────────────────────────────────────────────
export const GOAT_AGENT_DEFAULTS = {
  DEFAULT_NETWORK:       'testnet3' as GoatNetwork,
  LOOP_INTERVAL_MS:      120_000,
  MIN_BTC_GAS_RESERVE:   0.000_01,  // keep at least this much BTC for gas
  GAS_LIMIT_TRANSFER:    21_000,
  GAS_LIMIT_SWAP:        300_000,
}
