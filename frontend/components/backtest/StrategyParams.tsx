'use client'
import { DEFAULT_PARAMS, STRATEGIES } from '@/lib/constants'

interface Props {
  strategyIds: string[]          // built-in strategy ids whose params to show
  values: Record<string, number>
  onChange: (key: string, val: number) => void
  tpPct:  number
  tp2Pct: number
  slPct:  number
  onTp:  (v: number) => void
  onTp2: (v: number) => void
  onSl:  (v: number) => void
}

const labelFor = (id: string) => STRATEGIES.find(s => s.id === id)?.label ?? id

export default function StrategyParams({
  strategyIds, values, onChange,
  tpPct, tp2Pct, slPct, onTp, onTp2, onSl
}: Props) {
  // Only strategies that actually have tunable params
  const withParams = strategyIds.filter(id => (DEFAULT_PARAMS[id] ?? []).length > 0)

  return (
    <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-300">Parameters & Thresholds</h3>

      {withParams.length === 0 ? (
        <p className="text-xs text-gray-600 italic">
          Selected strategies have no tunable parameters — they use standard settings.
        </p>
      ) : (
        withParams.map(id => (
          <div key={id} className="border border-surface-border rounded p-3">
            <p className="text-xs font-semibold text-brand mb-2">{labelFor(id)}</p>
            <div className="grid grid-cols-2 gap-3">
              {(DEFAULT_PARAMS[id] ?? []).map(f => (
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
          </div>
        ))
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
