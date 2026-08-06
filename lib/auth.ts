/**
 * lib/auth.ts — Session H2 hotfix
 * Compatible with next-auth v4 (which the project uses) under Next.js 16.
 * Key change: removes any next-auth/middleware imports (already in middleware.ts fix).
 * Also adds NEXTAUTH_SECRET fallback so the app starts even without the env var.
 */

import type { NextAuthOptions } from 'next-auth'
import GoogleProvider            from 'next-auth/providers/google'
import CredentialsProvider       from 'next-auth/providers/credentials'

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID ? [
      GoogleProvider({
        clientId:     process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      }),
    ] : []),

    CredentialsProvider({
      name: 'Binalyst',
      credentials: {
        email:     { label: 'Email',     type: 'email'    },
        password:  { label: 'Password',  type: 'password' },
        anonymous: { label: 'Anonymous', type: 'text'     },
      },
      async authorize(credentials) {
        // Guest login
        if (credentials?.anonymous === 'true') {
          const guestId = `guest_${Math.random().toString(36).slice(2, 10)}`
          return {
            id:    guestId,
            email: `${guestId}@guest.binalyst.com`,
            name:  'Guest',
          }
        }

        if (!credentials?.email || !credentials?.password) return null

        // Try Supabase if configured
        if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
          try {
            const { signIn: sb } = await import('./supabase')
            const { user, error } = await sb(credentials.email, credentials.password)
            if (!error && user) {
              return {
                id:    user.id,
                email: user.email ?? '',
                name:  user.user_metadata?.display_name
                       ?? user.email?.split('@')[0]
                       ?? 'User',
              }
            }
          } catch {
            // Fall through to demo accounts
          }
        }

        // Demo accounts (fallback for development)
        const DEMO = [
          { id: '1', email: 'demo@binalyst.com',  password: 'demo1234',  name: 'Demo User'  },
          { id: '2', email: 'admin@binalyst.com', password: 'admin1234', name: 'Admin User' },
        ]
        return DEMO.find(
          u => u.email === credentials.email && u.password === credentials.password
        ) ?? null
      },
    }),
  ],

  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },

  pages: { signIn: '/login', signOut: '/login', error: '/login' },

  callbacks: {
    async jwt({ token, user, account }) {
      if (user)    { token.id = user.id; token.isGuest = String(user.id).startsWith('guest_') }
      if (account) token.provider = account.provider
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id       = token.id
        ;(session.user as any).isGuest  = token.isGuest
        ;(session.user as any).provider = token.provider
      }
      return session
    },
  },

  // Fallback secret so Next.js doesn't crash on startup without env var
  secret: process.env.NEXTAUTH_SECRET ?? 'binalyst-dev-secret-change-in-production',
}
