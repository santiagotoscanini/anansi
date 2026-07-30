'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGoals } from '~/contexts/GoalsContext'
import type { Value } from '~/lib/api/types'
import { api, type RouterOutputs } from '~/trpc/react'
import toast from 'react-hot-toast'
import { COLOR_PALETTE as DEFAULT_COLORS } from '~/lib/color-palette'

type Behavior = RouterOutputs['goals']['valueBehaviors']['listAll'][number]

// Compact, click-to-expand list of the user's values. Each row collapses to
// {color dot, name, behavior count}; expanding reveals an inline editor for
// the value (name + color) plus its list of confirming behaviors. Behaviors
// are stored in their own table (value_behaviors) — atomic add/delete/reorder.
export default function ValuesManager() {
  const { t } = useTranslation()
  const { values, addValue, updateValue, deleteValue } = useGoals()

  const utils = api.useUtils()
  const behaviorsQuery = api.goals.valueBehaviors.listAll.useQuery()
  const createBehavior = api.goals.valueBehaviors.create.useMutation({
    onSuccess: () => utils.goals.valueBehaviors.listAll.invalidate(),
  })
  const deleteBehavior = api.goals.valueBehaviors.delete.useMutation({
    onSuccess: () => utils.goals.valueBehaviors.listAll.invalidate(),
  })

  const [newValueName, setNewValueName] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState({ name: '', color: '' })
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [draftBehaviorContent, setDraftBehaviorContent] = useState('')

  const behaviorsByValueId = useMemo(() => {
    const m = new Map<string, Behavior[]>()
    for (const b of behaviorsQuery.data ?? []) {
      const arr = m.get(b.valueId) ?? []
      arr.push(b)
      m.set(b.valueId, arr)
    }
    return m
  }, [behaviorsQuery.data])

  const getRandomColor = () => DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]!

  const handleAdd = () => {
    if (!newValueName.trim()) {
      toast.error(t('valuesManager.nameRequired'))
      return
    }
    void addValue({ name: newValueName.trim(), color: getRandomColor() })
    setNewValueName('')
  }

  const beginEdit = (value: Value) => {
    setEditingId(value.id)
    setEditValue({ name: value.name, color: value.color })
    setShowColorPicker(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setShowColorPicker(false)
  }

  const handleUpdate = () => {
    if (!editValue.name.trim()) {
      toast.error(t('valuesManager.nameRequired'))
      return
    }
    if (editingId) {
      void updateValue(editingId, { name: editValue.name.trim(), color: editValue.color })
      cancelEdit()
    }
  }

  const handleDelete = (id: string, name: string) => {
    if (!confirm(t('valuesManager.confirmDelete', { name }))) return
    void deleteValue(id)
  }

  const toggleExpand = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id))
    setDraftBehaviorContent('')
  }

  const handleAddBehavior = async (valueId: string) => {
    const content = draftBehaviorContent.trim()
    if (!content) return
    try {
      await createBehavior.mutateAsync({ valueId, content })
      setDraftBehaviorContent('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('valuesManager.addBehaviorFailed'))
    }
  }

  const handleDeleteBehavior = async (id: string) => {
    try {
      await deleteBehavior.mutateAsync({ id })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('valuesManager.deleteBehaviorFailed'))
    }
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--paper)' }}>
      <header className="px-6 pb-7 pt-10 md:px-12" style={{ borderBottom: '1px solid var(--hairline)' }}>
        <div className="mx-auto max-w-3xl">
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.08em',
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            {t('valuesManager.eyebrow')}
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 44,
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
            }}
          >
            {t('valuesManager.titlePre')}
            <span className="brand-em">{t('valuesManager.titleEm')}</span>
            {t('valuesManager.titlePost')}
          </h1>
          <p
            className="mt-3 max-w-2xl"
            style={{
              fontFamily: 'var(--font-text)',
              fontStyle: 'italic',
              fontSize: 17,
              color: 'var(--ink-2)',
              lineHeight: 1.4,
            }}
          >
            {t('valuesManager.subtitle')}
          </p>
        </div>
      </header>
      <div className="px-6 py-7 md:px-12">
        {/* Add a new value — single row */}
        <div className="mb-6 flex gap-2">
          <input
            type="text"
            value={newValueName}
            onChange={(e) => setNewValueName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder={t('valuesManager.addPlaceholder')}
            className="flex-1 rounded-md border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-2 text-sm outline-none transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)] focus:bg-[var(--vellum)]"
          />
          <button
            onClick={handleAdd}
            className="flex items-center gap-1 rounded-md px-3 py-2 text-sm transition-all"
            style={{ background: 'var(--clay)', color: 'var(--paper)', boxShadow: 'var(--shadow-sm)' }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('common.add')}
          </button>
        </div>

        {/* Values list — compact rows, click to expand */}
        <ul className="divide-y divide-[var(--hairline)]">
          {values.map((value) => {
            const expanded = expandedId === value.id
            const editing = editingId === value.id
            const behaviors = behaviorsByValueId.get(value.id) ?? []

            return (
              <li key={value.id}>
                {/* Row header — collapsed view */}
                <div className="group flex items-center gap-3 py-2">
                  <button
                    onClick={() => toggleExpand(value.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1.5 pr-2 text-left hover:bg-[var(--vellum)]"
                    aria-expanded={expanded}
                  >
                    {expanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" />
                    )}
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: value.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{value.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-[var(--ink-3)]">{behaviors.length}</span>
                  </button>
                  <div className="flex shrink-0 gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <button
                      onClick={() => beginEdit(value)}
                      className="rounded p-1.5 text-[var(--ink-3)] hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
                      aria-label={t('valuesManager.editValue')}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(value.id, value.name)}
                      className="rounded p-1.5 text-[var(--ink-3)] hover:bg-[var(--rust-soft)] hover:text-[var(--rust)]"
                      aria-label={t('valuesManager.deleteValue')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded view — edit value + behaviors list */}
                {expanded && (
                  <div className="mb-2 ml-7 space-y-3 rounded-md border border-[var(--hairline)] bg-[var(--vellum)] p-3">
                    {editing ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowColorPicker((s) => !s)}
                            className="h-7 w-7 shrink-0 rounded-md border border-[var(--hairline)]"
                            style={{ backgroundColor: editValue.color }}
                            aria-label={t('valuesManager.pickColor')}
                          />
                          <input
                            type="text"
                            value={editValue.name}
                            onChange={(e) => setEditValue({ ...editValue, name: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdate()
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            className="flex-1 rounded-md border border-[var(--hairline)] bg-[var(--paper-deep)] px-2 py-1.5 text-sm outline-none focus:border-[var(--hairline-2)]"
                            autoFocus
                          />
                          <button
                            onClick={handleUpdate}
                            className="rounded p-1.5 text-[var(--moss)] hover:bg-[var(--moss-soft)]"
                            aria-label={t('common.save')}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded p-1.5 text-[var(--ink-3)] hover:bg-[var(--vellum)]"
                            aria-label={t('common.cancel')}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        {showColorPicker && (
                          <div className="grid grid-cols-10 gap-1.5 rounded-md border border-[var(--hairline)] bg-[var(--paper-deep)] p-2">
                            {DEFAULT_COLORS.map((color) => (
                              <button
                                key={color}
                                onClick={() => {
                                  setEditValue({ ...editValue, color })
                                  setShowColorPicker(false)
                                }}
                                className="h-5 w-5 rounded transition-transform hover:scale-110"
                                style={{ backgroundColor: color }}
                                aria-label={t('valuesManager.colorAria', { color })}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Behaviors */}
                    <div>
                      {behaviors.length > 0 ? (
                        <ul className="space-y-1">
                          {behaviors.map((b) => (
                            <li
                              key={b.id}
                              className="group/b flex items-start gap-2 rounded-md px-2 py-1 text-sm hover:bg-[var(--vellum)]"
                            >
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--vellum)]" />
                              <span className="min-w-0 flex-1 break-words text-[var(--ink)]">{b.content}</span>
                              <button
                                onClick={() => void handleDeleteBehavior(b.id)}
                                className="shrink-0 rounded p-1 text-[var(--ink-4)] opacity-100 hover:bg-[var(--rust-soft)] hover:text-[var(--rust)] md:opacity-0 md:group-hover/b:opacity-100"
                                aria-label={t('valuesManager.removeBehavior')}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="px-2 py-1 text-xs italic text-[var(--ink-3)]">{t('valuesManager.noBehaviors')}</p>
                      )}

                      {/* Add behavior */}
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          value={expandedId === value.id ? draftBehaviorContent : ''}
                          onChange={(e) => setDraftBehaviorContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleAddBehavior(value.id)
                          }}
                          placeholder={t('valuesManager.behaviorPlaceholder', { name: value.name })}
                          className="flex-1 rounded-md border border-[var(--hairline)] bg-[var(--paper-deep)] px-2 py-1.5 text-sm outline-none placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)]"
                        />
                        <button
                          onClick={() => void handleAddBehavior(value.id)}
                          disabled={!draftBehaviorContent.trim() || createBehavior.isPending}
                          className="flex items-center gap-1 rounded-md border border-[var(--hairline)] px-2 py-1.5 text-xs text-[var(--ink-2)] hover:bg-[var(--vellum)] hover:text-[var(--ink)] disabled:opacity-40"
                        >
                          <Plus className="h-3 w-3" />
                          {t('common.add')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {values.length === 0 && (
          <div className="rounded-md border border-dashed border-[var(--hairline)] px-4 py-12 text-center text-sm text-[var(--ink-3)]">
            {t('valuesManager.noValuesYet')}
          </div>
        )}
      </div>
    </div>
  )
}
