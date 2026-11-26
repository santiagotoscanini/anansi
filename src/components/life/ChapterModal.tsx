import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { ageOn, CHAPTER_COLORS, chapterLength, lastDay, looseDay, nextChapterColor } from '~/lib/life'
import { useCreateLifeChapter, useDeleteLifeChapter, useUpdateLifeChapter } from '~/lib/mutations/life'
import { useGoalsData } from '~/lib/queries/goals'
import type { LifeChapter, LifeData } from '~/lib/queries/life'
import EmojiPickerLazy from '../goals/EmojiPickerLazy'

// One chapter: its name, colour, when (month precision, or open at either
// end: since birth, until the end), the goals it is for and the views it is in.

const fieldLabel = 'mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--ink-3)]'
const inputClass =
  'w-full rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-2 text-sm text-[var(--ink)] outline-hidden transition-all placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)]'

export type ChapterDraft =
  { kind: 'edit'; chapter: LifeChapter } | { kind: 'new'; title?: string; start?: string; end?: string }

type End = { open: true } | { open: false; year: string; month: number }

function toEnd(day: string | null | undefined): End {
  if (!day) return { open: true }
  return { open: false, year: day.slice(0, 4), month: Number(day.slice(5, 7)) }
}

// undefined: not a date yet (a half-typed year).
function fromEnd(e: End, side: 'start' | 'end'): string | null | undefined {
  if (e.open) return null
  if (!/^\d{4}$/.test(e.year)) return undefined
  return looseDay(`${e.year}-${String(e.month).padStart(2, '0')}`, side) ?? undefined
}

