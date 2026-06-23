import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Algo Trading Platform',
  description: 'Cryptocurrency backtesting platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-surface text-white min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
