/**
 * lib/goat/agentkit.ts — Session 7
 *
 * GOAT Network AgentKit integration.
 * All imports and APIs sourced from the official docs:
 * https://docs.goat.network/docs/agents/agent-kit/quick-start
 * https://docs.goat.network/docs/agents/agent-kit/payments
 * https://docs.goat.network/docs/agents/agent-kit/erc-8004
 *
 * Package: npm install @goatnetwork/agentkit
 *
 * This module provides:
 *  1. buildRuntime()    — ActionProvider + PolicyEngine + ExecutionRuntime
 *  2. buildX402Payer()  — x402 payer-side plugin setup
 *  3. buildERC8004()    — identity + reputation plugin setup
 *  4. buildRegistrationJSON() — well-formed registration.json per spec
 *
 * Used by:
 *  - app/api/goat/identity/route.ts  (ERC-8004 registration)
 *  - app/api/goat/x402/route.ts     (x402 payments)
 *  - app/api/goat/loop/route.ts     (execution via AgentKit runtime)
 */

import { JsonRpcProvider, Wallet } from 'ethers'
import { GOAT_RPC, type GoatNetwork } from './config'

// ─────────────────────────────────────────────────────────────────────────────
// AgentKit network name mapping
// ─────────────────────────────────────────────────────────────────────────────

