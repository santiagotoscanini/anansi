import { useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { HEALTH_METRICS, type WeekSummary } from '~/lib/health'
import { toEditable } from '~/lib/mentions'
import { useAddSyncItemBlock, useRemoveSyncItemBlock, useUpdateSyncItemBlock } from '~/lib/mutations/weekly-sync'
import { SYNC_BLOCK_CONTENT_MAX, SYNC_BLOCK_TITLE_MAX } from '~/lib/api/types'
import { isLongBlock } from '~/lib/sync-item'
import MarkdownText, { type MarkdownAttachment } from './MarkdownText'
import MentionField from './MentionField'
import { useMentionPeople } from './MentionText'

// The parts of a weekly sync item beyond its notes and pictures: the week's
// Apple Health figure, and the named text blocks under the notes. Shared by
// the Sync tab and Pulse (through WeeklySyncItemRow) and by Over time.

export const notesStyle = {
  fontFamily: 'var(--font-text)',
  fontSize: 15,
  lineHeight: 1.6,
  color: 'var(--ink)',
} as const

// ── Apple Health ─────────────────────────────────────────────────────────────

/** "Sleep · 7.4 h avg · 6 of 7 nights" with a seven-bar sparkline, or a quiet line when the week has no data. */
export function HealthWeek({ summary }: { summary: WeekSummary }) {
  const { t, i18n } = useTranslation()
  const m = HEALTH_METRICS[summary.metric]
  const number = (n: number) => n.toLocaleString(i18n.language, { maximumFractionDigits: m.digits })
  const label = t(`health.metric.${summary.metric}`)
  if (summary.value === null) {
    return (
      <p className="text-[13px] text-[var(--ink-4)] italic" style={{ fontFamily: 'var(--font-text)' }}>
        {label} · {t('health.none')}
      </p>
    )
  }
  const unit = t(`health.unit.${m.unit}`)
  const over = t(`health.over.${m.over}`)
  const max = Math.max(...summary.daily.map((d) => d.value ?? 0), 0)
  const weekday = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(i18n.language, { weekday: 'short', timeZone: 'UTC' })
  return (
    <div className="flex items-center gap-3 text-[13px] text-[var(--ink-2)] tabular-nums">
      <svg width={62} height={18} viewBox="0 0 62 18" aria-hidden className="shrink-0">
        {summary.daily.map((d, i) => {
          const h = d.value !== null && max > 0 ? Math.max(2, (d.value / max) * 18) : 0
          return (
            <g key={d.day}>
              <title>
                {d.value === null
                  ? t('health.dayNone', { day: weekday(d.day) })
                  : t('health.dayTitle', { day: weekday(d.day), value: `${number(d.value)} ${unit}` })}
              </title>
              {h > 0 ? (
                <rect x={i * 9} y={18 - h} width={6} height={h} rx={1.5} fill="var(--clay)" />
              ) : (
                <rect x={i * 9} y={16.5} width={6} height={1.5} rx={0.75} fill="var(--hairline-2)" />
              )}
            </g>
          )
        })}
      </svg>
      <span>
        <span className="text-[var(--ink-3)]">{label}</span> · {number(summary.value)} {unit}
        {over && ` ${over}`} ·{' '}
        <span className="text-[var(--ink-3)]">
          {summary.metric === 'sleep'
            ? t('health.nights', { count: summary.days })
            : t('health.days', { count: summary.days })}
        </span>
      </span>
    </div>
  )
}

// ── Named blocks ─────────────────────────────────────────────────────────────

export interface Block {
  id: string
  title: string
  content: string
}

/** A block shown as a quiet heading over its text; long ones fold. Read-only. */
export function BlockView({
  block,
  attachments,
  onEdit,
}: {
  block: Block
  attachments?: readonly MarkdownAttachment[]
  onEdit?: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const long = isLongBlock(block.content)
  const folded = long && !open
  const body = block.content.trim() ? (
    <MarkdownText text={block.content} attachments={attachments} link />
  ) : (
    <span className="text-sm text-[var(--ink-4)] italic">{t('weeklySyncRow.blockEmpty')}</span>
  )
  return (
    <div>
      <h5 className="text-[11px] font-medium tracking-[0.08em] text-[var(--ink-3)] uppercase">{block.title}</h5>
      <div
        role={onEdit ? 'button' : undefined}
        tabIndex={onEdit ? 0 : undefined}
        onClick={onEdit}
        onKeyDown={(e) => {
          if (onEdit && e.key === 'Enter') onEdit()
        }}
        title={onEdit ? t('weeklySyncRow.clickToEdit') : undefined}
        className={`relative mt-1 ${onEdit ? '-mx-2 cursor-text rounded-lg px-2 py-1 transition-colors hover:bg-[var(--vellum)]/60' : ''}`}
        style={{ ...notesStyle, ...(folded ? FOLDED : null) }}
      >
        {body}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-xs text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
        >
          {open ? t('weeklySyncRow.showLess') : t('weeklySyncRow.showAll')}
        </button>
      )}
    </div>
  )
}

// A folded block: twelve lines, fading out at the bottom whatever the background.
const FOLDED = {
  maxHeight: '19.2em',
  overflow: 'hidden',
  maskImage: 'linear-gradient(to bottom, black 70%, transparent)',
} as const

const fieldStyle = { background: 'var(--canvas)', border: '1px solid var(--hairline-2)' } as const

