/**
 * lib/rateLimit.ts
 * Simple in-memory rate limiter for API routes.
 * On Vercel, use Vercel KV for distributed rate limiting across instances.
 */

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export interface RateLimitConfig {
  windowMs: number   // time window in ms
  max: number        // max requests per window
}

const LIMITS: Record<string, RateLimitConfig> = {
  'ai-chat':     { windowMs: 60_000, max: 20  },  // 20 AI requests/min
  'market':      { windowMs: 10_000, max: 30  },  // 30 market requests/10s
  'trade':       { windowMs: 60_000, max: 10  },  // 10 trade requests/min
  'events-scan': { windowMs: 60_000, max: 5   },  // 5 scans/min
  'default':     { windowMs: 60_000, max: 60  },  // 60 req/min default
}

export function rateLimit(key: string, type: keyof typeof LIMITS = 'default'): {
  allowed: boolean
  remaining: number
  resetAt: number
} {
  const config = LIMITS[type] ?? LIMITS.default
  const now    = Date.now()
  const entry  = rateLimitMap.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + config.windowMs })
    return { allowed: true, remaining: config.max - 1, resetAt: now + config.windowMs }
  }

  entry.count++

  if (entry.count > config.max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  return { allowed: true, remaining: config.max - entry.count, resetAt: entry.resetAt }
}

// Clean up old entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    rateLimitMap.forEach((entry, key) => {
  if (now > entry.resetAt) rateLimitMap.delete(key)
})
  }, 300_000)
}
