'use client'
import { STRATEGIES } from '@/lib/constants'

interface Props {
  primary:   string
  secondary: string
  onPrimary:   (v: string) => void
  onSecondary: (v: string) => void
}

export default function StrategySelector({ primary, secondary, onPrimary, onSecondary }: Props) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-300">Strategy Manager</h3>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Primary Strategy</label>
        <select
          value={primary}
          onChange={e => onPrimary(e.target.value)}
          className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand"
        >
          {STRATEGIES.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">
          Connect Strategy <span className="text-gray-600">(confluence — optional)</span>
        </label>
        <select
          value={secondary}
          onChange={e => onSecondary(e.target.value)}
          className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand"
        >
          <option value="">— None (single strategy) —</option>
          {STRATEGIES.filter(s => s.id !== primary).map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        {secondary && (
          <p className="text-xs text-brand mt-1">
            ✓ Confluence mode: signal fires only when BOTH strategies agree
          </p>
        )}
      </div>

      <button className="w-full text-left text-xs text-gray-500 border border-dashed border-surface-border rounded px-3 py-2 hover:border-gray-500 transition-colors">
        + Add New Strategy <span className="text-gray-600">(placeholder)</span>
      </button>
    </div>
  )
}
