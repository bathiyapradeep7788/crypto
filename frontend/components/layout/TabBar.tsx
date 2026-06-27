'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLogStream } from '@/hooks/useLogStream'

const TABS = [
  { href: '/backtest',    label: 'Backtest'    },
  { href: '/paper-trade', label: 'Paper Trade' },
  { href: '/live-trade',  label: 'Live Trade'  },
  { href: '/database',    label: 'Database'    },
  { href: '/logs',        label: 'System Log'  },
]

export default function TabBar() {
  const pathname = usePathname()
  const { logs } = useLogStream()
  const errorCount = logs.filter(l => l.level === 'ERROR').length

  return (
    <header className="bg-surface-card border-b border-surface-border">
      <div className="max-w-screen-2xl mx-auto px-6">
        <div className="flex items-center gap-1">
          <span className="text-brand font-bold text-lg mr-4 py-4">⚡ AlgoBot</span>
          {TABS.map(tab => {
            const isActive = pathname.startsWith(tab.href)
            const isLog    = tab.href === '/logs'
            return (
              <Link key={tab.href} href={tab.href}
                className={`relative px-3 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive ? 'border-brand text-brand' : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}>
                {tab.label}
                {isLog && errorCount > 0 && (
                  <span className="absolute top-3 right-0 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                    {errorCount > 9 ? '9+' : errorCount}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </header>
  )
}
