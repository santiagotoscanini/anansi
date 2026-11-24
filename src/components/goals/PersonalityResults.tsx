import { useSuspenseQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  useDeletePersonalityResult,
  useRecordPersonalityResult,
  useUpdatePersonalityResult,
} from '~/lib/mutations/personality'
import {
  attachmentStyleValues,
  bigFiveTraits,
  discFactorValues,
  enneagramLabel,
  groupByTest,
  loveLanguageValues,
  mbtiAxes,
  parsePersonalityResult,
  personalityTestLinks,
  personalityTestValues,
  relativeScores,
  type AttachmentDetails,
  type BigFiveDetails,
  type DiscDetails,
  type EnneagramDetails,
  type LoveLanguagesDetails,
  type MbtiDetails,
  type OtherDetails,
  type PersonalityTest,
  type StrengthsDetails,
} from '~/lib/personality'
import { detailsToForm, formToDetails, suggestSummary, type PersonalityForm } from '~/lib/personality-form'
import { personalityResultsQueryOptions, type PersonalityResultRow } from '~/lib/queries/self'
import { SectionHeader } from './SelfParts'

// Personality test results on the Self page. One card per test taken, showing
// the newest result with a picture that suits the test (bars for scores, a
// bipolar scale per MBTI axis, ranked chips for strengths, a plane for
// attachment) and the older results under "History". Tests not taken yet are a
// compact list with a free version to take. Mostly filled by Claude through
// MCP from a report; the form here is for adding or fixing one by hand.

const monoLabel = 'font-mono text-[10px] tracking-[0.12em] text-[var(--ink-3)] uppercase'
const inputClass =
  'w-full rounded-lg border border-[var(--hairline)] bg-[var(--paper)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-hidden placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)]'