export default function ChapterModal({
  life,
  draft,
  defaultViewId,
  today,
  onClose,
}: {
  life: LifeData
  draft: ChapterDraft
  /** The view the user is in: a new chapter joins it. */
  defaultViewId: string | null
  today: string
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { goals } = useGoalsData()
  const chapter = draft.kind === 'edit' ? draft.chapter : null
  const birth = life.birthDate!
  const years = life.lifeExpectancyYears

  const [title, setTitle] = useState(chapter?.title ?? (draft.kind === 'new' ? (draft.title ?? '') : ''))
  const [emoji, setEmoji] = useState<string | null>(chapter?.emoji ?? null)
  const [picking, setPicking] = useState(false)
  const [color, setColor] = useState(chapter?.color ?? nextChapterColor(life.chapters.map((c) => c.color)))
  const [start, setStart] = useState<End>(toEnd(chapter ? chapter.startDay : draft.kind === 'new' ? draft.start : null))
  const [end, setEnd] = useState<End>(toEnd(chapter ? chapter.endDay : draft.kind === 'new' ? draft.end : null))
  const [goalIds, setGoalIds] = useState<string[]>(chapter?.goalIds ?? [])
  const [viewIds, setViewIds] = useState<string[]>(
    chapter
      ? life.views.filter((v) => v.chapterIds.includes(chapter.id)).map((v) => v.id)
      : defaultViewId
        ? [defaultViewId]
        : [],
  )
  const [notes, setNotes] = useState(chapter?.notes ?? '')
  const [goalQuery, setGoalQuery] = useState('')

  const create = useCreateLifeChapter()
  const update = useUpdateLifeChapter()
  const remove = useDeleteLifeChapter()
  const saving = create.isPending || update.isPending || remove.isPending

  const startDay = fromEnd(start, 'start')
  const endDay = fromEnd(end, 'end')
  const range =
    startDay !== undefined && endDay !== undefined
      ? { start: startDay ?? birth, end: endDay ?? lastDay(birth, years) }
      : null
  const backwards = range ? range.end < range.start : false
  const length = range && !backwards ? chapterLength(range) : null

  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(2000, i, 1)).toLocaleDateString(i18n.language, { month: 'short', timeZone: 'UTC' }),
  )

  const save = async () => {
    if (!title.trim()) {
      toast.error(t('life.chapter.needsTitle'))
      return
    }
    if (startDay === undefined || endDay === undefined || backwards) {
      toast.error(t('life.chapter.badDates'))
      return
    }
    const fields = {
      title: title.trim(),
      emoji,
      color,
      notes: notes.trim() ? notes : null,
      startDay,
      endDay,
      goalIds,
      viewIds,
    }
    try {
      if (chapter) await update.mutateAsync({ id: chapter.id, ...fields })
      else await create.mutateAsync(fields)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message.replace(/^[A-Z_]+: /, '') : t('life.chapter.saveFailed'))
    }
  }

  const destroy = async () => {
    if (!chapter || !confirm(t('life.chapter.confirmDelete', { title: chapter.title }))) return
    try {
      await remove.mutateAsync(chapter.id)
      onClose()
    } catch {
      toast.error(t('life.chapter.saveFailed'))
    }
  }

  const activeGoals = goals.filter((g) => !goalQuery || g.title.toLowerCase().includes(goalQuery.toLowerCase()))

  const endField = (side: 'start' | 'end', value: End, set: (e: End) => void) => {
    const openLabel = side === 'start' ? t('life.chapter.sinceBirth') : t('life.chapter.untilEnd')
    const fallback = side === 'start' ? birth : today
    return (
      <div>
        <label className={fieldLabel}>{side === 'start' ? t('life.chapter.from') : t('life.chapter.to')}</label>
        <div className="mb-2 inline-flex rounded-lg border border-[var(--hairline)] p-0.5 text-xs">
          <button
            type="button"
            onClick={() => set({ open: true })}
            className={`rounded-md px-2.5 py-1 ${value.open ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--ink-2)]'}`}
          >
            {openLabel}
          </button>
          <button
            type="button"
            onClick={() => value.open && set(toEnd(fallback))}
            className={`rounded-md px-2.5 py-1 ${!value.open ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--ink-2)]'}`}
          >
            {t('life.chapter.aDate')}
          </button>
        </div>
        {!value.open && (
          <div className="flex gap-2">
            <select
              value={value.month}
              onChange={(e) => set({ ...value, month: Number(e.target.value) })}
              className={`${inputClass} w-[5.5rem]`}
              aria-label={t('life.chapter.month')}
            >
              {months.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <input
              inputMode="numeric"
              value={value.year}
              onChange={(e) => set({ ...value, year: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              className={`${inputClass} w-[5.5rem] tabular-nums`}
              aria-label={t('life.chapter.year')}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)]/70 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--canvas)] shadow-[var(--shadow-pop)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 rounded-t-2xl" style={{ background: color }} />
        <div className="flex items-start gap-3 px-6 pt-5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setPicking((p) => !p)}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-xl"
              style={{ background: `color-mix(in oklch, ${color} 18%, var(--canvas))` }}
              aria-label={t('life.chapter.emoji')}
            >
              {emoji ?? <span className="h-3 w-3 rounded-full" style={{ background: color }} />}
            </button>
            {picking && (
              <div className="absolute top-12 left-0 z-20">
                <EmojiPickerLazy
                  searchPlaceHolder={t('life.chapter.emojiSearch')}
                  onEmojiClick={(d) => {
                    setEmoji(d.emoji)
                    setPicking(false)
                  }}
                />
                {emoji && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmoji(null)
                      setPicking(false)
                    }}
                    className="mt-1 w-full rounded-lg bg-[var(--canvas)] py-1.5 text-xs text-[var(--ink-3)] shadow"
                  >
                    {t('life.chapter.noEmoji')}
                  </button>
                )}
              </div>
            )}
          </div>
          <input
            autoFocus={!chapter}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            placeholder={t('life.chapter.titlePlaceholder')}
            className="min-w-0 flex-1 bg-transparent pt-1.5 text-2xl text-[var(--ink)] outline-hidden placeholder:text-[var(--ink-4)]"
            style={{ fontFamily: 'var(--font-display)' }}
          />
          <button type="button" onClick={onClose} className="mt-1.5 text-[var(--ink-3)] hover:text-[var(--ink)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-6 pt-5 pb-6">
          <div className="flex flex-wrap gap-2">
            {CHAPTER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="h-6 w-6 rounded-full transition-transform hover:scale-110"
                style={{
                  background: c,
                  boxShadow: c === color ? `0 0 0 2px var(--canvas), 0 0 0 4px ${c}` : undefined,
                }}
                aria-label={c}
              />
            ))}
          </div>

          <div>
            <div className="grid grid-cols-2 gap-4">
              {endField('start', start, setStart)}
              {endField('end', end, setEnd)}
            </div>
            <p className="mt-3 text-xs text-[var(--ink-3)]">
              {backwards || !range
                ? t('life.chapter.badDates')
                : [
                    t('life.chapter.ages', {
                      from: Math.max(0, ageOn(birth, range.start)),
                      to: Math.max(0, ageOn(birth, range.end)),
                    }),
                    length && length.years > 0
                      ? t('life.chapter.years', { count: length.years })
                      : length
                        ? t('life.chapter.months', { count: Math.max(1, length.months) })
                        : '',
                    length ? t('life.chapter.weeks', { count: length.weeks }) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
          </div>

          <div>
            <label className={fieldLabel}>{t('life.chapter.goals')}</label>
            {goals.length > 10 && (
              <input
                value={goalQuery}
                onChange={(e) => setGoalQuery(e.target.value)}
                placeholder={t('life.chapter.findGoal')}
                className={`${inputClass} mb-2`}
              />
            )}
            {goals.length === 0 ? (
              <p className="text-xs text-[var(--ink-4)] italic">{t('life.chapter.noGoals')}</p>
            ) : (
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {activeGoals.map((g) => {
                  const on = goalIds.includes(g.id)
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGoalIds((ids) => (on ? ids.filter((i) => i !== g.id) : [...ids, g.id]))}
                      className="rounded-full border px-2.5 py-1 text-xs transition-colors"
                      style={{
                        borderColor: on ? color : 'var(--hairline-2)',
                        background: on ? `color-mix(in oklch, ${color} 16%, transparent)` : 'transparent',
                        color: on ? 'var(--ink)' : 'var(--ink-2)',
                      }}
                    >
                      {g.emoji && !g.emoji.startsWith('/') ? `${g.emoji} ` : ''}
                      {g.title}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {life.views.length > 0 && (
            <div>
              <label className={fieldLabel}>{t('life.chapter.views')}</label>
              <div className="flex flex-wrap gap-1.5">
                {life.views.map((v) => {
                  const on = viewIds.includes(v.id)
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setViewIds((ids) => (on ? ids.filter((i) => i !== v.id) : [...ids, v.id]))}
                      className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]' : 'border-[var(--hairline-2)] text-[var(--ink-2)]'}`}
                    >
                      {v.emoji ? `${v.emoji} ` : ''}
                      {v.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label className={fieldLabel}>{t('life.chapter.notes')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t('life.chapter.notesPlaceholder')}
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--hairline)] px-6 py-4">
          {chapter ? (
            <button
              type="button"
              onClick={() => void destroy()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--rust)]"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t('common.delete')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-[var(--ink-2)]">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] disabled:opacity-50"
            >
              {saving ? t('common.saving') : chapter ? t('common.save') : t('life.chapter.add')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