/** One block being edited: its title and its text, each saved a second after the last keystroke. */
function BlockEditor({ block, onDone }: { block: Block; onDone: () => void }) {
  const { t } = useTranslation()
  const people = useMentionPeople()
  const update = useUpdateSyncItemBlock()
  const [title, setTitle] = useState(block.title)
  const [content, setContent] = useState(() => toEditable(block.content, people))
  // The fields typed but not yet sent, with the timer that will send them.
  const pending = useRef<{ patch: { title?: string; content?: string }; timer: ReturnType<typeof setTimeout> } | null>(
    null,
  )

  const send = (patch: { title?: string; content?: string }) => {
    pending.current = null
    update.mutate(
      { id: block.id, ...patch },
      { onError: (err) => toast.error(err instanceof Error ? err.message : t('weeklySyncRow.blockSaveFailed')) },
    )
  }

  const queue = (patch: { title?: string; content?: string }) => {
    const merged = { ...pending.current?.patch, ...patch }
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = { patch: merged, timer: setTimeout(() => send(merged), 1000) }
  }

  const finish = () => {
    const waiting = pending.current
    if (waiting) {
      clearTimeout(waiting.timer)
      send(waiting.patch)
    }
    onDone()
  }

  return (
    <div className="space-y-1.5">
      <input
        value={title}
        maxLength={SYNC_BLOCK_TITLE_MAX}
        onChange={(e) => {
          setTitle(e.target.value)
          if (e.target.value.trim()) queue({ title: e.target.value.trim() })
        }}
        placeholder={t('weeklySyncRow.blockTitlePlaceholder')}
        aria-label={t('weeklySyncRow.blockTitlePlaceholder')}
        className="block w-full rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--ink)] outline-hidden placeholder:text-[var(--ink-4)]"
        style={fieldStyle}
      />
      <MentionField
        multiline
        autoFocus
        value={content}
        onChange={(text) => {
          setContent(text)
          queue({ content: text })
        }}
        people={people}
        maxLength={SYNC_BLOCK_CONTENT_MAX}
        placeholder={t('weeklySyncRow.blockContentPlaceholder')}
        aria-label={t('weeklySyncRow.blockContentPlaceholder')}
        className="block max-h-[60vh] min-h-[96px] w-full resize-none rounded-lg px-3 py-2 outline-hidden placeholder:text-[var(--ink-4)]"
        style={{ ...notesStyle, fieldSizing: 'content', ...fieldStyle }}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[var(--ink-4)]">{t('weeklySyncRow.mentionHint')}</span>
        <button
          type="button"
          onClick={finish}
          className="rounded-md px-2.5 py-1 text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
        >
          {t('weeklySyncRow.done')}
        </button>
      </div>
    </div>
  )
}

/**
 * A sync item's blocks, editable: click one to edit it, delete it on hover, and
 * a quiet "Add a block" line at the end that asks only for a title first.
 */
export function SyncItemBlocks({
  syncItemId,
  blocks,
  attachments,
}: {
  syncItemId: string
  blocks: readonly Block[]
  attachments?: readonly MarkdownAttachment[]
}) {
  const { t } = useTranslation()
  const add = useAddSyncItemBlock()
  const remove = useRemoveSyncItemBlock()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState<string | null>(null)

  const create = () => {
    const title = newTitle?.trim()
    if (!title) {
      setNewTitle(null)
      return
    }
    add.mutate(
      { weeklySyncItemId: syncItemId, title },
      {
        onSuccess: (created) => {
          setNewTitle(null)
          setEditingId(created.id)
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : t('weeklySyncRow.blockSaveFailed')),
      },
    )
  }

  const confirmRemove = (block: Block) => {
    if (!confirm(t('weeklySyncRow.deleteBlockPrompt', { title: block.title }))) return
    remove.mutate(block.id, {
      onError: (err) => toast.error(err instanceof Error ? err.message : t('weeklySyncRow.blockSaveFailed')),
    })
  }

  return (
    <div className="space-y-4">
      {blocks.map((block) =>
        editingId === block.id ? (
          <BlockEditor key={block.id} block={block} onDone={() => setEditingId(null)} />
        ) : (
          <div key={block.id} className="group/block relative">
            <BlockView block={block} attachments={attachments} onEdit={() => setEditingId(block.id)} />
            <button
              type="button"
              onClick={() => confirmRemove(block)}
              className="absolute -top-1 right-0 rounded-md p-1 text-[var(--ink-4)] transition-opacity hover:bg-[var(--rust-soft)] hover:text-[var(--rust)] md:opacity-0 md:group-hover/block:opacity-100"
              title={t('weeklySyncRow.deleteBlock')}
              aria-label={t('weeklySyncRow.deleteBlock')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
      )}
      {newTitle !== null ? (
        <input
          autoFocus
          value={newTitle}
          maxLength={SYNC_BLOCK_TITLE_MAX}
          disabled={add.isPending}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create()
            if (e.key === 'Escape') setNewTitle(null)
          }}
          onBlur={create}
          placeholder={t('weeklySyncRow.blockTitlePlaceholder')}
          aria-label={t('weeklySyncRow.blockTitlePlaceholder')}
          className="block w-full rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--ink)] outline-hidden placeholder:text-[var(--ink-4)]"
          style={fieldStyle}
        />
      ) : (
        <button
          type="button"
          onClick={() => setNewTitle('')}
          className="-mx-2 flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-[var(--ink-4)] transition-colors hover:bg-[var(--vellum)]/60 hover:text-[var(--ink-2)] md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
        >
          <Plus className="h-3 w-3" />
          {t('weeklySyncRow.addBlock')}
        </button>
      )}
    </div>
  )
}
