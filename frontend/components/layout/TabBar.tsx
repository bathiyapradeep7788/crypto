'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/backtest',    label: 'Backtest Bot'      },
  { href: '/paper-trade', label: 'Paper Trade'        },
  { href: '/live-trade',  label: 'Live Actual Trade'  },
  { href: '/logs',        label: 'System Logs'        },
]

export default function TabBar() {
  const pathname = usePathname()

  return (
    <header className="bg-surface-card border-b border-surface-border">
      <div className="max-w-screen-2xl mx-auto px-6">
        <div className="flex items-center gap-2">
          <span className="text-brand font-bold text-lg mr-6 py-4">⚡ AlgoBot</span>
          {TABS.map(tab => {
            const isActive = pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-4 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-brand text-brand'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </div>
    </header>
  )
}
