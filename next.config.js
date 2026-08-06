/** @type {import('next').NextConfig} */

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',   value: 'on' },
  { key: 'X-Frame-Options',          value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",   // Next.js + ethers need unsafe-eval
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",                     // Allow all HTTPS APIs + WebSocket
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig = {
  // ethers v6 + @goatnetwork/agentkit are ESM — transpile for Next.js
  transpilePackages: ['ethers', '@goatnetwork/agentkit'],

  // Instrument startup env check
  instrumentationHook: true,

  // Security headers on all routes
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },

  // Image domains
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.binance.com' },
      { protocol: 'https', hostname: 'bin.bnbstatic.com' },
      { protocol: 'https', hostname: 's2.coinmarketcap.com' },
      { protocol: 'https', hostname: 'assets.coingecko.com' },
    ],
  },

  // Webpack: resolve ethers browser fields correctly
  webpack(config) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false, net: false, tls: false,
    }
    return config
  },
}

module.exports = nextConfig
