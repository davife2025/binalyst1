'use client'

import { useState, useCallback } from 'react'
import { useStore } from '@/lib/store'

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolsUsed?: string[]
  timestamp: number
  isStreaming?: boolean
}

export type ChatMode = 'assistant' | 'analyst' | 'trader' | 'educator'

export function useChat() {
  const [messages, setMessages]   = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const { apiKey, apiSecret, autoTradeEnabled, chatMode, setChatMode } = useStore()

  const addMessage = (msg: Omit<Message, 'id' | 'timestamp'>) => {
    const full: Message = { ...msg, id: crypto.randomUUID(), timestamp: Date.now() }
    setMessages(prev => [...prev, full])
    return full.id
  }

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return

    // Add user message
    addMessage({ role: 'user', content: text })
    setStreaming(true)

    // Placeholder for streaming assistant response
    const assistantId = crypto.randomUUID()
    setMessages(prev => [...prev, {
      id: assistantId, role: 'assistant', content: '', toolsUsed: [], timestamp: Date.now(), isStreaming: true,
    }])

    try {
      // Build history for API (last 10 messages to stay within context)
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
      history.push({ role: 'user', content: text })

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey)    headers['x-binance-key']    = apiKey
      if (apiSecret) headers['x-binance-secret'] = apiSecret

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: history,
          mode: chatMode,
          autoTradeEnabled,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error('No response stream')

      let fullText = ''
      let toolsUsed: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          try {
            const json = JSON.parse(line.slice(6))
            if (json.type === 'text') {
              fullText += json.text
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: fullText } : m
              ))
            }
            if (json.type === 'done' && json.toolsUsed) {
              toolsUsed = json.toolsUsed
            }
          } catch {}
        }
      }

      // Finalise message
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: fullText, toolsUsed, isStreaming: false }
          : m
      ))

    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `Error: ${err.message}`, isStreaming: false }
          : m
      ))
    }

    setStreaming(false)
  }, [messages, streaming, apiKey, apiSecret, autoTradeEnabled, chatMode])

  const clear = () => setMessages([])

  return { messages, streaming, send, clear, chatMode, setChatMode }
}
