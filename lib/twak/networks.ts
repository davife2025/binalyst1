/**
 * lib/twak/networks.ts
 * BSC Mainnet + Testnet network configuration.
 * Single source of truth for all RPC endpoints and contract addresses.
 */

export type Network = 'mainnet' | 'testnet'

export interface NetworkConfig {
  name:                string
  chainId:             number
  rpc:                 string
  rpcBackup:           string
  explorer:            string
  explorerTx:          string
  explorerAddress:     string
  pancakeRouter:       string
  pancakeFactory:      string
  wbnb:                string
  usdt:                string
  competitionContract: string
  faucet?:             string
  isTestnet:           boolean
}

export const NETWORKS: Record<Network, NetworkConfig> = {
  mainnet: {
    name:                'BSC Mainnet',
    chainId:             56,
    rpc:                 'https://bsc-dataseed1.binance.org',
    rpcBackup:           'https://bsc-dataseed2.binance.org',
    explorer:            'https://bscscan.com',
    explorerTx:          'https://bscscan.com/tx/',
    explorerAddress:     'https://bscscan.com/address/',
    pancakeRouter:       '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    pancakeFactory:      '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    wbnb:                '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    usdt:                '0x55d398326f99059fF775485246999027B3197955',
    competitionContract: '0x212c61b9b72c95d95bf29cf032f5e5635629aed5',
    isTestnet:           false,
  },
  testnet: {
    name:                'BSC Testnet',
    chainId:             97,
    rpc:                 'https://data-seed-prebsc-1-s1.binance.org:8545',
    rpcBackup:           'https://data-seed-prebsc-2-s1.binance.org:8545',
    explorer:            'https://testnet.bscscan.com',
    explorerTx:          'https://testnet.bscscan.com/tx/',
    explorerAddress:     'https://testnet.bscscan.com/address/',
    pancakeRouter:       '0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3',
    pancakeFactory:      '0x6725F303b657a9451d8BA641348b6761A6CC7a17',
    wbnb:                '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
    usdt:                '0x7ef95a0FEE0Dd31b22626fA2e10Ee6A223F8a684',
    competitionContract: '0x0000000000000000000000000000000000000000',
    faucet:              'https://testnet.bnbchain.org/faucet-smart',
    isTestnet:           true,
  },
}

export function getNetwork(network: Network): NetworkConfig {
  return NETWORKS[network]
}

export function getExplorerTxLink(txHash: string, network: Network): string {
  return `${NETWORKS[network].explorerTx}${txHash}`
}

export function getExplorerAddressLink(address: string, network: Network): string {
  return `${NETWORKS[network].explorerAddress}${address}`
}
