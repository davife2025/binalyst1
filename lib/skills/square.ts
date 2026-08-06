/**
 * lib/skills/square.ts
 * Binance Square social posting skill.
 * Requires Binance API key — posts published to user's Square profile.
 */

import axios from 'axios'
import crypto from 'crypto'

const BASE = 'https://www.binance.com/bapi/square/v1'

function sign(secret: string, qs: string) {
  return crypto.createHmac('sha256', secret).update(qs).digest('hex')
}

export async function publishSquarePost({
  content, tags = [], apiKey, apiSecret,
}: {
  content: string; tags?: string[]; apiKey: string; apiSecret: string
}): Promise<{ success: boolean; postId?: string; message: string }> {
  const timestamp = Date.now()
  const qs  = `timestamp=${timestamp}&recvWindow=5000`
  const sig = sign(apiSecret, qs)
  try {
    const { data } = await axios.post(
      `${BASE}/private/square/post/create?${qs}&signature=${sig}`,
      { content, tags: tags.map(t => t.replace(/^#/, '')), timestamp, recvWindow: 5000 },
      { headers: { 'X-MBX-APIKEY': apiKey, 'Content-Type': 'application/json' } }
    )
    if (data.code === '000000' || data.success) {
      return { success: true, postId: data.data?.postId ?? data.data?.id, message: 'Published to Binance Square!' }
    }
    return { success: false, message: data.message || data.msg || 'Publish failed' }
  } catch (err: any) {
    return { success: false, message: err?.response?.data?.msg || err.message || 'Publish failed' }
  }
}

export async function getMySquarePosts({ apiKey, apiSecret, page = 1, size = 10 }: { apiKey: string; apiSecret: string; page?: number; size?: number }) {
  const timestamp = Date.now()
  const qs  = `timestamp=${timestamp}&recvWindow=5000&page=${page}&size=${size}`
  const sig = sign(apiSecret, qs)
  try {
    const { data } = await axios.get(
      `${BASE}/private/square/post/my-posts?${qs}&signature=${sig}`,
      { headers: { 'X-MBX-APIKEY': apiKey } }
    )
    return data.data?.list ?? data.data ?? []
  } catch { return [] }
}

export async function getSquareFeed({ page = 1, size = 10 } = {}) {
  try {
    const { data } = await axios.get(`${BASE}/public/square/post/list`, { params: { page, size, type: 'HOT' } })
    return data.data?.list ?? data.data ?? []
  } catch { return [] }
}

export function buildPostPrompt(topic: string, tone: string): string {
  return `Write a Binance Square post about: "${topic}".
Tone: ${tone}.
Rules:
- Max 280 characters for the main text
- End with 2-4 relevant hashtags on a new line starting with #
- Sound like a real crypto trader/analyst, not a bot
- Be informative and engaging
Return ONLY the post text + hashtags, nothing else.`
}
