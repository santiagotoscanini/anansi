import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, Link2, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { toEditable } from '~/lib/mentions'
import {
  useAddOpenQuestionNote,
  useCreateOpenQuestion,
  useDeleteOpenQuestion,
  useDeleteOpenQuestionNote,
  useReopenOpenQuestion,
  useSettleOpenQuestion,
  useUpdateOpenQuestion,
  useUpdateOpenQuestionNote,
} from '~/lib/mutations/open-questions'
import { goalsDataQueryOptions } from '~/lib/queries/goals'
import { peopleQueryOptions } from '~/lib/queries/people'
import { openQuestionsQueryOptions, type OpenQuestionRow } from '~/lib/queries/self'
import Avatar from './Avatar'
import MentionField from './MentionField'
import MentionText, { useMentionPeople } from './MentionText'
import { EditableProse, SectionHeader } from './SelfParts'

// The questions the user is living with, as a journal of questions: each one a
// card that opens onto why it matters now, the thinking over time (dated notes,
// newest first), the goals and people it touches, and, once it settles, the
// answer. Open questions first; settled ones fold away underneath.

type Goal = { id: string; title: string; emoji?: string | null }
type Person = { id: string; name: string; emoji: string | null }

const monoLabel = 'font-mono text-[10px] tracking-[0.12em] text-[var(--ink-3)] uppercase'

