/**
 * instrumentation.ts — Session 10
 *
 * Next.js instrumentation hook — runs once at server startup
 * (before any request is served). Validates env vars early so
 * the developer sees a clear error instead of a cryptic runtime crash.
 *
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('./lib/env')
    const { ok, missing } = validateEnv()

    if (!ok) {
      // In development, log a clear error but don't crash the server
      // so the developer can see the UI and fix env vars one by one.
      // In production (CI/deploy), throw to fail the deployment fast.
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          `[binalyst] Cannot start: missing required env vars:\n  ${missing.join('\n  ')}`
        )
      }
    }
  }
}
