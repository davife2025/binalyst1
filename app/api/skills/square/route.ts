import { NextRequest, NextResponse } from 'next/server'
import { publishSquarePost, getMySquarePosts, getSquareFeed } from '@/lib/skills/square'
import { getCredentialsFromHeaders } from '@/lib/binance'
import { rateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const rl = rateLimit(`square:${ip}`, 'default')
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const body   = await req.json()
  const { action, ...params } = body
  const creds  = getCredentialsFromHeaders(req.headers)

  try {
    switch (action) {
      case 'publish': {
        if (!creds) return NextResponse.json({ error: 'Binance API key required to post' }, { status: 401 })
        const result = await publishSquarePost({ ...params, apiKey: creds.apiKey, apiSecret: creds.apiSecret })
        return NextResponse.json({ success: result.success, data: result })
      }
      case 'my_posts': {
        if (!creds) return NextResponse.json({ error: 'Binance API key required' }, { status: 401 })
        const posts = await getMySquarePosts({ apiKey: creds.apiKey, apiSecret: creds.apiSecret, page: params.page, size: params.size })
        return NextResponse.json({ success: true, data: posts })
      }
      case 'feed': {
        const posts = await getSquareFeed({ page: params.page, size: params.size })
        return NextResponse.json({ success: true, data: posts })
      }
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