function useDayFormat() {
  const { i18n } = useTranslation()
  return (d: Date | string) =>
    new Date(d).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function OpenQuestions() {
  const { t } = useTranslation()
  const { data: questions } = useSuspenseQuery(openQuestionsQueryOptions())
  const { data: goalsData } = useSuspenseQuery(goalsDataQueryOptions())
  const { data: people } = useSuspenseQuery(peopleQueryOptions(false))
  const create = useCreateOpenQuestion()
  const [draft, setDraft] = useState('')
  const [showSettled, setShowSettled] = useState(false)

  const open = questions.filter((q) => q.status === 'open')
  const settled = questions.filter((q) => q.status === 'settled')

  const add = () => {
    const question = draft.trim()
    if (!question) return
    create.mutate(
      { question },
      {
        onSuccess: () => setDraft(''),
        onError: () => toast.error(t('common.saveFailed')),
      },
    )
  }

  return (
    <section className="mb-14">
      <SectionHeader
        eyebrow={t('openQuestions.eyebrow')}
        title={t('openQuestions.title')}
        helper={t('openQuestions.helper')}
      />

      <div className="mb-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={t('openQuestions.addPlaceholder')}
          maxLength={500}
          className="flex-1 rounded-xl border border-dashed border-[var(--hairline-2)] bg-transparent px-4 py-2.5 text-base text-[var(--ink)] outline-hidden transition-colors placeholder:text-[var(--ink-4)] placeholder:italic focus:border-solid focus:bg-[var(--vellum)]"
          style={{ fontFamily: 'var(--font-text)' }}
        />
        <button
          onClick={add}
          disabled={!draft.trim() || create.isPending}
          className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm transition-opacity disabled:opacity-40"
          style={{ background: 'var(--clay)', color: 'var(--paper)', boxShadow: 'var(--shadow-sm)' }}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('common.add')}
        </button>
      </div>

      {open.length === 0 && settled.length === 0 && (
        <p className="px-1 text-sm text-[var(--ink-4)] italic" style={{ fontFamily: 'var(--font-text)' }}>
          {t('openQuestions.empty')}
        </p>
      )}

      <div className="space-y-3">
        {open.map((q) => (
          <QuestionCard key={q.id} question={q} goals={goalsData.goals} people={people} />
        ))}
      </div>

      {settled.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowSettled((v) => !v)}
            className={`flex items-center gap-1.5 ${monoLabel} hover:text-[var(--ink-2)]`}
            aria-expanded={showSettled}
          >
            {showSettled ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {t('openQuestions.settledHeading', { count: settled.length })}
          </button>
          {showSettled && (
            <div className="mt-3 space-y-3">
              {settled.map((q) => (
                <QuestionCard key={q.id} question={q} goals={goalsData.goals} people={people} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function QuestionCard({
  question: q,
  goals,
  people,
}: {
  question: OpenQuestionRow
  goals: readonly Goal[]
  people: readonly Person[]
}) {
  const { t } = useTranslation()
  const day = useDayFormat()
  const [expanded, setExpanded] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState(false)
  const [questionDraft, setQuestionDraft] = useState(q.question)
  const [settling, setSettling] = useState(false)
  const [answerDraft, setAnswerDraft] = useState('')
  const [linking, setLinking] = useState(false)

  const update = useUpdateOpenQuestion()
  const settle = useSettleOpenQuestion()
  const reopen = useReopenOpenQuestion()
  const remove = useDeleteOpenQuestion()
  const isSettled = q.status === 'settled'

  const onError = () => toast.error(t('common.saveFailed'))
  const summaryPeople = useMentionPeople()
  const linkedGoals = goals.filter((g) => q.goalIds.includes(g.id))
  const linkedPeople = people.filter((p) => q.personIds.includes(p.id))
  const lastNote = q.notes[0]

  const commitQuestion = () => {
    setEditingQuestion(false)
    const next = questionDraft.trim()
    if (next && next !== q.question) update.mutate({ id: q.id, question: next }, { onError })
  }

  const toggleGoal = (id: string) => {
    const goalIds = q.goalIds.includes(id) ? q.goalIds.filter((g) => g !== id) : [...q.goalIds, id]
    update.mutate({ id: q.id, goalIds }, { onError })
  }
  const togglePerson = (id: string) => {
    const personIds = q.personIds.includes(id) ? q.personIds.filter((p) => p !== id) : [...q.personIds, id]
    update.mutate({ id: q.id, personIds }, { onError })
  }

  const submitAnswer = () => {
    const answer = answerDraft.trim()
    if (!answer) return
    settle.mutate(
      { id: q.id, answer },
      {
        onSuccess: () => {
          setSettling(false)
          setAnswerDraft('')
        },
        onError,
      },
    )
  }

  const onDelete = () => {
    if (!confirm(t('openQuestions.confirmDelete'))) return
    remove.mutate(q.id, { onError: () => toast.error(t('common.deleteFailed')) })
  }

  return (
    <article
      className="rounded-2xl border bg-[var(--vellum)] transition-colors"
      style={{
        borderColor: expanded ? 'var(--hairline-2)' : 'var(--hairline)',
        opacity: isSettled && !expanded ? 0.85 : 1,
      }}
    >
      <header className="flex items-start gap-3 px-5 pt-4 pb-4">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 shrink-0 text-[var(--ink-3)] hover:text-[var(--ink)]"
          aria-expanded={expanded}
          aria-label={expanded ? t('openQuestions.collapse') : t('openQuestions.expand')}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          {editingQuestion ? (
            <input
              autoFocus
              value={questionDraft}
              maxLength={500}
              onChange={(e) => setQuestionDraft(e.target.value)}
              onBlur={commitQuestion}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitQuestion()
                if (e.key === 'Escape') {
                  setQuestionDraft(q.question)
                  setEditingQuestion(false)
                }
              }}
              className="w-full rounded-lg border border-[var(--hairline-2)] bg-[var(--paper)] px-2 py-1 text-[22px] text-[var(--ink)] outline-hidden"
              style={{ fontFamily: 'var(--font-display)' }}
            />
          ) : (
            <h4
              onClick={() => setExpanded((v) => !v)}
              className="cursor-pointer text-[22px] leading-snug text-[var(--ink)]"
              style={{
                fontFamily: 'var(--font-display)',
                textDecoration: isSettled ? 'none' : undefined,
              }}
            >
              {q.question}
            </h4>
          )}
          <div className={`mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 ${monoLabel}`}>
            {isSettled && q.settledAt ? (
              <span className="text-[var(--moss)]" suppressHydrationWarning>
                {t('openQuestions.settledOn', { date: day(q.settledAt) })}
              </span>
            ) : (
              <span suppressHydrationWarning>{t('openQuestions.openSince', { date: day(q.createdAt) })}</span>
            )}
            <span aria-hidden>·</span>
            <span>{t('openQuestions.noteCount', { count: q.notes.length })}</span>
            {lastNote && !isSettled && (
              <>
                <span aria-hidden>·</span>
                <span suppressHydrationWarning>
                  {t('openQuestions.lastThought', { date: day(lastNote.createdAt) })}
                </span>
              </>
            )}
          </div>
          {!expanded && (linkedGoals.length > 0 || linkedPeople.length > 0) && (
            <LinkChips goals={linkedGoals} people={linkedPeople} />
          )}
          {!expanded && !isSettled && q.summary && (
            <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-[var(--ink-2)]">
              <MentionText text={q.summary} link={false} />
            </p>
          )}
          {!expanded && isSettled && q.answer && (
            <p
              className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-[var(--ink-2)] italic"
              style={{ fontFamily: 'var(--font-text)' }}
            >
              {q.answer}
            </p>
          )}
        </div>
        {expanded && !editingQuestion && (
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => {
                setQuestionDraft(q.question)
                setEditingQuestion(true)
              }}
              className="rounded p-1.5 text-[var(--ink-3)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
              aria-label={t('openQuestions.editQuestion')}
              title={t('openQuestions.editQuestion')}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="rounded p-1.5 text-[var(--ink-3)] hover:bg-[var(--rust-soft)] hover:text-[var(--rust)]"
              aria-label={t('openQuestions.delete')}
              title={t('openQuestions.delete')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </header>

      {expanded && (
        <div className="space-y-6 border-t border-[var(--hairline)] px-5 pt-5 pb-5 md:pl-12">
          {isSettled && (
            <div>
              <div className={`mb-1 ${monoLabel} text-[var(--moss)]`}>{t('openQuestions.answerLabel')}</div>
              <div className="border-l-2 pl-1" style={{ borderColor: 'var(--moss)' }}>
                <EditableProse
                  value={q.answer ?? ''}
                  onSave={(v) => v && update.mutate({ id: q.id, answer: v }, { onError })}
                  placeholder={t('openQuestions.answerPlaceholder')}
                  rows={4}
                  variant="story"
                />
              </div>
            </div>
          )}

          <div>
            <div className={`mb-1 flex items-baseline justify-between gap-3 ${monoLabel}`}>
              <span>{t('openQuestions.summaryLabel')}</span>
              {q.summaryUpdatedAt && (
                <span className="tracking-normal normal-case">
                  {q.notesSinceSummary > 0
                    ? t('openQuestions.notesSinceSummary', { count: q.notesSinceSummary })
                    : t('openQuestions.summaryCurrent')}
                </span>
              )}
            </div>
            <EditableProse
              value={toEditable(q.summary ?? '', summaryPeople)}
              onSave={(v) => update.mutate({ id: q.id, summary: v }, { onError })}
              placeholder={t('openQuestions.summaryPlaceholder')}
              rows={5}
              variant="story"
            />
          </div>

          <div>
            <div className={`mb-1 ${monoLabel}`}>{t('openQuestions.contextLabel')}</div>
            <EditableProse
              value={q.context ?? ''}
              onSave={(v) => update.mutate({ id: q.id, context: v }, { onError })}
              placeholder={t('openQuestions.contextPlaceholder')}
              rows={3}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className={monoLabel}>{t('openQuestions.linksLabel')}</span>
              <button
                onClick={() => setLinking((v) => !v)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--ink-3)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
              >
                {linking ? <Check className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
                {linking ? t('openQuestions.doneLinking') : t('openQuestions.link')}
              </button>
            </div>
            {linking ? (
              <LinkPicker
                goals={goals}
                people={people}
                goalIds={q.goalIds}
                personIds={q.personIds}
                onToggleGoal={toggleGoal}
                onTogglePerson={togglePerson}
              />
            ) : linkedGoals.length || linkedPeople.length ? (
              <LinkChips goals={linkedGoals} people={linkedPeople} />
            ) : (
              <p className="text-xs text-[var(--ink-4)] italic">{t('openQuestions.noLinks')}</p>
            )}
          </div>

          <Notes question={q} />

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-4">
            {isSettled ? (
              <button
                onClick={() => reopen.mutate(q.id, { onError })}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] px-3 py-1.5 text-xs text-[var(--ink-2)] hover:border-[var(--hairline-2)] hover:text-[var(--ink)]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('openQuestions.reopen')}
              </button>
            ) : settling ? (
              <div className="w-full space-y-2">
                <div className={`${monoLabel} text-[var(--moss)]`}>{t('openQuestions.answerLabel')}</div>
                <textarea
                  autoFocus
                  value={answerDraft}
                  onChange={(e) => setAnswerDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitAnswer()
                    if (e.key === 'Escape') setSettling(false)
                  }}
                  rows={4}
                  maxLength={10_000}
                  placeholder={t('openQuestions.answerPlaceholder')}
                  className="w-full resize-none rounded-xl border border-[var(--hairline-2)] bg-[var(--paper)] px-4 py-3 text-base text-[var(--ink)] outline-hidden placeholder:text-[var(--ink-4)]"
                  style={{ fontFamily: 'var(--font-text)' }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={submitAnswer}
                    disabled={!answerDraft.trim() || settle.isPending}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
                    style={{ background: 'var(--moss)', color: 'var(--paper)' }}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {t('openQuestions.settleConfirm')}
                  </button>
                  <button
                    onClick={() => setSettling(false)}
                    className="rounded-lg px-3 py-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--ink)]"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setAnswerDraft(q.answer ?? '')
                  setSettling(true)
                }}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--moss-soft)]"
                style={{ borderColor: 'var(--moss)', color: 'var(--moss)' }}
              >
                <Check className="h-3.5 w-3.5" />
                {t('openQuestions.settle')}
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

function LinkChips({ goals, people }: { goals: readonly Goal[]; people: readonly Person[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {goals.map((g) => (
        <span
          key={g.id}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--paper)] px-2 py-0.5 text-xs text-[var(--ink-2)]"
        >
          {g.emoji && <span aria-hidden>{g.emoji}</span>}
          {g.title}
        </span>
      ))}
      {people.map((p) => (
        <span
          key={p.id}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--paper)] py-0.5 pr-2 pl-0.5 text-xs text-[var(--ink-2)]"
        >
          <Avatar name={p.name} emoji={p.emoji} size="xs" shape="circle" />
          {p.name}
        </span>
      ))}
    </div>
  )
}

function LinkPicker({
  goals,
  people,
  goalIds,
  personIds,
  onToggleGoal,
  onTogglePerson,
}: {
  goals: readonly Goal[]
  people: readonly Person[]
  goalIds: readonly string[]
  personIds: readonly string[]
  onToggleGoal: (id: string) => void
  onTogglePerson: (id: string) => void
}) {
  const { t } = useTranslation()
  const chip = (selected: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all ${
      selected
        ? 'border-[var(--clay)] bg-[var(--clay-soft)] text-[var(--ink)]'
        : 'border-[var(--hairline)] bg-[var(--paper)] text-[var(--ink-3)] hover:text-[var(--ink)]'
    }`
  const sortedPeople = [...people].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="space-y-3 rounded-xl border border-[var(--hairline)] bg-[var(--paper)] p-3">
      <div>
        <div className="mb-1.5 text-xs text-[var(--ink-3)]">{t('openQuestions.goalsLabel')}</div>
        {goals.length === 0 ? (
          <p className="text-xs text-[var(--ink-4)] italic">{t('openQuestions.noGoals')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {goals.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onToggleGoal(g.id)}
                className={chip(goalIds.includes(g.id))}
              >
                {g.emoji && <span aria-hidden>{g.emoji}</span>}
                {g.title}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="mb-1.5 text-xs text-[var(--ink-3)]">{t('openQuestions.peopleLabel')}</div>
        {sortedPeople.length === 0 ? (
          <p className="text-xs text-[var(--ink-4)] italic">{t('openQuestions.noPeople')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {sortedPeople.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onTogglePerson(p.id)}
                className={chip(personIds.includes(p.id))}
              >
                <Avatar name={p.name} emoji={p.emoji} size="xs" shape="circle" />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Notes({ question: q }: { question: OpenQuestionRow }) {
  const { t } = useTranslation()
  const mentionPeople = useMentionPeople()
  const add = useAddOpenQuestionNote()
  const [draft, setDraft] = useState('')

  const submit = () => {
    const content = draft.trim()
    if (!content) return
    setDraft('')
    add.mutate(
      { questionId: q.id, content },
      {
        onError: (err) => {
          setDraft(content)
          toast.error(err instanceof Error ? err.message : t('common.saveFailed'))
        },
      },
    )
  }

  return (
    <div>
      <div className={`mb-2 ${monoLabel}`}>{t('openQuestions.notesLabel')}</div>
      <div className="mb-4">
        <MentionField
          value={draft}
          onChange={setDraft}
          people={mentionPeople}
          multiline
          rows={3}
          maxLength={10_000}
          placeholder={t('openQuestions.notePlaceholder')}
          onEnter={submit}
          className="w-full resize-none rounded-xl border border-[var(--hairline)] bg-[var(--paper)] px-4 py-3 text-[15px] text-[var(--ink)] outline-hidden placeholder:text-[var(--ink-4)] placeholder:italic focus:border-[var(--hairline-2)]"
          style={{ fontFamily: 'var(--font-text)' }}
          aria-label={t('openQuestions.notePlaceholder')}
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--ink-4)]">{t('openQuestions.noteHint')}</span>
          <button
            onClick={submit}
            disabled={!draft.trim()}
            className="flex items-center gap-1 rounded-md border border-[var(--hairline)] px-2.5 py-1 text-xs text-[var(--ink-2)] hover:border-[var(--hairline-2)] hover:text-[var(--ink)] disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            {t('openQuestions.addNote')}
          </button>
        </div>
      </div>
      {q.notes.length > 0 && (
        <ol className="relative ml-1.5 space-y-5 border-l border-[var(--hairline-2)] pl-5">
          {q.notes.map((n) => (
            <NoteRow key={n.id} note={n} />
          ))}
        </ol>
      )}
    </div>
  )
}

function NoteRow({ note }: { note: OpenQuestionRow['notes'][number] }) {
  const { t } = useTranslation()
  const day = useDayFormat()
  const mentionPeople = useMentionPeople()
  const update = useUpdateOpenQuestionNote()
  const remove = useDeleteOpenQuestionNote()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const content = draft.trim()
    setEditing(false)
    if (!content || content === toEditable(note.content, mentionPeople)) return
    update.mutate(
      { id: note.id, content },
      { onError: (err) => toast.error(err instanceof Error ? err.message : t('common.saveFailed')) },
    )
  }

  return (
    <li className="group relative">
      <span
        className="absolute top-1.5 -left-[25px] h-2 w-2 rounded-full border-2"
        style={{ borderColor: 'var(--clay)', background: 'var(--vellum)' }}
        aria-hidden
      />
      <div className="mb-1 flex items-center gap-2">
        <time className="font-mono text-[10px] tracking-[0.08em] text-[var(--ink-3)] uppercase">
          {day(note.createdAt)}
        </time>
        {!editing && !note.id.startsWith('temp-') && (
          <span className="flex gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
            <button
              onClick={() => {
                setDraft(toEditable(note.content, mentionPeople))
                setEditing(true)
              }}
              className="rounded p-1 text-[var(--ink-4)] hover:text-[var(--ink)]"
              aria-label={t('openQuestions.editNote')}
              title={t('openQuestions.editNote')}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={() => {
                if (confirm(t('openQuestions.confirmDeleteNote'))) {
                  remove.mutate(note.id, { onError: () => toast.error(t('common.deleteFailed')) })
                }
              }}
              className="rounded p-1 text-[var(--ink-4)] hover:text-[var(--rust)]"
              aria-label={t('openQuestions.deleteNote')}
              title={t('openQuestions.deleteNote')}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>
      {editing ? (
        <MentionField
          value={draft}
          onChange={setDraft}
          people={mentionPeople}
          multiline
          rows={3}
          autoFocus
          maxLength={10_000}
          onEnter={commit}
          onEscape={() => setEditing(false)}
          onBlur={commit}
          className="w-full resize-none rounded-lg border border-[var(--hairline-2)] bg-[var(--paper)] px-3 py-2 text-[15px] text-[var(--ink)] outline-hidden"
          style={{ fontFamily: 'var(--font-text)' }}
        />
      ) : (
        <p
          className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-text)' }}
        >
          <MentionText text={note.content} link />
        </p>
      )}
    </li>
  )
}
