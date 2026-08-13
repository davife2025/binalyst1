# Migrating execution from raw ethers signing to KeeperHub

This changes **who signs and broadcasts transactions**, not which chain
Binalyst trades on. GOAT Network (BTC-gas L2, Uniswap V3) is still the
chain. KeeperHub (https://docs.keeperhub.com) is now the execution layer
in front of it, per the hackathon's "every submission must use KeeperHub
as its onchain execution layer" rule.

## What changed

| | Before | After |
|---|---|---|
| Signing | `ethers.Wallet(privateKey)` in this process | KeeperHub's org wallet (Turnkey/Safe-backed), via the Direct Execution API |
| Gas | Fixed `gasLimit` constants | KeeperHub's smart gas estimation with backoff |
| MEV | None | KeeperHub private routing |
| Safety | Straight to broadcast | `simulate: true` preflight → broadcast → poll for a chain-verified receipt (KeeperHub's documented "safe first-write sequence") |
| Idempotency | None — a retried request could double-trade | `Idempotency-Key` derived per KeeperHub's stable-key rules, time-bucketed per agent cycle |
| Audit trail | Supabase trade log only | Supabase **plus** KeeperHub's own execution log (`executionId`, receipts, gas used) |
| Private key transmission | Sent from browser → API route on every cycle | Never sent for mainnet trades — the browser only sends the wallet **address**; KeeperHub owns the signer |

Files:
- **New**: `lib/keeperhub/config.ts`, `lib/keeperhub/client.ts` — the KeeperHub Direct Execution API wrapper (simulate, broadcast, idempotency, status polling).
- **Changed**: `lib/goat/client.ts` — `swap()` and `sendBTC()` now call KeeperHub on mainnet instead of signing locally. Reads (`getBTCBalance`, `getSwapQuote`, etc.) are unchanged — still direct RPC, no key needed.
- **Changed**: `app/api/goat/loop/route.ts` — accepts `agentAddress` instead of requiring `privateKey`; builds a per-cycle idempotency task id.
- **Changed**: `hooks/useGoatAgentLoop.ts` — sends `agentAddress` (not the private key) for mainnet cycles.
- **Changed**: `lib/env.ts`, `app/api/health/route.ts`, `.env.example` — `KEEPERHUB_API_KEY` is now the gate on real trades; `GOAT_AGENT_PRIVATE_KEY` is relabeled as testnet3-only dev fallback.

## Setup

1. Create a KeeperHub org and API key at [app.keeperhub.com](https://app.keeperhub.com) → Settings → API Keys → Organisation tab.
2. Configure the org's wallet in KeeperHub (Turnkey or Safe — see [Wallet Management](https://docs.keeperhub.com/wallet-management)). This is the wallet that will actually hold funds and sign trades.
3. Set `KEEPERHUB_API_KEY=kh_...` in `.env.local`.
4. `GET /api/health` now reports `keeperhub_execution: true` once that's wired up.
5. Point `agentAddress` in the app at the KeeperHub-managed wallet's address (from `kh wallet info` or the dashboard) rather than a locally-generated key.

## What this does NOT yet cover (left as-is / follow-up)

- **`lib/goat/agentkit.ts`** — ERC-8004 identity registration and the GOAT AgentKit x402 payer flow are GOAT-specific (not part of KeeperHub) and still sign with a raw private key via `@goatnetwork/agentkit`. KeeperHub does have its own Tempo/x402 payment tooling (`tempo_sign_and_hold`, agentic wallet PreToolUse hook) if you want to replace this too — see https://docs.keeperhub.com/agent/agentic-wallet.
- **UI tabs** (`GoatIdentityTab`, `AgentWalletTab`, `LiveAgentTab`) still present a "generate/import private key" flow. Functionally trades no longer use that key on mainnet, but the UI text/flow hasn't been reworded yet to reflect "connect a KeeperHub-managed wallet" instead of "generate a wallet". Worth a follow-up pass so the UX doesn't imply the browser-held key is what trades.
- **Per-agent MCP / marketplace listing** — the hackathon rewards using KeeperHub's MCP server / listing surfaces too (`list_action_schemas`, publishing the agent as a callable workflow via `list_workflow`). This migration wires the *Direct Execution API* path (best fit for a server-driven trading loop); wiring the agent up as an MCP-callable workflow is a separate, additive piece if you want to also hit that judging criterion.
- **WBTC/USDC token addresses** on GOAT mainnet were already unconfirmed placeholders before this change (`lib/goat/config.ts`) — swap execution for ERC-20 legs still won't run for real until those are confirmed against `explorer.goat.network/tokens`. Native BTC transfers work end-to-end today.

## Submission checklist (from the hackathon rules)

- [ ] Link to source (this repo)
- [ ] Demo video showing the agent executing through KeeperHub
- [ ] A link to a transaction the agent executed via KeeperHub — once `KEEPERHUB_API_KEY` + the org wallet are configured, run the Live Agent loop with `dryRun: false` on a testnet chain first (KeeperHub simulate → broadcast still applies), confirm a `receipts[].verified: true` entry via `GET /api/execute/{executionId}/status`, then move to mainnet.