export function toAgentKitNetwork(network: GoatNetwork): string {
  return network === 'mainnet' ? 'goat-mainnet' : 'goat-testnet'
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AgentKit Runtime
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build and return the core AgentKit runtime objects.
 *
 * PolicyEngine settings map to our RiskProfile:
 *   conservative → maxRiskWithoutConfirm: 'low'
 *   moderate     → maxRiskWithoutConfirm: 'medium'
 *   aggressive   → maxRiskWithoutConfirm: 'high'
 */
export async function buildRuntime(params: {
  privateKey: string
  network:    GoatNetwork
  riskPreset: 'conservative' | 'moderate' | 'aggressive'
  writeEnabled?: boolean
}) {
  const {
    ActionProvider,
  } = await import('@goatnetwork/agentkit/providers')
  const {
    PolicyEngine,
    ExecutionRuntime,
    EvmWalletProvider,
  } = await import('@goatnetwork/agentkit/core')
  const {
    walletBalanceAction,
    NoopWalletReadAdapter,
  } = await import('@goatnetwork/agentkit/plugins')

  const rpcProvider = new JsonRpcProvider(GOAT_RPC[params.network])
  const signer      = new Wallet(params.privateKey, rpcProvider)
  const wallet      = new EvmWalletProvider(
    signer, rpcProvider, toAgentKitNetwork(params.network)
  )

  const riskMap = {
    conservative: 'low',
    moderate:     'medium',
    aggressive:   'high',
  } as const

  const provider = new ActionProvider()
  provider.register(walletBalanceAction(new NoopWalletReadAdapter()))

  const policy = new PolicyEngine({
    allowedNetworks:       [toAgentKitNetwork(params.network)],
    maxRiskWithoutConfirm: riskMap[params.riskPreset],
    writeEnabled:          params.writeEnabled ?? true,
  })

  const runtime = new ExecutionRuntime(policy, {
    maxRetries:   2,
    retryDelayMs: 200,
  })

  return { provider, policy, runtime, wallet, signer }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. x402 payer-side setup
// ─────────────────────────────────────────────────────────────────────────────

export async function buildX402Payer(privateKey: string) {
  const { Wallet }               = await import('ethers')
  const { EvmPayerWalletAdapter,
          HttpMerchantGatewayAdapter } = await import('@goatnetwork/agentkit/plugins')

  const signer = new Wallet(privateKey)
  const payer  = new EvmPayerWalletAdapter(signer)

  const merchantApiBase = process.env.GOAT_X402_BASE_URL ?? 'https://api.x402.goat.network'
  const merchantApiKey  = process.env.GOAT_X402_API_KEY  ?? ''

  const merchant = new HttpMerchantGatewayAdapter(merchantApiBase, {
    headers: { Authorization: `Bearer ${merchantApiKey}` },
    routes: {
      createOrderPath:       '/x402/create-order',
      orderStatusPath:       '/x402/order-status/:paymentId',
      submitSignaturePath:   '/x402/submit-signature',
      cancelOrderPath:       '/x402/cancel-order',
    },
  })

  return { payer, merchant }
}

/**
 * Execute a full x402 payment: create → sign → submit → transfer → status.
 * Used by the GOAT loop route when the agent pays for signal data.
 */
export async function executeX402Payment(params: {
  privateKey: string
  to:         string
  asset:      string   // e.g. 'USDC'
  amount:     string   // human-readable, e.g. '0.03'
}) {
  const { payer, merchant } = await buildX402Payer(params.privateKey)

  // 1. Create payment intent (merchant returns EIP-712 calldata)
  const created = await merchant.createPaymentIntent({
    to:     params.to,
    asset:  params.asset,
    amount: params.amount,
  })

  // 2. Agent signs the EIP-712 calldata
  const signature = await payer.signCalldataTypedData(
    created.calldataSignRequest!
  )

  // 3. Submit signature to merchant
  const authorized = await merchant.submitPaymentAuthorization(
    created.paymentId,
    signature,
  )

  // 4. Check status
  const status = await merchant.getPaymentStatus(created.paymentId)

  return {
    paymentId:  created.paymentId,
    authorized,
    status,
    asset:      params.asset,
    amount:     params.amount,
    to:         params.to,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ERC-8004 identity + reputation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ERC-8004 contract addresses (from official docs):
 *
 * goat-mainnet:
 *   Identity:   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 *   Reputation: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
 *
 * goat-testnet (testnet3):
 *   Identity:   0x556089008Fc0a60cD09390Eca93477ca254A5522
 *   Reputation: 0xd9140951d8aE6E5F625a02F5908535e16e3af964
 *
 * AgentKit resolves these automatically from ctx.network.
 */
export const ERC8004_CONTRACTS = {
  'goat-mainnet': {
    identity:   '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    reputation: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  },
  'goat-testnet': {
    identity:   '0x556089008Fc0a60cD09390Eca93477ca254A5522',
    reputation: '0xd9140951d8aE6E5F625a02F5908535e16e3af964',
  },
}

/**
 * Register the agent and set its metadata URI via AgentKit's erc8004 plugin.
 * Returns the minted agentId.
 *
 * Flow (per official docs):
 *   1. erc8004.register_agent  → mints ERC-721 identity NFT
 *   2. erc8004.set_agent_uri   → attaches registration.json URI to the NFT
 */
export async function registerAgentIdentity(params: {
  privateKey: string
  network:    GoatNetwork
  agentURI:   string   // IPFS or data: URI of registration.json
}) {
  const { provider, runtime, wallet } = await buildRuntime({
    privateKey: params.privateKey,
    network:    params.network,
    riskPreset: 'moderate',
    writeEnabled: true,
  })

  const {
    erc8004RegisterAgentAction,
    erc8004SetAgentURIAction,
    erc8004GetReputationAction,
  } = await import('@goatnetwork/agentkit/plugins')

  provider.register(erc8004RegisterAgentAction(wallet))
  provider.register(erc8004SetAgentURIAction(wallet))
  provider.register(erc8004GetReputationAction(wallet))

  const akNetwork = toAgentKitNetwork(params.network)
  const ctx = {
    traceId: `register_${Date.now()}`,
    network: akNetwork,
    now:     Date.now(),
    caller:  'binalyst-agent',
  }

  // 1. Register agent
  const reg = await runtime.run(
    provider.get('erc8004.register_agent'),
    ctx,
    {},
    { confirmed: true, idempotencyKey: `register_${params.network}` }
  )

  if (!reg.ok) throw new Error(`ERC-8004 registration failed: ${reg.error}`)

  // `runtime.run` returns `output` as an untyped object, so we cast it to the
  // known shape from the erc8004.register_agent action before reading off it.
  const regOutput = reg.output as { agentId?: string | number } | undefined
  const agentId: string = regOutput?.agentId?.toString() ?? 'unknown'

  // 2. Set agent URI
  const uriResult = await runtime.run(
    provider.get('erc8004.set_agent_uri'),
    ctx,
    { agentId, agentURI: params.agentURI },
    { confirmed: true }
  )

  if (!uriResult.ok) {
    console.warn('[AgentKit] set_agent_uri warning:', uriResult.error)
  }

  return { agentId, registrationOk: reg.ok, uriOk: uriResult.ok }
}

/**
 * Get current reputation signals for this agent.
 */
export async function getAgentReputation(params: {
  privateKey: string
  network:    GoatNetwork
  agentId:    string
}) {
  const { provider, runtime, wallet } = await buildRuntime({
    privateKey: params.privateKey,
    network:    params.network,
    riskPreset: 'conservative',
  })

  const { erc8004GetReputationAction } = await import('@goatnetwork/agentkit/plugins')
  provider.register(erc8004GetReputationAction(wallet))

  const result = await runtime.run(
    provider.get('erc8004.get_reputation'),
    {
      traceId: `rep_${Date.now()}`,
      network: toAgentKitNetwork(params.network),
      now:     Date.now(),
      caller:  'binalyst-agent',
    },
    { agentId: params.agentId }
  )

  return result.ok ? result.output : null
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Registration JSON builder (per ERC-8004 schema from docs)
// ─────────────────────────────────────────────────────────────────────────────

export function buildRegistrationJSON(params: {
  agentId?:        string
  network:         GoatNetwork
  walletAddress:   string
  agentName:       string
  description:     string
  exposeX402?:     boolean
}): object {
  const chainId      = params.network === 'mainnet' ? 2345 : 48816
  const identityAddr = ERC8004_CONTRACTS[toAgentKitNetwork(params.network) as keyof typeof ERC8004_CONTRACTS].identity

  return {
    type:        'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name:        params.agentName,
    description: params.description,
    services: [
      ...(params.exposeX402 ? [{
        name:     'x402',
        endpoint: 'https://binalyst.app/api/goat/x402',
        version:  '1.0.0',
      }] : []),
      {
        name:     'MCP',
        endpoint: 'https://binalyst.app/api/goat/mcp',
        version:  '2025-06-18',
      },
    ],
    x402Support: params.exposeX402 ?? false,
    active:      true,
    registrations: [
      {
        agentRegistry: `eip155:${chainId}:${identityAddr}`,
        agentId:       params.agentId ? parseInt(params.agentId, 10) : undefined,
      },
    ],
    supportedTrust: ['reputation'],
  }
}

/** Encode registration JSON as a fully on-chain data: URI (no IPFS needed) */
export function toDataURI(obj: object): string {
  const json   = JSON.stringify(obj)
  const base64 = Buffer.from(json, 'utf8').toString('base64')
  return `data:application/json;base64,${base64}`
}