/** A calendar day, formatted the same on the server and in the browser. */
function useCalendarDay() {
  const { i18n } = useTranslation()
  return (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
}

export default function PersonalityResults() {
  const { t } = useTranslation()
  const { data: results } = useSuspenseQuery(personalityResultsQueryOptions())
  const [adding, setAdding] = useState<PersonalityTest | null>(null)
  const grouped = groupByTest(results)
  const taken = personalityTestValues.filter((test) => grouped.has(test))
  const notTaken = personalityTestValues.filter((test) => !grouped.has(test) && test !== 'other')

  return (
    <section className="mb-14">
      <SectionHeader
        eyebrow={t('personality.eyebrow')}
        title={t('personality.title')}
        helper={t('personality.helper')}
      />

      {taken.length === 0 && !adding && (
        <p className="mb-4 px-1 text-sm text-[var(--ink-4)] italic" style={{ fontFamily: 'var(--font-text)' }}>
          {t('personality.empty')}
        </p>
      )}

      <div className="space-y-4">
        {taken.map((test) => (
          <TestCard key={test} test={test} results={grouped.get(test)!} />
        ))}
      </div>

      {adding ? (
        <div className="mt-4">
          <ResultForm initialTest={adding} onDone={() => setAdding(null)} />
        </div>
      ) : (
        <button
          onClick={() => setAdding(notTaken[0] ?? 'other')}
          className="mt-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[var(--ink-3)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink-2)]"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('personality.addResult')}
        </button>
      )}

      {notTaken.length > 0 && (
        <div className="mt-6">
          <div className={`mb-2 ${monoLabel}`}>{t('personality.notTakenHeading')}</div>
          <ul className="divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
            {notTaken.map((test) => {
              const link = personalityTestLinks[test]
              return (
                <li key={test} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5">
                  <span className="text-sm text-[var(--ink-2)]">{t(`personality.tests.${test}.name`)}</span>
                  <span className="min-w-0 flex-1 text-xs text-[var(--ink-4)] italic">
                    {t(`personality.tests.${test}.measures`)}
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-xs">
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--clay-deep)] hover:underline"
                      >
                        {t('personality.takeItFree')}
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                    <button onClick={() => setAdding(test)} className="text-[var(--ink-3)] hover:text-[var(--ink)]">
                      {t('personality.addMine')}
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}

function TestCard({ test, results }: { test: PersonalityTest; results: PersonalityResultRow[] }) {
  const { t } = useTranslation()
  const [showHistory, setShowHistory] = useState(false)
  const [latest, ...older] = results
  if (!latest) return null
  return (
    <article className="rounded-2xl border border-[var(--hairline)] bg-[var(--vellum)] p-5">
      <div className="mb-3">
        <div className={monoLabel}>{t(`personality.tests.${test}.name`)}</div>
        <p className="mt-0.5 text-xs text-[var(--ink-3)] italic" style={{ fontFamily: 'var(--font-text)' }}>
          {t(`personality.tests.${test}.measures`)}
        </p>
      </div>
      <ResultView result={latest} prominent />
      {older.length > 0 && (
        <div className="mt-4 border-t border-[var(--hairline)] pt-3">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={`flex items-center gap-1.5 ${monoLabel} hover:text-[var(--ink-2)]`}
            aria-expanded={showHistory}
          >
            {showHistory ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {t('personality.history', { count: older.length })}
          </button>
          {showHistory && (
            <div className="mt-3 space-y-4">
              {older.map((r) => (
                <div key={r.id} className="rounded-xl border border-[var(--hairline)] bg-[var(--paper)] p-4">
                  <ResultView result={r} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function ResultView({ result: r, prominent = false }: { result: PersonalityResultRow; prominent?: boolean }) {
  const { t } = useTranslation()
  const day = useCalendarDay()
  const remove = useDeletePersonalityResult()
  const [editing, setEditing] = useState(false)

  if (editing) return <ResultForm result={r} onDone={() => setEditing(false)} />

  const meta = [r.takenAt ? day(r.takenAt) : null, r.source].filter(Boolean).join(' · ')
  return (
    <div className="group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="leading-tight text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-display)', fontSize: prominent ? 34 : 22 }}
          >
            {r.summary}
          </div>
          {meta && <div className={`mt-1 ${monoLabel}`}>{meta}</div>}
        </div>
        <div className="flex shrink-0 gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          <button
            onClick={() => setEditing(true)}
            className="rounded p-1.5 text-[var(--ink-3)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
            aria-label={t('personality.edit')}
            title={t('personality.edit')}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm(t('personality.confirmDelete'))) {
                remove.mutate(r.id, { onError: () => toast.error(t('common.deleteFailed')) })
              }
            }}
            className="rounded p-1.5 text-[var(--ink-3)] hover:bg-[var(--rust-soft)] hover:text-[var(--rust)]"
            aria-label={t('personality.delete')}
            title={t('personality.delete')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-4">
        <Visual result={r} />
      </div>
      {r.notes && (
        <p
          className="mt-4 border-l-2 border-[var(--clay-soft)] pl-3 text-[15px] leading-relaxed whitespace-pre-wrap text-[var(--ink-2)] italic"
          style={{ fontFamily: 'var(--font-text)' }}
        >
          {r.notes}
        </p>
      )}
    </div>
  )
}

// ── Pictures ────────────────────────────────────────────────────────────────
// One hue (clay) for every bar: each bar is labelled, so colour carries no
// identity and nothing depends on telling hues apart.

function Bar({ label, value, width, display }: { label: ReactNode; value: number; width?: number; display?: string }) {
  const pct = Math.max(0, Math.min(100, width ?? value))
  const shown = display ?? String(Math.round(value))
  return (
    <div className="flex items-center gap-3 text-sm" title={`${typeof label === 'string' ? label : ''} ${shown}`}>
      <span className="w-32 shrink-0 truncate text-[var(--ink-2)] sm:w-40">{label}</span>
      <span className="relative h-2 flex-1 rounded-full bg-[var(--hairline)]">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: 'var(--clay)' }}
        />
      </span>
      <span className="w-9 shrink-0 text-right text-xs text-[var(--ink-3)] tabular-nums">{shown}</span>
    </div>
  )
}

/** One MBTI axis: the two poles at the ends, the lean drawn out from the middle. */
function BipolarBar({ left, right, towardLeft }: { left: string; right: string; towardLeft: number }) {
  const lean = towardLeft - 50
  const leftPct = Math.round(towardLeft)
  const rightPct = 100 - leftPct
  const strong = 'font-medium text-[var(--ink)]'
  const weak = 'text-[var(--ink-3)]'
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className={`w-28 shrink-0 text-right sm:w-36 ${lean >= 0 ? strong : weak}`}>
        {left} <span className="text-xs tabular-nums">{leftPct}%</span>
      </span>
      <span className="relative h-2 flex-1 rounded-full bg-[var(--hairline)]">
        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-[var(--ink-4)]" aria-hidden />
        <span
          className="absolute inset-y-0 rounded-full"
          style={{
            background: 'var(--clay)',
            left: lean >= 0 ? `${50 - lean}%` : '50%',
            width: `${Math.abs(lean)}%`,
          }}
        />
      </span>
      <span className={`w-28 shrink-0 sm:w-36 ${lean < 0 ? strong : weak}`}>
        <span className="text-xs tabular-nums">{rightPct}%</span> {right}
      </span>
    </div>
  )
}

function Chip({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
        strong
          ? 'border-[var(--clay)] bg-[var(--clay-soft)] text-[var(--ink)]'
          : 'border-[var(--hairline)] bg-[var(--paper)] text-[var(--ink-2)]'
      }`}
    >
      {children}
    </span>
  )
}

function Visual({ result: r }: { result: PersonalityResultRow }) {
  const { t } = useTranslation()
  switch (r.test) {
    case 'big_five': {
      const d = r.details as BigFiveDetails
      return (
        <div className="space-y-2">
          {bigFiveTraits.map((trait) => (
            <Bar key={trait} label={t(`personality.bigFive.${trait}`)} value={d[trait]} />
          ))}
          {d.facets && d.facets.length > 0 && <Facets facets={d.facets} />}
        </div>
      )
    }
    case 'mbti': {
      const d = r.details as MbtiDetails
      const axes = mbtiAxes.filter((a) => d.axes?.[a.key] !== undefined)
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {d.type.split('').map((letter, i) => (
              <Chip key={i} strong>
                <span className="font-medium">{letter}</span>
                {t(`personality.mbti.letter${letter}` as 'personality.mbti.letterE')}
              </Chip>
            ))}
            {d.identity && <Chip>{t(`personality.mbti.identity${d.identity}`)}</Chip>}
          </div>
          {axes.length > 0 && (
            <div className="space-y-2">
              {axes.map((a) => (
                <BipolarBar
                  key={a.key}
                  left={t(`personality.mbti.pole.${a.key}L`)}
                  right={t(`personality.mbti.pole.${a.key}R`)}
                  towardLeft={d.axes![a.key]!}
                />
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'enneagram': {
      const d = r.details as EnneagramDetails
      const scores = [...(d.scores ?? [])].sort((a, b) => a.type - b.type)
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <Chip strong>
              <span className="font-medium">{enneagramLabel(d)}</span>
              {t(`personality.enneagram.type${d.type}` as 'personality.enneagram.type1')}
            </Chip>
            {d.tritype && <Chip>{t('personality.enneagram.tritype', { value: d.tritype })}</Chip>}
            {d.instinct && <Chip>{t(`personality.enneagram.instinct.${d.instinct}`)}</Chip>}
          </div>
          {scores.length > 0 && (
            <div className="space-y-1.5">
              {scores.map((s) => (
                <Bar
                  key={s.type}
                  label={`${s.type} · ${t(`personality.enneagram.type${s.type}` as 'personality.enneagram.type1')}`}
                  value={s.score}
                />
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'clifton_strengths':
    case 'via_strengths': {
      const d = r.details as StrengthsDetails
      return (
        <ol className="flex flex-wrap gap-1.5">
          {d.strengths.map((s, i) => (
            <li key={`${s.name}-${i}`}>
              <Chip strong={i < 5}>
                <span className="text-[10px] text-[var(--ink-3)] tabular-nums">{i + 1}</span>
                {s.name}
                {s.domain && <span className="text-[10px] text-[var(--ink-4)]">{s.domain}</span>}
              </Chip>
            </li>
          ))}
        </ol>
      )
    }
    case 'love_languages': {
      const d = r.details as LoveLanguagesDetails
      const widths = relativeScores(d.ranking.map((x) => x.score))
      const hasScores = widths.some((w) => w !== null)
      if (!hasScores) {
        return (
          <ol className="flex flex-wrap gap-1.5">
            {d.ranking.map((x, i) => (
              <li key={x.language}>
                <Chip strong={i === 0}>
                  <span className="text-[10px] text-[var(--ink-3)] tabular-nums">{i + 1}</span>
                  {t(`personality.love.${x.language}`)}
                </Chip>
              </li>
            ))}
          </ol>
        )
      }
      return (
        <div className="space-y-2">
          {d.ranking.map((x, i) => (
            <Bar
              key={x.language}
              label={t(`personality.love.${x.language}`)}
              value={x.score ?? 0}
              width={widths[i] ?? 0}
              display={x.score === undefined ? '-' : String(x.score)}
            />
          ))}
        </div>
      )
    }
    case 'attachment_style': {
      const d = r.details as AttachmentDetails
      return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {d.anxiety !== undefined && d.avoidance !== undefined && (
            <AttachmentPlane anxiety={d.anxiety} avoidance={d.avoidance} />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <Chip strong>{t(`personality.attachment.${d.style}`)}</Chip>
            {d.anxiety !== undefined && <Bar label={t('personality.attachment.anxiety')} value={d.anxiety} />}
            {d.avoidance !== undefined && <Bar label={t('personality.attachment.avoidance')} value={d.avoidance} />}
            {d.scores?.map((s) => (
              <Bar key={s.style} label={t(`personality.attachment.${s.style}`)} value={s.score} />
            ))}
          </div>
        </div>
      )
    }
    case 'disc': {
      const d = r.details as DiscDetails
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Chip strong>{t(`personality.disc.${d.primary}`)}</Chip>
            {d.secondary && <Chip>{t(`personality.disc.${d.secondary}`)}</Chip>}
          </div>
          {discFactorValues
            .filter((k) => d.scores?.[k] !== undefined)
            .map((k) => (
              <Bar key={k} label={t(`personality.disc.${k}`)} value={d.scores![k]!} />
            ))}
        </div>
      )
    }
    case 'other': {
      const d = r.details as OtherDetails
      if (!d.fields?.length) return null
      return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {d.fields.map((f, i) => (
            <div key={i} className="contents">
              <dt className="text-[var(--ink-3)]">{f.label}</dt>
              <dd className="text-[var(--ink)]">{f.value}</dd>
            </div>
          ))}
        </dl>
      )
    }
  }
}

function Facets({ facets }: { facets: NonNullable<BigFiveDetails['facets']> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <div className="pt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 ${monoLabel} hover:text-[var(--ink-2)]`}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {t('personality.bigFive.facets', { count: facets.length })}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {bigFiveTraits.map((trait) => {
            const mine = facets.filter((f) => f.trait === trait)
            if (!mine.length) return null
            return (
              <div key={trait} className="space-y-1.5">
                <div className="text-xs text-[var(--ink-3)]">{t(`personality.bigFive.${trait}`)}</div>
                {mine.map((f) => (
                  <Bar key={f.name} label={f.name} value={f.score} />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Anxiety (up) against avoidance (right), with the four styles in its quadrants. */
function AttachmentPlane({ anxiety, avoidance }: { anxiety: number; avoidance: number }) {
  const { t } = useTranslation()
  const size = 132
  const x = (avoidance / 100) * size
  const y = size - (anxiety / 100) * size
  const label = (text: string, lx: number, ly: number, anchor: 'start' | 'end') => (
    <text x={lx} y={ly} textAnchor={anchor} fontSize="9" fill="var(--ink-4)">
      {text}
    </text>
  )
  return (
    <figure className="shrink-0">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={t('personality.attachment.planeAria', { anxiety, avoidance })}
        className="overflow-visible"
      >
        <rect x="0" y="0" width={size} height={size} rx="10" fill="var(--paper)" stroke="var(--hairline)" />
        <line x1={size / 2} y1="4" x2={size / 2} y2={size - 4} stroke="var(--hairline-2)" strokeDasharray="2 3" />
        <line x1="4" y1={size / 2} x2={size - 4} y2={size / 2} stroke="var(--hairline-2)" strokeDasharray="2 3" />
        {label(t('personality.attachment.anxious'), 6, 14, 'start')}
        {label(t('personality.attachment.fearful_avoidant'), size - 6, 14, 'end')}
        {label(t('personality.attachment.secure'), 6, size - 7, 'start')}
        {label(t('personality.attachment.avoidant'), size - 6, size - 7, 'end')}
        <circle cx={x} cy={y} r="6" fill="var(--clay)" stroke="var(--paper)" strokeWidth="2" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[9px] text-[var(--ink-4)]">
        <span>{t('personality.attachment.axisHint')}</span>
      </figcaption>
    </figure>
  )
}

// ── The form ────────────────────────────────────────────────────────────────

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-xs text-[var(--ink-3)]">{label}</span>
      {children}
    </label>
  )
}

function ResultForm({
  result,
  initialTest,
  onDone,
}: {
  result?: PersonalityResultRow
  initialTest?: PersonalityTest
  onDone: () => void
}) {
  const { t } = useTranslation()
  const record = useRecordPersonalityResult()
  const update = useUpdatePersonalityResult()
  const [test, setTest] = useState<PersonalityTest>(result?.test ?? initialTest ?? 'mbti')
  const [fields, setFields] = useState<PersonalityForm>(() =>
    result ? detailsToForm(result.test, result.details) : {},
  )
  const [takenAt, setTakenAt] = useState(result?.takenAt ?? '')
  const [source, setSource] = useState(result?.source ?? '')
  const [summary, setSummary] = useState(result?.summary ?? '')
  const [notes, setNotes] = useState(result?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const pending = record.isPending || update.isPending

  const set = (key: string) => (e: { target: { value: string } }) => setFields((f) => ({ ...f, [key]: e.target.value }))
  const text = (key: string, placeholder?: string, type = 'text') => (
    <input
      type={type}
      inputMode={type === 'number' ? 'decimal' : undefined}
      value={fields[key] ?? ''}
      onChange={set(key)}
      placeholder={placeholder}
      className={inputClass}
    />
  )
  const score = (key: string) => text(key, '0-100', 'number')
  const select = (key: string, options: readonly (string | number)[], label: (o: string) => string) => (
    <select value={fields[key] ?? ''} onChange={set(key)} className={inputClass}>
      <option value="">-</option>
      {options.map((o) => (
        <option key={o} value={String(o)}>
          {label(String(o))}
        </option>
      ))}
    </select>
  )

  const submit = () => {
    const details = formToDetails(test, fields)
    const headline = summary.trim() ? summary.trim() : (suggestSummary(test, details) ?? '')
    const input = {
      test,
      details,
      takenAt: takenAt || null,
      source: source.trim() || null,
      summary: headline,
      notes: notes.trim() || null,
    }
    const parsed = parsePersonalityResult(input)
    if (!parsed.ok) {
      setError(headline ? parsed.error : t('personality.form.summaryRequired'))
      return
    }
    setError(null)
    const onError = (err: unknown) => setError(err instanceof Error ? err.message : t('common.saveFailed'))
    if (result) {
      update.mutate({ id: result.id, ...parsed.result }, { onSuccess: onDone, onError })
    } else {
      record.mutate(parsed.result, { onSuccess: onDone, onError })
    }
  }

  const testFields = (() => {
    switch (test) {
      case 'mbti':
        return (
          <>
            <Field label={t('personality.form.mbtiType')}>{text('type', 'INFJ')}</Field>
            <Field label={t('personality.form.identity')}>
              {select('identity', ['A', 'T'], (o) => t(`personality.mbti.identity${o as 'A' | 'T'}`))}
            </Field>
            {mbtiAxes.map((a) => (
              <Field
                key={a.key}
                label={t('personality.form.axis', {
                  left: t(`personality.mbti.pole.${a.key}L`),
                  right: t(`personality.mbti.pole.${a.key}R`),
                })}
              >
                {text(
                  a.key,
                  t('personality.form.axisPlaceholder', { left: t(`personality.mbti.pole.${a.key}L`) }),
                  'number',
                )}
              </Field>
            ))}
          </>
        )
      case 'enneagram':
        return (
          <>
            <Field label={t('personality.form.enneagramType')}>
              {select(
                'type',
                [1, 2, 3, 4, 5, 6, 7, 8, 9],
                (o) => `${o} · ${t(`personality.enneagram.type${o}` as 'personality.enneagram.type1')}`,
              )}
            </Field>
            <Field label={t('personality.form.wing')}>{select('wing', [1, 2, 3, 4, 5, 6, 7, 8, 9], (o) => o)}</Field>
            <Field label={t('personality.form.tritype')}>{text('tritype', '459')}</Field>
            <Field label={t('personality.form.instinct')}>
              {select('instinct', ['sp', 'so', 'sx'], (o) => t(`personality.enneagram.instinct.${o as 'sp'}`))}
            </Field>
          </>
        )
      case 'big_five':
        return bigFiveTraits.map((trait) => (
          <Field key={trait} label={t(`personality.bigFive.${trait}`)}>
            {score(trait)}
          </Field>
        ))
      case 'clifton_strengths':
      case 'via_strengths':
        return (
          <Field label={t('personality.form.strengths')} wide>
            <textarea
              value={fields.strengths ?? ''}
              onChange={set('strengths')}
              rows={6}
              placeholder={t('personality.form.strengthsPlaceholder')}
              className={`${inputClass} resize-y`}
            />
          </Field>
        )
      case 'love_languages':
        return loveLanguageValues.map((l) => (
          <Field key={l} label={t(`personality.love.${l}`)}>
            {text(l, t('personality.form.loveScore'), 'number')}
          </Field>
        ))
      case 'attachment_style':
        return (
          <>
            <Field label={t('personality.form.style')} wide>
              {select('style', attachmentStyleValues, (o) => t(`personality.attachment.${o as 'secure'}`))}
            </Field>
            <Field label={t('personality.attachment.anxiety')}>{score('anxiety')}</Field>
            <Field label={t('personality.attachment.avoidance')}>{score('avoidance')}</Field>
          </>
        )
      case 'disc':
        return (
          <>
            <Field label={t('personality.form.primary')}>
              {select('primary', discFactorValues, (o) => t(`personality.disc.${o as 'D'}`))}
            </Field>
            <Field label={t('personality.form.secondary')}>
              {select('secondary', discFactorValues, (o) => t(`personality.disc.${o as 'D'}`))}
            </Field>
            {discFactorValues.map((k) => (
              <Field key={k} label={t(`personality.disc.${k}`)}>
                {score(k)}
              </Field>
            ))}
          </>
        )
      case 'other':
        return (
          <Field label={t('personality.form.otherFields')} wide>
            <textarea
              value={fields.fields ?? ''}
              onChange={set('fields')}
              rows={4}
              placeholder={t('personality.form.otherPlaceholder')}
              className={`${inputClass} resize-y`}
            />
          </Field>
        )
    }
  })()

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--hairline-2)] bg-[var(--vellum)] p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('personality.form.test')}>
          <select
            value={test}
            onChange={(e) => {
              setTest(e.target.value as PersonalityTest)
              setFields({})
            }}
            className={inputClass}
          >
            {personalityTestValues.map((v) => (
              <option key={v} value={v}>
                {t(`personality.tests.${v}.name`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('personality.form.takenAt')}>
          <input type="date" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} className={inputClass} />
        </Field>
        <Field label={t('personality.form.summary')}>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={200}
            placeholder={suggestSummary(test, formToDetails(test, fields)) ?? t('personality.form.summaryPlaceholder')}
            className={inputClass}
          />
        </Field>
        <Field label={t('personality.form.source')}>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            maxLength={200}
            placeholder={t('personality.form.sourcePlaceholder')}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-[var(--hairline)] pt-4 sm:grid-cols-2">{testFields}</div>

      <Field label={t('personality.form.notes')} wide>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={t('personality.form.notesPlaceholder')}
          className={`${inputClass} resize-y`}
          style={{ fontFamily: 'var(--font-text)' }}
        />
      </Field>

      {error && <p className="text-xs text-[var(--rust)]">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
          style={{ background: 'var(--clay)', color: 'var(--paper)' }}
        >
          {t('common.save')}
        </button>
        <button onClick={onDone} className="rounded-lg px-3 py-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--ink)]">
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
