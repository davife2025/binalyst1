'use client'

import { useRef, useState } from 'react'

type Msg = { role: 'user' | 'assistant'; content: string; id: string }

const LESSONS = [
  { icon: '📊', title: 'Spot Trading Basics',     level: 'beginner',     prompt: 'Explain spot trading: order types (market, limit, stop-limit), how to read the order book, trading fees, and tips for beginners. Use real-world examples from any major exchange.' },
  { icon: '⚡', title: 'Futures & Leverage',       level: 'intermediate', prompt: 'Explain Binance Futures: long vs short, leverage, margin, liquidation price, funding rates. Give a practical example with numbers.' },
  { icon: '🌾', title: 'DeFi Yield Farming',       level: 'beginner',     prompt: 'How does DeFi liquidity protocols work? How do I stake BNB or FDUSD to earn new tokens? What are the risks? Give step-by-step instructions.' },
  { icon: '🪂', title: 'Token Airdrops & Rewards',          level: 'intermediate', prompt: 'What are crypto airdrops? How do I qualify? What is early-stage crypto projects? Walk me through how to claim step by step.' },
  { icon: '🔄', title: 'DCA & Auto-Invest',        level: 'beginner',     prompt: 'Explain dollar-cost averaging (DCA) for crypto. How does crypto auto-invest tools work? What are the best practices and how to set it up?' },
  { icon: '🔗', title: 'On-Chain Analysis',        level: 'advanced',     prompt: 'Explain on-chain analysis for crypto trading: exchange inflows/outflows, whale wallets, SOPR, MVRV. How can I use this to trade better in crypto?' },
  { icon: '📈', title: 'Technical Analysis',       level: 'intermediate', prompt: 'Teach me practical TA for crypto: support/resistance, RSI, MACD, Bollinger Bands. How do I apply these using charting tools?' },
  { icon: '🛡️', title: 'Risk Management',          level: 'beginner',     prompt: 'Explain crypto risk management: position sizing, stop-losses, portfolio allocation. What are the golden rules for trading safely?' },
  { icon: '💰', title: 'Crypto Staking & Earning',             level: 'beginner',     prompt: 'What are all the Crypto Staking & Earning products? Simple Earn, Flexible, Locked, ETH staking, LDUSDT. Compare them and tell me which is best for different goals.' },
]

const LEVEL_STYLE = {
  beginner:     { bg: 'rgba(14,203,129,0.1)',  color: '#0ECB81' },
  intermediate: { bg: 'rgba(240,185,11,0.1)',  color: '#F0B90B' },
  advanced:     { bg: 'rgba(246,70,93,0.1)',   color: '#F6465D' },
}

function fmtContent(text: string) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--yellow);font-weight:600">$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code style="font-family:monospace;background:var(--bg);padding:1px 5px;border-radius:3px;font-size:11px;color:var(--green)">$1</code>')
    .replace(/^#{1,3} (.+)$/gm, '<div style="font-size:13px;font-weight:700;color:var(--yellow);margin:8px 0 4px">$1</div>')
    .replace(/^[-*] (.+)$/gm, '<div style="display:flex;gap:6px;margin:2px 0"><span style="color:var(--yellow)">›</span><span>$1</span></div>')
    .replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>')
}

