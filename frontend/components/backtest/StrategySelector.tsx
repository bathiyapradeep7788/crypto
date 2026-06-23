'use client'
import { useEffect, useState } from 'react'
import { STRATEGIES } from '@/lib/constants'
import { CombinedStrategy } from '@/types'
import { listCombined, createCombined, updateCombined, deleteCombined } from '@/lib/api'

interface Props {
  selected: string[]               // strategy ids: "rsi_macd" or "combo_<uuid>"
  onChange: (ids: string[]) => void
}

const labelFor = (id: string) =>
  STRATEGIES.find(s => s.id === id)?.label ?? id

export default function StrategySelector({ selected, onChange }: Props) {
  const [combined, setCombined] = useState<CombinedStrategy[]>([])
  const [showBuilder, setShowBuilder] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Builder / edit state
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [stratA, setStratA] = useState(STRATEGIES[0].id)
  const [stratB, setStratB] = useState(STRATEGIES[1].id)

  const refresh = () => listCombined().then(setCombined).catch(() => {})
  useEffect(() => { refresh() }, [])

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }

  const allBuiltInIds = STRATEGIES.map(s => s.id)
  const allSelected = allBuiltInIds.every(id => selected.includes(id))
  const selectAll = () => {
    if (allSelected) onChange(selected.filter(id => !allBuiltInIds.includes(id)))
    else onChange(Array.from(new Set([...selected, ...allBuiltInIds])))
  }

  const openCreate = () => {
    setEditId(null); setName(''); setStratA(STRATEGIES[0].id); setStratB(STRATEGIES[1].id)
    setErr(null); setShowBuilder(true)
  }
  const openEdit = (c: CombinedStrategy) => {
    setEditId(c.id); setName(c.name); setStratA(c.strategy_a); setStratB(c.strategy_b)
    setErr(null); setShowBuilder(true)
  }

  const save = async () => {
    setErr(null)
    if (!name.trim()) { setErr('Enter a name'); return }
    if (stratA === stratB) { setErr('Pick two different strategies'); return }
    setBusy(true)
    try {
      if (editId) {
        await updateCombined(editId, { name: name.trim(), strategy_a: stratA, strategy_b: stratB })
      } else {
        await createCombined({ name: name.trim(), strategy_a: stratA, strategy_b: stratB })
      }
      setShowBuilder(false)
      await refresh()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (c: CombinedStrategy) => {
    if (!confirm(`Delete combined strategy "${c.name}"?`)) return
    await deleteCombined(c.id)
    onChange(selected.filter(id => id !== `combo_${c.id}`))
    await refresh()
  }

  return (
    <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Strategy Manager</h3>
        <span className="text-xs text-gray-500">{selected.length} selected</span>
      </div>

      {/* Built-in strategies */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-gray-500">Built-in Strategies</label>
          <button
            onClick={selectAll}
            className="text-xs text-brand hover:text-brand-dark font-medium"
          >
            {allSelected ? 'Clear All' : 'Select All'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {STRATEGIES.map(s => (
            <label
              key={s.id}
              className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-xs transition-colors ${
                selected.includes(s.id)
                  ? 'border-brand bg-brand/10 text-white'
                  : 'border-surface-border text-gray-400 hover:border-gray-500'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={() => toggle(s.id)}
                className="accent-brand"
              />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      {/* Combined strategies */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-gray-500">Combined Strategies (AND)</label>
          <button onClick={openCreate} className="text-xs text-brand hover:text-brand-dark font-medium">
            + Combine
          </button>
        </div>

        {combined.length === 0 && !showBuilder && (
          <p className="text-xs text-gray-600 italic">No combined strategies yet — click “+ Combine”.</p>
        )}

        <div className="space-y-2">
          {combined.map(c => {
            const cid = `combo_${c.id}`
            return (
              <div
                key={c.id}
                className={`flex items-center gap-2 px-3 py-2 rounded border text-xs transition-colors ${
                  selected.includes(cid)
                    ? 'border-brand bg-brand/10 text-white'
                    : 'border-surface-border text-gray-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(cid)}
                  onChange={() => toggle(cid)}
                  className="accent-brand"
                />
                <span className="flex-1">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-gray-500 ml-2">
                    {labelFor(c.strategy_a)} + {labelFor(c.strategy_b)}
                  </span>
                </span>
                <button onClick={() => openEdit(c)} className="text-gray-500 hover:text-brand">Edit</button>
                <button onClick={() => remove(c)} className="text-gray-500 hover:text-red-400">Delete</button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Builder / editor */}
      {showBuilder && (
        <div className="border border-dashed border-surface-border rounded p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-300">
            {editId ? 'Edit Combined Strategy' : 'New Combined Strategy'}
            <span className="text-gray-500 font-normal"> — both must agree (AND)</span>
          </p>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Strategy name (e.g. RSI+EMA Confluence)"
            className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={stratA}
              onChange={e => setStratA(e.target.value)}
              className="bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-brand"
            >
              {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <select
              value={stratB}
              onChange={e => setStratB(e.target.value)}
              className="bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-brand"
            >
              {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="flex-1 bg-brand hover:bg-brand-dark text-black rounded py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              {busy ? 'Saving…' : editId ? 'Update' : 'Save'}
            </button>
            <button
              onClick={() => setShowBuilder(false)}
              className="px-4 bg-surface-border text-gray-400 rounded py-1.5 text-xs hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
