import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { addDays, ageOn, sundayOf } from '~/lib/life'
import { toPlain } from '~/lib/mentions'
import { lifeWeekQueryOptions } from '~/lib/queries/life'

// One week of a life, opened from the grid: the chapters it falls in, the
// pictures it holds, the journal days and the sync notes. A future week has
// nothing yet, and offers to start a chapter there.

function excerpt(text: string | null | undefined, max = 220) {
  const plain = toPlain(text ?? '')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > max ? `${plain.slice(0, max).trimEnd()}…` : plain
}

export default function WeekPanel({
  sunday,
  birth,
  today,
  onClose,
  onStartChapter,
}: {
  sunday: string
  birth: string
  today: string
  onClose: () => void
  onStartChapter: (start: string) => void
}) {
  const { t, i18n } = useTranslation()
  const { data, isPending } = useQuery(lifeWeekQueryOptions(sunday))
  const future = sunday > sundayOf(today)
  const fmt = (day: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(i18n.language, { ...opts, timeZone: 'UTC' })
  const age = Math.max(0, ageOn(birth, addDays(sunday, 6)))
  const empty = data && data.journal.length === 0 && !data.sync?.items.length && data.pictures.length === 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[var(--scrim)]/40" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-[var(--canvas)] shadow-[var(--shadow-pop)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--hairline)] bg-[var(--canvas)] px-6 pt-6 pb-4">
          <div>
            <div className="text-[11px] tracking-wider text-[var(--ink-3)] uppercase">
              {t('life.grid.age', { count: age })}
            </div>
            <h2 className="mt-1 text-2xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-display)' }}>
              {fmt(sunday, { day: 'numeric', month: 'short' })} ·{' '}
              {fmt(addDays(sunday, 6), { day: 'numeric', month: 'short', year: 'numeric' })}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="mt-1 text-[var(--ink-3)] hover:text-[var(--ink)]">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-7 px-6 py-5">
          {data && data.chapters.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.chapters.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-[var(--ink)]"
                  style={{ background: `color-mix(in oklch, ${c.color} 18%, transparent)` }}
                >
                  {c.emoji ?? <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />}
                  {c.title}
                </span>
              ))}
            </div>
          )}

          {isPending && <div className="h-40 animate-pulse rounded-xl bg-[var(--vellum)]" />}

          {future ? (
            <div className="rounded-xl border border-dashed border-[var(--hairline-2)] px-5 py-6 text-center">
              <p className="text-sm text-[var(--ink-2)] italic" style={{ fontFamily: 'var(--font-text)' }}>
                {t('life.week.future')}
              </p>
              <button
                type="button"
                onClick={() => onStartChapter(sunday)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-[var(--paper)]"
              >
                <Plus className="h-3.5 w-3.5" /> {t('life.week.startHere')}
              </button>
            </div>
          ) : (
            empty && (
              <p className="text-sm text-[var(--ink-3)] italic" style={{ fontFamily: 'var(--font-text)' }}>
                {t('life.week.nothing')}
              </p>
            )
          )}

          {data && data.pictures.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {data.pictures.slice(0, 12).map((p) => (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="aspect-square overflow-hidden rounded-lg bg-[var(--vellum)]"
                >
                  <img src={p.url} alt={p.fileName} loading="lazy" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          )}

          {data && data.journal.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-medium tracking-[0.12em] text-[var(--ink-3)] uppercase">
                {t('life.week.journal')}
              </h3>
              <ul className="divide-y divide-[var(--hairline)]">
                {data.journal.map((d) => (
                  <li key={d.day}>
                    <Link
                      to="/app/journal"
                      search={{ day: d.day }}
                      className="-mx-2 block rounded-lg px-2 py-2.5 hover:bg-[var(--vellum)]/60"
                    >
                      <div className="text-xs font-medium text-[var(--ink-2)] capitalize">
                        {fmt(d.day, { weekday: 'long' })} {fmt(d.day, { day: 'numeric' })}
                      </div>
                      {d.highlights.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-sm text-[var(--ink)]">
                          {d.highlights.slice(0, 4).map((h, i) => (
                            <li key={i}>· {excerpt(h, 120)}</li>
                          ))}
                        </ul>
                      )}
                      {d.content.trim() && (
                        <p
                          className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]"
                          style={{ fontFamily: 'var(--font-text)' }}
                        >
                          {excerpt(d.content)}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data?.sync && data.sync.items.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-medium tracking-[0.12em] text-[var(--ink-3)] uppercase">
                  {t('life.week.sync')}
                </h3>
                <Link
                  to="/app/sync"
                  search={{ week: sunday }}
                  className="inline-flex items-center gap-1 text-xs text-[var(--ink-3)] hover:text-[var(--ink)]"
                >
                  {t('life.week.openSync')} <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              <ul className="divide-y divide-[var(--hairline)]">
                {data.sync.items.map((item, i) => (
                  <li key={i} className="py-2.5">
                    <div className="text-sm font-medium text-[var(--ink)]">{item.title}</div>
                    {item.text?.trim() && (
                      <p
                        className="mt-0.5 text-sm leading-relaxed text-[var(--ink-2)]"
                        style={{ fontFamily: 'var(--font-text)' }}
                      >
                        {excerpt(item.text, 180)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}
