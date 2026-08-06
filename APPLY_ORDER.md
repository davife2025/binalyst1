# Binalyst v2 — Master Apply Order

Apply sessions and hotfixes in this exact order. Each session only
contains new or changed files. Drop them into the repo root — folder
structure is preserved in the zips.

## Step 0 — New repo

```bash
# Create a new GitHub repo, then apply Session 1 as the initial commit
unzip binalyst-v2-session-1-foundation.zip
cd binalyst-v2
git init && git add . && git commit -m "Session 1: foundation"
npm install
```

## Step 1 — Hotfixes (apply before testing)

```
binalyst-hotfix-agentstore-import.zip  → lib/agentStore.ts
binalyst-hotfix-agentloop-braces.zip   → lib/agentLoop.ts
```

## Step 2 — Feature sessions

```
binalyst-v2-session-2-goat.zip         → lib/goat/, app/api/goat/, hooks/, components/tabs/
  └ Apply page.PATCH-session2.ts manually to app/page.tsx

binalyst-v2-session-3-risk-profile.zip → lib/, hooks/, app/api/agent/, components/tabs/
  └ Apply app/page.PATCH-session3.ts manually to app/page.tsx

binalyst-v2-session-4-twelvedata.zip   → lib/backtester.ts, lib/skills/, app/api/

binalyst-v2-session-5-signals.zip      → app/api/agent/signals/, lib/skills/, hooks/

binalyst-v2-session-6-onboarding.zip   → components/tabs/, lib/twak/client.ts (hotfix included)
  └ Apply app/page.PATCH-session6.ts manually to app/page.tsx

binalyst-v2-session-7-agentkit.zip     → lib/goat/, app/api/goat/, components/tabs/
  └ npm install @goatnetwork/agentkit
  └ Apply page.PATCH manually

binalyst-v2-session-8-volume.zip       → lib/supabase/, app/api/, components/tabs/
  └ Run: supabase/migrations/20260802_trades.sql in Supabase SQL Editor
  └ Apply page.PATCH manually

binalyst-v2-session-9-liveprices.zip   → lib/skills/, app/api/, components/tabs/
  └ Apply page.PATCH manually

binalyst-v2-session-10-hardening.zip   → lib/env.ts, instrumentation.ts, next.config.js,
                                          components/ErrorBoundary.tsx, app/page.tsx,
                                          app/api/health/
```

## Step 3 — Bug fixes

```
binalyst-hotfix-3-liveagent-wallet.zip → app/page.tsx, components/tabs/, lib/goat/, hooks/
binalyst-hotfix-4-identity-tab.zip     → lib/goat/store.ts, components/tabs/GoatIdentityTab.tsx
```

## Step 4 — Polish sessions

```
binalyst-v2-session-11-cleanup.zip     → components/ (BottomNav, MobileDrawer, Sidebar, tabs/),
                                          lib/store.ts, lib/twak/client.ts, lib/skills/cmc.ts,
                                          app/page.tsx
                                        NOTE: lib/client.ts → lib/twak/client.ts
                                              lib/cmc.ts    → lib/skills/cmc.ts

binalyst-v2-session-12-strategies.zip  → lib/supabase/strategies.ts, app/api/strategies/
                                        Run: supabase/migrations/20260803_strategies.sql

binalyst-v2-session-13-autorestart.zip → hooks/, components/AutoRestartToast.tsx, app/page.tsx
```

## Step 5 — Repo hygiene

```
session-14: copy .env.example + .gitignore to repo root
session-15: copy README.md to repo root (overwrites Session 1 README)
```

## Verification

After applying all sessions:
```bash
npm run dev
# Open http://localhost:3000
# Click every sidebar tab — no crashes
# Open /api/health — should return { "status": "ok" }
```

## Common errors

| Error | Fix |
|-------|-----|
| `RISK_PRESETS is not defined` | Apply hotfix-agentstore-import |
| `Expression expected` in agentLoop | Apply hotfix-agentloop-braces |
| `totalX402USD.toFixed` is not a function | Apply hotfix-4-identity-tab |
| LiveAgent tab shows Performance content | Apply hotfix-3-liveagent-wallet |
| `@goatnetwork/agentkit` not found | `npm install @goatnetwork/agentkit` |
