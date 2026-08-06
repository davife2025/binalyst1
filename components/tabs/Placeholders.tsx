'use client'

function TabPlaceholder({ icon, title, session, desc }: {
  icon: string; title: string; session: string; desc: string
}) {
  return (
    <div className="flex items-center justify-center h-full flex-col gap-4 p-8" style={{background:"var(--bg)"}}>
      <div
        className="w-14 h-14 rounded-md flex items-center justify-center text-xl font-bold"
        style={{ background: 'rgba(240,185,11,0.08)', color: 'var(--yellow)', border: '1px solid var(--border2)' }}
      >
        <span style={{fontFamily:"var(--font-space-mono)",fontWeight:800}}>{icon}</span>
      </div>
      <div className="text-center">
        <h2 className="text-base font-extrabold uppercase tracking-tight" style={{ color: 'var(--text)' }}>{title}</h2>
        <p className="text-sm mt-1 max-w-xs" style={{ color: 'var(--text2)' }}>{desc}</p>
      </div>
      <div
        className="mono text-xs px-4 py-2 rounded-md"
        style={{ background: 'var(--bg3)', color: 'var(--text3)', border: '1px solid var(--border)' }}
      >
        {session}
      </div>
    </div>
  )
}

export function EventsTab() {
  return <TabPlaceholder icon="◎" title="Events Radar" session="S6" desc="Live Binance events scanner, calendar export and countdowns coming in Session 6." />
}

export function LearnTab() {
  return <TabPlaceholder icon="◉" title="Crypto Academy" session="S7" desc="AI-powered lessons and quiz generator coming in Session 7." />
}

export function PortfolioTab() {
  return <TabPlaceholder icon="◑" title="My Portfolio" session="S5" desc="Live Binance portfolio sync with P&L and AI advisor coming in Session 5." />
}

export default TabPlaceholder