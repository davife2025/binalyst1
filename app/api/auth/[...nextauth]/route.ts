/**
 * app/api/auth/[...nextauth]/route.ts
 * next-auth handler — App Router compatible.
 * This file must exist at this exact path for next-auth v4 to work
 * with Next.js App Router (including v16).
 */

import NextAuth            from 'next-auth'
import { authOptions }     from '@/lib/auth'

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
