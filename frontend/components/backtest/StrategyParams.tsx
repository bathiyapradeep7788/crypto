'use client'
import { DEFAULT_PARAMS } from '@/lib/constants'

interface Props {
  strategyId: string
  values: Record<string, number>
  onChange: (key: string, val: number) => void
  tpPct:  number
  tp2Pct: number
  slPct:  number
  onTp:  (v: number) => void
  onTp2: (v: number) => void
  onSl:  (v: number) => void
}

export default function StrategyParams({
  strategyId, values, onChange,
  tpPct, tp2Pct, slPct, onTp, onTp2, onSl
}: Props) {
  const fields = DEFAULT_PARAMS[strategyId] ?? []

  return (
    <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-300">Parameters & Thresholds</h3>

      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
              <input
                type="number"
                value={values[f.key] ?? f.default}
                onChange={e => onChange(f.key, parseFloat(e.target.value))}
                step="0.1"
                className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand"
              />
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-surface-border pt-3">
        <p className="text-xs text-gray-500 mb-2 font-semibold">Trade Exit Levels (%)</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'TP1 %',  val: tpPct,  set: onTp  },
            { label: 'TP2 %',  val: tp2Pct, set: onTp2 },
            { label: 'SL %',   val: slPct,  set: onSl  },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <input
                type="number"
                value={val}
                onChange={e => set(parseFloat(e.target.value))}
                step="0.1"
                min="0.1"
                className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
