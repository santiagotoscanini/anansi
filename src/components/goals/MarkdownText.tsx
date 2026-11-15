import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { parseBlocks, parseInline, type Inline, type MediaKind } from '~/lib/markdown'
import MentionText from './MentionText'

/** What a media marker can stand for: the files of the day or the sync item the text belongs to. */
export interface MarkdownAttachment {
  id: string
  url: string
  fileName: string
  fileType: string
}

const kindOf = (fileType: string): MediaKind =>
  fileType === 'image' || fileType === 'video' || fileType === 'audio' ? fileType : 'other'

// A click on something that does its own thing (a link, a player) must not
// also reach a parent that opens the editor.
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

const HEADING: Record<number, CSSProperties> = {
  1: { fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: 1.2, letterSpacing: '-0.01em' },
  2: { fontFamily: 'var(--font-display)', fontSize: 21, lineHeight: 1.25, color: 'var(--ink-2)' },
  3: { fontFamily: 'var(--font-ui)', fontSize: 16, fontWeight: 600, lineHeight: 1.3 },
  4: { fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, lineHeight: 1.3 },
  5: { fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, lineHeight: 1.3, color: 'var(--ink-2)' },
  6: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--ink-3)',
  },
}

/**
 * Stored text drawn as Markdown: the way a journal day and a sync note are
 * read. The text itself is never changed; an editor still shows it as typed.
 * Mentions inside it are people, as everywhere (`MentionText`), and a media
 * marker such as `[foto 2]` shows the second picture of `attachments` in its
 * place. A marker with nothing behind it stays as written.
 */
export default function MarkdownText({
  text,
  attachments = [],
  link = false,
}: {
  text: string
  attachments?: readonly MarkdownAttachment[]
  link?: boolean
}) {
  const byKind = (kind: MediaKind, n: number) => attachments.filter((a) => kindOf(a.fileType) === kind)[n - 1]

  const media = (kind: MediaKind, n: number, raw: string, key: number | string): ReactNode => {
    const file = byKind(kind, n)
    if (!file) {
      return (
        <span key={key} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-4)' }}>
          {raw}
        </span>
      )
    }
    if (kind === 'image') {
      return (
        <a
          key={key}
          href={file.url}
          target="_blank"
          rel="noreferrer"
          onClick={stop}
          title={file.fileName}
          className="my-1 block"
        >
          <img
            src={file.url}
            alt={file.fileName}
            loading="lazy"
            className="rounded-xl"
            style={{ maxHeight: 520, maxWidth: '100%' }}
          />
        </a>
      )
    }
    if (kind === 'video') {
      return (
        <video
          key={key}
          src={file.url}
          controls
          preload="metadata"
          onClick={stop}
          className="my-1 block rounded-xl"
          style={{ background: '#14100d', maxHeight: 520, maxWidth: '100%' }}
        />
      )
    }
    if (kind === 'audio') {
      return (
        <audio
          key={key}
          src={file.url}
          controls
          preload="metadata"
          onClick={stop}
          className="my-1 block w-full max-w-md"
        />
      )
    }
    return (
      <a
        key={key}
        href={file.url}
        target="_blank"
        rel="noreferrer"
        onClick={stop}
        className="underline decoration-[var(--hairline-2)] underline-offset-4"
      >
        {file.fileName}
      </a>
    )
  }

  const inline = (nodes: Inline[]): ReactNode =>
    nodes.map((node, i) => {
      switch (node.type) {
        case 'text':
          return <MentionText key={i} text={node.text} link={link} />
        case 'strong':
          return <strong key={i}>{inline(node.children)}</strong>
        case 'em':
          return <em key={i}>{inline(node.children)}</em>
        case 'code':
          return (
            <code
              key={i}
              className="rounded px-1 py-0.5"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em', background: 'var(--vellum)' }}
            >
              {node.text}
            </code>
          )
        case 'link':
          return (
            <a
              key={i}
              href={node.href}
              target="_blank"
              rel="noreferrer"
              onClick={stop}
              className="break-words underline decoration-[var(--hairline-2)] underline-offset-4 hover:text-[var(--clay)]"
            >
              {inline(node.children)}
            </a>
          )
        case 'media':
          return media(node.kind, node.n, node.raw, i)
      }
    })

  const line = (text: string) => inline(parseInline(text))

  return (
    <div className="space-y-3">
      {parseBlocks(text).map((block, i) => {
        switch (block.type) {
          case 'heading':
            return (
              <p
                key={i}
                role="heading"
                aria-level={Math.min(6, block.level + 2)}
                style={{ color: 'var(--ink)', ...HEADING[block.level], marginTop: i === 0 ? 0 : 18 }}
              >
                {line(block.text)}
              </p>
            )
          case 'rule':
            return <hr key={i} style={{ border: 0, borderTop: '1px solid var(--hairline-2)', margin: '18px 0' }} />
          case 'paragraph':
            return (
              <p key={i}>
                {block.lines.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {line(l)}
                  </Fragment>
                ))}
              </p>
            )
          case 'list':
            return (
              <ul key={i} className="space-y-1">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2" style={{ marginLeft: item.depth * 20 }}>
                    <span className="shrink-0 select-none" style={{ color: 'var(--ink-3)', minWidth: 12 }}>
                      {item.ordered ? item.marker : '•'}
                    </span>
                    <span className="min-w-0">{line(item.text)}</span>
                  </li>
                ))}
              </ul>
            )
          case 'quote':
            return (
              <blockquote
                key={i}
                className="pl-4"
                style={{ borderLeft: '2px solid var(--hairline-2)', color: 'var(--ink-2)', fontStyle: 'italic' }}
              >
                {block.lines.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {line(l)}
                  </Fragment>
                ))}
              </blockquote>
            )
          case 'code':
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-lg p-3"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--vellum)' }}
              >
                {block.text}
              </pre>
            )
          case 'media':
            return <div key={i}>{media(block.kind, block.n, block.raw, 'm')}</div>
        }
      })}
    </div>
  )
}
