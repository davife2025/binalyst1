/**
 * lib/exportUtils.ts
 * Export utilities — CSV trade log, performance report, on-chain proof sheet.
 * All client-side — no server round-trip needed.
 */

import type { TradeRecord, AgentSession } from './agentStore'
import type { StrategyRule }              from './signalEngine'

// ─────────────────────────────────────────────────────────────────────────────
// CSV trade log
// ─────────────────────────────────────────────────────────────────────────────

export function exportTradesCSV(trades: TradeRecord[], agentAddress: string): void {
  const headers = [
    'Date', 'Time', 'Symbol', 'Side', 'Amount (USDT)',
    'Price (USD)', 'Signal Score', 'Dry Run', 'Status',
    'Tx Hash', 'BSCScan Link', 'Reasoning',
  ]

  const rows = trades.map(t => {
    const d    = new Date(t.timestamp)
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    return [
      date,
      time,
      t.symbol,
      t.side,
      t.amountUSDT.toFixed(2),
      t.price > 0 ? t.price.toFixed(6) : '',
      t.signalScore.toFixed(0),
      t.dryRun ? 'YES' : 'NO',
      t.status,
      t.txHash || '',
      t.txHash ? `https://bscscan.com/tx/${t.txHash}` : '',
      `"${(t.reasoning ?? '').replace(/"/g, "'")}"`,
    ]
  })

  const csv = [
    `# Binalyst Competition Trade Log`,
    `# Agent: ${agentAddress}`,
    `# Exported: ${new Date().toISOString()}`,
    `# Competition contract: 0x212c61b9b72c95d95bf29cf032f5e5635629aed5`,
    '',
    headers.join(','),
    ...rows.map(r => r.join(',')),
  ].join('\n')

  downloadText(csv, `binalyst-trades-${Date.now()}.csv`, 'text/csv')
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance report (markdown)
// ─────────────────────────────────────────────────────────────────────────────

export function exportPerformanceReport(
  session:      AgentSession,
  trades:       TradeRecord[],
  rules:        StrategyRule[],
  agentAddress: string,
  strategyText: string,
): void {
  const pnlPct = session.startValueUSDT > 0
    ? (((session.currentValueUSDT - session.startValueUSDT) / session.startValueUSDT) * 100)
    : 0

  const liveTrades    = trades.filter(t => !t.dryRun)
  const dryTrades     = trades.filter(t => t.dryRun)
  const buys          = trades.filter(t => t.side === 'BUY')
  const sells         = trades.filter(t => t.side === 'SELL')
  const daysElapsed   = Math.floor((Date.now() - session.startedAt) / 86400000)
  const tradesPerDay  = daysElapsed > 0 ? (trades.length / daysElapsed).toFixed(1) : trades.length.toString()

  const onChainTxs = liveTrades
    .filter(t => t.txHash)
    .slice(0, 20)
    .map(t => `- [${t.side} ${t.symbol} $${t.amountUSDT.toFixed(2)}](https://bscscan.com/tx/${t.txHash})`)
    .join('\n')

  const report = `# Binalyst — Competition Performance Report
*Generated: ${new Date().toISOString()}*

---

## Agent
- **Address:** \`${agentAddress}\`
- **BSCScan:** https://bscscan.com/address/${agentAddress}
- **Competition contract:** 0x212c61b9b72c95d95bf29cf032f5e5635629aed5

---

## Performance Summary

| Metric | Value |
|---|---|
| Starting capital | $${session.startValueUSDT.toFixed(2)} USDT |
| Current value | $${session.currentValueUSDT.toFixed(2)} USDT |
| Peak value | $${session.peakValueUSDT.toFixed(2)} USDT |
| **Total return** | **${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%** |
| Max drawdown | ${session.drawdownPct.toFixed(1)}% |
| Days active | ${daysElapsed} |
| Total trades | ${trades.length} |
| Live on-chain | ${liveTrades.length} |
| Dry run | ${dryTrades.length} |
| Buys | ${buys.length} |
| Sells | ${sells.length} |
| Trades/day avg | ${tradesPerDay} |

---

## Strategy

${strategyText || '_No strategy text recorded._'}

### Rules (${rules.length})
${rules.map((r, i) =>
  `${i + 1}. **${r.action} ${r.symbol}** — ${r.sizePct}% portfolio — condition: ${JSON.stringify(r.condition)}`
).join('\n')}

---

## On-Chain Proof

${onChainTxs || '_No live transactions recorded yet._'}

${liveTrades.length > 20 ? `\n_... and ${liveTrades.length - 20} more. See full CSV export._` : ''}

---

## Competition Compliance

- ✅ Min 1 trade/day: ${trades.length >= daysElapsed ? 'Met' : 'NOT MET'}
- ✅ Max drawdown < 30%: ${session.drawdownPct < 30 ? `Met (${session.drawdownPct.toFixed(1)}%)` : 'EXCEEDED — DISQUALIFIED'}
- ✅ Portfolio > $1: ${session.currentValueUSDT > 1 ? 'Met' : 'At risk'}
- ✅ Eligible tokens only: Enforced at execution layer
- ✅ Registered: ${session.isRegistered ? `Yes (tx: ${session.registrationTx || 'on-chain'})` : 'No'}

---

*Binalyst · OpenClaw AI Hackathon · Built with Trust Wallet Agent Kit + CoinMarketCap AI Agent Hub*
`

  downloadText(report, `binalyst-report-${Date.now()}.md`, 'text/markdown')
}

// ─────────────────────────────────────────────────────────────────────────────
// PnL JSON (for Dorahacks submission evidence)
// ─────────────────────────────────────────────────────────────────────────────

export function exportPnLJSON(
  session:      AgentSession,
  trades:       TradeRecord[],
  agentAddress: string,
): void {
  const pnlPct = session.startValueUSDT > 0
    ? ((session.currentValueUSDT - session.startValueUSDT) / session.startValueUSDT) * 100
    : 0

  const payload = {
    meta: {
      platform:   'Binalyst',
      hackathon:  'OpenClaw AI Hackathon',
      track:      'Best Use of Trust Wallet Agent Kit (Track 1)',
      agentAddress,
      competitionContract: '0x212c61b9b72c95d95bf29cf032f5e5635629aed5',
      exportedAt: new Date().toISOString(),
    },
    performance: {
      startValueUSDT:   session.startValueUSDT,
      currentValueUSDT: session.currentValueUSDT,
      peakValueUSDT:    session.peakValueUSDT,
      pnlPct:           parseFloat(pnlPct.toFixed(2)),
      drawdownPct:      parseFloat(session.drawdownPct.toFixed(2)),
      totalTrades:      trades.length,
      liveOnChain:      trades.filter(t => !t.dryRun && t.txHash).length,
      startedAt:        new Date(session.startedAt).toISOString(),
      isRegistered:     session.isRegistered,
      registrationTx:   session.registrationTx,
    },
    onChainTrades: trades
      .filter(t => !t.dryRun && t.txHash)
      .map(t => ({
        timestamp: new Date(t.timestamp).toISOString(),
        symbol:    t.symbol,
        side:      t.side,
        amountUSDT: t.amountUSDT,
        txHash:    t.txHash,
        bscScan:   `https://bscscan.com/tx/${t.txHash}`,
      })),
  }

  downloadText(
    JSON.stringify(payload, null, 2),
    `binalyst-pnl-${Date.now()}.json`,
    'application/json',
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared download helper
// ─────────────────────────────────────────────────────────────────────────────

function downloadText(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
