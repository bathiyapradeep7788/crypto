import type { Metadata } from 'next'
import './globals.css'
import { ErrorToastContainer } from '@/components/ErrorToast'

export const metadata: Metadata = {
  title: 'Algo Trading Platform',
  description: 'Cryptocurrency backtesting platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-surface text-white min-h-screen font-sans antialiased">
        <ErrorToastContainer>
          {children}
        </ErrorToastContainer>
      </body>
    </html>
  )
}
