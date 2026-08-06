export type MantleNetwork = 'mainnet' | 'testnet'

export interface MantleNetworkConfig {
  chainId:      number
  rpcUrl:       string
  explorerUrl:  string
  nativeSymbol: string
}

export const MANTLE_NETWORKS: Record<MantleNetwork, MantleNetworkConfig> = {
  mainnet: {
    chainId:      5000,
    rpcUrl:       'https://rpc.mantle.xyz',
    explorerUrl:  'https://explorer.mantle.xyz',
    nativeSymbol: 'MNT',
  },
  testnet: {
    chainId:      5003,
    rpcUrl:       'https://rpc.sepolia.mantle.xyz',
    explorerUrl:  'https://explorer.sepolia.mantle.xyz',
    nativeSymbol: 'MNT',
  },
}

// Default Bybit pairs the Mantle agent trades / scores — mirrors
// BYBIT_DEFAULT_PAIRS in lib/bybit.ts and mantle_run_cycle's default.
export const MANTLE_BYBIT_PAIRS = [
  'MNTUSDT',
  'ETHUSDT',
  'BTCUSDT',
  'BNBUSDT',
  'SOLUSDT',
]
