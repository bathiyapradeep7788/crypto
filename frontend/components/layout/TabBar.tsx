'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/backtest',      label: '① Backtest'      },
  { href: '/full-backtest', label: '② Full Run'       },
  { href: '/reports',       label: '③ Analyze'        },
  { href: '/portfolio',     label: '④ Portfolio Bot'  },
  { href: '/paper-trade', label: 'Paper Trade'          },
  { href: '/live-trade',  label: 'Live Actual Trade'   },
  { href: '/database',    label: 'Database'             },
  { href: '/vercel-logs', label: 'Vercel Logs'          },
  { href: '/logs',        label: 'System Logs'          },
]

export default function TabBar() {
  const pathname = usePathname()
  return (
    <header className="bg-surface-card border-b border-surface-border">
      <div className="max-w-screen-2xl mx-auto px-6">
        <div className="flex items-center gap-1">
          <span className="text-brand font-bold text-lg mr-4 py-4">⚡ AlgoBot</span>
          {TABS.map(tab => {
            const isActive = pathname.startsWith(tab.href)
            return (
              <Link key={tab.href} href={tab.href}
                className={`px-3 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive ? 'border-brand text-brand' : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}>
                {tab.label}
              </Link>
            )
          })}
        </div>
      </div>
    </header>
  )
}
