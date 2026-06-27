import type { Metadata } from 'next'
import './globals.css'
import { BacktestProvider } from '@/context/BacktestContext'
import Toast from '@/components/layout/Toast'

export const metadata: Metadata = {
  title: 'Algo Trading Platform',
  description: 'Cryptocurrency backtesting platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-surface text-white min-h-screen font-sans antialiased">
        <BacktestProvider>
          {children}
          <Toast />
        </BacktestProvider>
      </body>
    </html>
  )
}