export default function LearnTab() {
  const [messages, setMessages] = useState<Msg[]>([{
    id: '0', role: 'assistant',
    content: "Hey! I'm your Binalyst trading tutor. Click a lesson above to start learning, or ask me anything about crypto, DeFi, GOAT Network, autonomous trading, or forex. I'll explain it clearly with real examples. 🎓",
  }])
  const [input, setInput]         = useState('')
  const [streaming, setStreaming] = useState(false)
  const [topic, setTopic]         = useState('Ask the Crypto Tutor')
  const [quizLoading, setQL]      = useState(false)
  const [quiz, setQuiz]           = useState('')
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const inputRef                  = useRef<HTMLInputElement>(null)

  async function sendMessage(text: string) {
    if (!text.trim() || streaming) return
    setInput('')

    const userMsg: Msg = { id: crypto.randomUUID(), role: 'user', content: text }
    const asstId = crypto.randomUUID()
    const asstMsg: Msg = { id: asstId, role: 'assistant', content: '' }

    setMessages(prev => [...prev, userMsg, asstMsg])
    setStreaming(true)

    // Build history
    const history = [...messages, userMsg].slice(-12).map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, mode: 'educator' }),
      })
      const reader = res.body?.getReader(); const dec = new TextDecoder()
      if (!reader) return
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        for (const line of dec.decode(value).split('\n').filter(l => l.startsWith('data: '))) {
          try {
            const j = JSON.parse(line.slice(6))
            if (j.type === 'text') setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: m.content + j.text } : m))
          } catch {}
        }
      }
    } catch (e: any) {
      setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: 'Error: ' + (e as any).message } : m))
    }
    setStreaming(false)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  async function startLesson(lesson: typeof LESSONS[0]) {
    setTopic(lesson.title); setQuiz('')
    await sendMessage(lesson.prompt)
  }

  async function generateQuiz() {
    const lastAI = [...messages].reverse().find(m => m.role === 'assistant')
    if (!lastAI) return
    setQL(true); setQuiz('')
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Based on this explanation: "${lastAI.content.slice(0, 500)}..." — generate 3 multiple choice quiz questions to test understanding. Format: Q1. [question] A) B) C) D) Answer: [letter]. Keep it concise and educational.`,
          }],
          mode: 'educator',
        }),
      })
      const reader = res.body?.getReader(); const dec = new TextDecoder()
      if (!reader) return
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        for (const line of dec.decode(value).split('\n').filter(l => l.startsWith('data: '))) {
          try { const j = JSON.parse(line.slice(6)); if (j.type === 'text') setQuiz(p => p + j.text) } catch {}
        }
      }
    } catch {}
    setQL(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col gap-6">

      {/* Lesson cards */}
      <div>
        <div className="mono text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--text3)' }}>Lessons</div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {LESSONS.map(lesson => {
            const ls = LEVEL_STYLE[lesson.level as keyof typeof LEVEL_STYLE]
            return (
              <button key={lesson.title} onClick={() => startLesson(lesson)} disabled={streaming}
                className="rounded-xl p-4 text-left transition-all"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', opacity: streaming ? 0.6 : 1, cursor: streaming ? 'not-allowed' : 'pointer' }}
                onMouseEnter={e => { if (!streaming) (e.currentTarget as HTMLElement).style.borderColor = 'var(--yellow)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
                <div className="text-2xl mb-2">{lesson.icon}</div>
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>{lesson.title}</div>
                <span className="mono text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest"
                  style={{ background: ls.bg, color: ls.color }}>{lesson.level}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tutor chat */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--bg2)' }}>
          <div>
            <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>{topic}</div>
            <div className="mono text-[10px]" style={{ color: 'var(--text3)' }}>Powered by Claude · Use web search for latest data</div>
          </div>
          {messages.length > 1 && (
            <button onClick={generateQuiz} disabled={quizLoading || streaming}
              className="flex items-center gap-2 mono text-xs px-3 py-1.5 rounded-lg transition-all"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: quizLoading ? 'not-allowed' : 'pointer' }}>
              {quizLoading && <span className="w-3 h-3 rounded-full border-2 animate-spin-slow" style={{ borderColor: 'var(--border2)', borderTopColor: 'var(--yellow)' }} />}
              {quizLoading ? 'Generating...' : '⚡ Quiz me'}
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex flex-col gap-4 p-5 overflow-y-auto" style={{ background: 'var(--bg)', maxHeight: 420 }}>
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 mono text-[10px] font-bold"
                style={{ background: msg.role === 'assistant' ? 'var(--yellow)' : 'var(--bg4)', color: msg.role === 'assistant' ? '#000' : 'var(--text2)' }}>
                {msg.role === 'assistant' ? 'B' : 'ME'}
              </div>
              <div className="max-w-[80%] px-4 py-3 rounded-xl text-sm leading-relaxed"
                style={{
                  background: msg.role === 'user' ? 'var(--yellow-glow)' : 'var(--bg2)',
                  border: msg.role === 'user' ? '1px solid rgba(240,185,11,0.2)' : '1px solid var(--border)',
                  color: 'var(--text)',
                  borderTopRightRadius: msg.role === 'user' ? 4 : undefined,
                  borderTopLeftRadius:  msg.role === 'assistant' ? 4 : undefined,
                }}>
                {msg.role === 'assistant' && !msg.content
                  ? <div className="flex gap-1 py-1">{[0,1,2].map(i => <span key={i} className="typing-dot" style={{ animationDelay: `${i*0.2}s` }} />)}</div>
                  : <div dangerouslySetInnerHTML={{ __html: fmtContent(msg.content) }} />
                }
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg2)' }}>
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendMessage(input) }}
            disabled={streaming} placeholder="Ask me anything about crypto, DeFi, trading, or GOAT Network..."
            className="flex-1 mono text-sm px-4 py-2.5 rounded-xl outline-none"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}
            onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || streaming}
            className="px-4 py-2 rounded-xl font-bold text-xs transition-all"
            style={{ background: input.trim() && !streaming ? 'var(--yellow)' : 'var(--bg4)', color: input.trim() && !streaming ? '#000' : 'var(--text3)', cursor: input.trim() && !streaming ? 'pointer' : 'not-allowed' }}>
            Ask →
          </button>
        </div>
      </div>

      {/* Quiz section */}
      {quiz && (
        <div className="rounded-xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <div className="mono text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--text3)' }}>Quiz</div>
          <div className="text-sm leading-relaxed" style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}
            dangerouslySetInnerHTML={{ __html: fmtContent(quiz) }} />
        </div>
      )}
    </div>
  )
}
