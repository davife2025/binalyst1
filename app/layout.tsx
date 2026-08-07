import type { Metadata, Viewport } from 'next'
import Providers from '@/components/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Binalyst — AI Trading Platform',
  description: 'Autonomous trading agent powered by CMC signals, AI strategy, and TWAK self-custody signing ',
  icons: { icon: '/favicon.ico' },
  openGraph: {
    title: 'Binalyst  AI Trading Platform',
    description: 'Autonomous BSC trading agent · CMC intelligence · Self-custodial TWAK signing · Live competition',
    type: 'website',
  },
  keywords: [
    'BNB Chain', 'AI Trading', 'Autonomous Agent', 'BSC', 'CMC',
    'CoinMarketCap', 'Trust Wallet', 'TWAK', 'DeFi', 'PancakeSwap',
    'Fear and Greed', 'Trading Bot', 'Binance', 'Web3',
  ],
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B0E11',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
