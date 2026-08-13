# Binalyst v2 — Autonomous Trading Platform

Binalyst is a self-custodial autonomous trading platform built on GOAT
Network. Users connect or generate a wallet, pick a market and asset,
build a strategy, backtest it, set their risk tolerance, and let the agent
trade autonomously — across crypto, forex, stocks, and meme coins.

## Architecture

```
Signal engine (23 indicators) → strategy rules → guardrails → KeeperHub execution
       ↓                              ↓                              ↓
   CMC / Binance              user RiskProfile          simulate → broadcast → verify
   Twelve Data                   (not hardcoded)         Uniswap V3 on GOAT Network,
   DexScreener                                           signed by KeeperHub's wallet
```

GOAT Network is the chain the agent trades on — chain ID `2345` (mainnet) /
`48816` (testnet3). [KeeperHub](https://docs.keeperhub.com) is the
execution layer in front of it, **not a chain of its own**: it has no
chainId, RPC, or explorer — it holds the signing wallet, applies smart gas
estimation and MEV-protected private routing, and returns a chain-verified
receipt for every trade against whichever chain it's pointed at. See
`lib/keeperhub/client.ts` and
[`KEEPERHUB_MIGRATION.md`](./KEEPERHUB_MIGRATION.md) for the full
rationale, and the **KeeperHub status panel** in the header (next to the
GOAT network pill on any GOAT tab) for live status, what it's currently
signing for, and a link to the last execution's receipt.

## Stack

- **Framework**: Next.js 15 App Router, TypeScript
- **State**: Zustand with localStorage persistence
- **Database**: Supabase (Postgres, RLS, real-time)
- **Auth**: NextAuth.js
- **Blockchain**: GOAT Network (EVM, BTC gas, chain ID 2345 mainnet / 48816 testnet3)
- **Execution**: [KeeperHub](https://docs.keeperhub.com) Direct Execution API — Uniswap V3 on GOAT Mainnet, signed and broadcast by KeeperHub (see `lib/keeperhub/`). Not a chain itself — see Architecture above.
- **Agent identity**: ERC-8004 (GOAT AgentKit SDK) — unchanged, still GOAT-specific
- **Payments**: x402 machine-to-machine (GOAT AgentKit SDK) — unchanged; KeeperHub also offers its own Tempo/x402 tooling if you want to consolidate later
- **Market data**: CMC (crypto), Twelve Data (forex/stocks), DexScreener (meme)

## Markets supported

| Market | Data source | Execution |
|--------|------------|-----------|
| Crypto | Binance + CMC | GOAT Network (Uniswap V3) |
| Forex | Twelve Data | Signal-only (no direct execution) |
| Stocks | Twelve Data | Signal-only (no direct execution) |
| Meme coins | CMC + DexScreener | GOAT Network |

## Quick start

```bash
git clone https://github.com/your-org/binalyst-v2
cd binalyst-v2
npm install
cp .env.example .env.local    # see "Environment variables" below — create
                               # this file yourself if it isn't in your clone
npm run dev                   # http://localhost:3000
```

## Environment variables

There's no `.env.example` checked into this copy of the repo — create
`.env.local` by hand with the variables below (all read/validated in
`lib/env.ts`).

**Required**

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `CMC_API_KEY` | CoinMarketCap API key (crypto market data) |

**Optional** (features degrade gracefully without them; `GET /api/health`
reports which are active)

| Variable | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side trade persistence |
| `TWELVE_DATA_API_KEY` | Forex/stocks signals and live prices |
| `KEEPERHUB_API_KEY` | Gates **mainnet** execution — KeeperHub signs/broadcasts all live trades |
| `KEEPERHUB_API_BASE_URL` | Override KeeperHub API base (defaults to `https://app.keeperhub.com`) |
| `GOAT_AGENT_PRIVATE_KEY` | Testnet3-only local dry-run fallback — never used for mainnet |
| `GOAT_X402_API_KEY` / `GOAT_X402_BASE_URL` | x402 autonomous payments |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | Session auth (URL required in production) |

## Setup checklist

1. Create a Supabase project at supabase.com.
2. Run the two migrations in Supabase SQL Editor:
   - `supabase/migrations/20260802_trades.sql`
   - `supabase/migrations/20260803_strategies.sql`
3. Get a free CoinMarketCap API key at coinmarketcap.com/api.
4. Get a free Twelve Data API key at twelvedata.com (for forex/stocks).
5. Fill in `.env.local` (see "Environment variables" above).
6. Open the app and use the Onboarding wizard (7 steps) — pick **GOAT
   Testnet3** for your first run.
7. Fund your agent wallet with free testnet BTC:
   - Open the **Wallet** tab and copy your agent address (or generate one
     via Onboarding first if you haven't).
   - Visit [faucet.goat.network](https://faucet.goat.network), paste the
     address, and claim test BTC — it's the native gas token on GOAT
     (18 decimals, displayed as `BTC` everywhere, not `ETH`).
   - Balance updates within a block or two via `rpc.testnet3.goat.network`.
   - Swaps simulate locally on testnet3 (Uniswap V3 isn't deployed there
     yet); native BTC transfers go through KeeperHub's real
     simulate → broadcast → verify sequence on testnet3 too, if
     `KEEPERHUB_API_KEY` is set — so it's the safe place to generate a
     real KeeperHub execution receipt before touching mainnet.
8. Set `KEEPERHUB_API_KEY` once you're ready for **mainnet** trades — see
   [`KEEPERHUB_MIGRATION.md`](./KEEPERHUB_MIGRATION.md) for wallet setup
   at [app.keeperhub.com](https://app.keeperhub.com).

## UI: KeeperHub status panel

On any GOAT tab (Onboarding, Live Agent, Wallet, GOAT Identity), the
header shows two separate pills once a wallet is loaded:

- **GOAT network pill** — which chain the agent is on (GOAT Mainnet /
  GOAT Testnet3).
- **KeeperHub pill** — click to expand. Shows whether KeeperHub is
  configured, which chain it's currently executing against, signing
  method, gas estimation, MEV protection, gas sponsorship, and the most
  recent trade's status with a link to its receipt on the GOAT explorer.

These are deliberately two separate controls, not one: KeeperHub isn't a
chain you switch to, it's the signer executing on whichever chain the
network pill shows. See `components/agent/KeeperHubStatusPanel.tsx`.

## Session build history

All sessions are in the `/sessions` folder of this repo (or separate zips):

| Session | Description |
|---------|-------------|
| 1  | Foundation — clean codebase, RiskProfile |
| 2  | GOAT Network client + Live Agent tab |
| 3  | Risk Profile tab |
| 4  | Twelve Data (forex/stocks) |
| 5  | Multi-market signal engine |
| 6  | Onboarding wizard |
| 7  | x402 + ERC-8004 identity (AgentKit) |
| 8  | Supabase trade persistence + Volume Dashboard |
| 9  | Live price feeds |
| 10 | Production hardening |
| 11 | Competition/BSC removal + Wallet Fund & Send tab |
| 12 | Strategy persistence to Supabase |
| 13 | Agent auto-restart after page reload |
| 14 | KeeperHub migration — execution moved off local signing |
| 15 | KeeperHub status panel — dedicated execution-status UI |
| HF1 | Fix: RISK_PRESETS import in agentStore |
| HF2 | Fix: missing braces in agentLoop |
| HF3 | Fix: LiveAgentTab wiring + AgentWalletTab |
| HF4 | Fix: totalX402USD undefined in GoatIdentityTab |

## Key concepts

**RiskProfile** — replaces all hardcoded competition guardrails. Every
agent cycle checks the user's configured `maxDrawdownPct`, `maxPositionPct`,
`maxDailyTrades`, `stopLossPct`, `slippagePct`. Set in the Risk Profile tab.

**Dry run mode** — the agent evaluates signals and rules but sends no
real transactions. Default: on. Flip in the Live Agent tab.

**Autonomous mode** — real on-chain transactions. Requires dry run off +
`KEEPERHUB_API_KEY` configured with a funded, wallet-linked KeeperHub
organization (see `KEEPERHUB_MIGRATION.md`). On mainnet the agent never
signs locally — every trade goes through KeeperHub's simulate → broadcast
→ verified-receipt sequence.

**ERC-8004** — the agent registers an on-chain identity (ERC-721 NFT) via
GOAT AgentKit. Makes the agent discoverable and trackable across the GOAT
ecosystem. Registration is one-click in the GOAT Identity tab.

**x402** — machine-to-machine payment protocol. The agent autonomously
pays for premium signal data without human approval. Requires
`GOAT_X402_API_KEY` in `.env.local`.

## License

MIT
