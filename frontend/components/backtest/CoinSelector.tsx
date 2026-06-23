'use client'
import { COINS } from '@/lib/constants'

interface Props {
  selected: string[]
  onChange: (coins: string[]) => void
}

export default function CoinSelector({ selected, onChange }: Props) {
  const toggle = (coin: string) => {
    onChange(
      selected.includes(coin)
        ? selected.filter(c => c !== coin)
        : [...selected, coin]
    )
  }

  const selectAll   = () => onChange([...COINS])
  const deselectAll = () => onChange([])

  return (
    <div className="bg-surface-card border border-surface-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">Coin Selector</h3>
        <div className="flex gap-2 text-xs">
          <button onClick={selectAll}   className="text-brand hover:underline">All</button>
          <button onClick={deselectAll} className="text-gray-500 hover:underline">None</button>
        </div>
      </div>
      <div className="h-56 overflow-y-auto space-y-1 pr-1">
        {COINS.map(coin => (
          <label
            key={coin}
            className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors text-sm ${
              selected.includes(coin)
                ? 'bg-brand/10 text-brand'
                : 'hover:bg-surface-hover text-gray-300'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(coin)}
              onChange={() => toggle(coin)}
              className="accent-brand"
            />
            <span className="font-mono text-xs">{coin}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-2">{selected.length} selected</p>
    </div>
  )
}
