# Binalyst v2 — Autonomous Trading Platform

Binalyst is a self-custodial autonomous trading platform built on GOAT
Network. Users connect or generate a wallet, pick a market and asset,
build a strategy, backtest it, set their risk tolerance, and let the agent
trade autonomously — across crypto, forex, stocks, and meme coins.

## Architecture

```
Signal engine (23 indicators) → strategy rules → guardrails → GOAT execution
       ↓                              ↓                              ↓
   CMC / Binance              user RiskProfile               Uniswap V3 on
   Twelve Data                   (not hardcoded)             GOAT Network
   DexScreener
```

## Stack

- **Framework**: Next.js 15 App Router, TypeScript
- **State**: Zustand with localStorage persistence
- **Database**: Supabase (Postgres, RLS, real-time)
- **Auth**: NextAuth.js
- **Blockchain**: GOAT Network (EVM, BTC gas, chain ID 2345)
- **Execution**: Uniswap V3 on GOAT Mainnet via ethers.js v6
- **Agent identity**: ERC-8004 (GOAT AgentKit SDK)
- **Payments**: x402 machine-to-machine (GOAT AgentKit SDK)
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
cp .env.example .env.local    # fill in your values
npm run dev                   # http://localhost:3000
```

## Setup checklist

1. Create a Supabase project at supabase.com
2. Run the two migrations in Supabase SQL Editor:
   - `supabase/migrations/20260802_trades.sql`
   - `supabase/migrations/20260803_strategies.sql`
3. Get a free CoinMarketCap API key at coinmarketcap.com/api
4. Get a free Twelve Data API key at twelvedata.com (for forex/stocks)
5. Fill in `.env.local` (see `.env.example` for all variables)
6. Open the app and use the Onboarding wizard (7 steps)
7. Get testnet BTC from faucet.goat.network to test without real funds

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
GOAT agent private key configured.

**ERC-8004** — the agent registers an on-chain identity (ERC-721 NFT) via
GOAT AgentKit. Makes the agent discoverable and trackable across the GOAT
ecosystem. Registration is one-click in the GOAT Identity tab.

**x402** — machine-to-machine payment protocol. The agent autonomously
pays for premium signal data without human approval. Requires
`GOAT_X402_API_KEY` in `.env.local`.

## License

MIT
