// The manual form for a personality result: flat string fields in, a test's
// `details` out (and back, to edit one). Pure, so the round trip is tested and
// the component only holds strings.
import {
  bigFiveTraits,
  discFactorValues,
  enneagramLabel,
  loveLanguageValues,
  type PersonalityDetails,
  type PersonalityTest,
} from './personality'

export type PersonalityForm = Record<string, string>

const num = (s: string | undefined): number | undefined => {
  if (s === undefined || s.trim() === '') return undefined
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : Number.NaN
}

/** Drop the keys whose value is undefined, so optional fields stay absent. */
function compact<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

/** A text field's value, or undefined when it is blank. */
const filled = (s: string | undefined) => (s?.trim() ? s.trim() : undefined)

/** A stored string field as form text ('' for anything else). */
const text = (v: unknown) => (typeof v === 'string' ? v : '')

const lines = (s: string | undefined) =>
  (s ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

/**
 * The form's fields as a test's details. Not validated here: the result goes
 * through `parsePersonalityResult`, which says what is wrong.
 */
export function formToDetails(test: PersonalityTest, f: PersonalityForm): unknown {
  switch (test) {
    case 'mbti': {
      const axes = compact({ ei: num(f.ei), sn: num(f.sn), tf: num(f.tf), jp: num(f.jp), at: num(f.at) })
      return compact({
        type: (f.type ?? '').trim(),
        identity: filled(f.identity),
        axes: Object.keys(axes).length ? axes : undefined,
      })
    }
    case 'enneagram':
      return compact({
        type: num(f.type),
        wing: num(f.wing),
        tritype: filled(f.tritype),
        instinct: filled(f.instinct),
      })
    case 'big_five':
      return Object.fromEntries(bigFiveTraits.map((t) => [t, num(f[t])]))
    case 'clifton_strengths':
    case 'via_strengths':
      // One per line, in rank order; "Name (Domain)" carries a domain.
      return {
        strengths: lines(f.strengths).map((l) => {
          const m = /^(.*?)\s*\(([^()]+)\)$/.exec(l)
          return m ? { name: m[1]!, domain: m[2]!.trim() } : { name: l }
        }),
      }
    case 'love_languages': {
      // Ranked by score, highest first; a language without a score is left out.
      const scored = loveLanguageValues
        .map((language) => ({ language, score: num(f[language]) }))
        .filter((x) => x.score !== undefined)
      return { ranking: scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)) }
    }
    case 'attachment_style':
      return compact({ style: filled(f.style), anxiety: num(f.anxiety), avoidance: num(f.avoidance) })
    case 'disc': {
      const scores = compact({ D: num(f.D), I: num(f.I), S: num(f.S), C: num(f.C) })
      return compact({
        primary: filled(f.primary),
        secondary: filled(f.secondary),
        scores: Object.keys(scores).length ? scores : undefined,
      })
    }
    case 'other':
      // "Label: value", one per line.
      return {
        fields: lines(f.fields).map((l) => {
          const i = l.indexOf(':')
          return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: l, value: '-' }
        }),
      }
  }
}

const str = (n: number | undefined) => (n === undefined ? '' : String(n))

/** A stored result's details as the form's fields, to edit it. */
export function detailsToForm(test: PersonalityTest, details: PersonalityDetails): PersonalityForm {
  const d = details as Record<string, unknown>
  switch (test) {
    case 'mbti': {
      const axes = (d.axes ?? {}) as Record<string, number | undefined>
      return {
        type: text(d.type),
        identity: text(d.identity),
        ei: str(axes.ei),
        sn: str(axes.sn),
        tf: str(axes.tf),
        jp: str(axes.jp),
        at: str(axes.at),
      }
    }
    case 'enneagram':
      return {
        type: str(d.type as number | undefined),
        wing: str(d.wing as number | undefined),
        tritype: text(d.tritype),
        instinct: text(d.instinct),
      }
    case 'big_five':
      return Object.fromEntries(bigFiveTraits.map((t) => [t, str(d[t] as number | undefined)]))
    case 'clifton_strengths':
    case 'via_strengths':
      return {
        strengths: ((d.strengths ?? []) as { name: string; domain?: string }[])
          .map((s) => (s.domain ? `${s.name} (${s.domain})` : s.name))
          .join('\n'),
      }
    case 'love_languages': {
      const ranking = (d.ranking ?? []) as { language: string; score?: number }[]
      // A ranking stored without scores keeps its order as descending scores.
      return Object.fromEntries(
        loveLanguageValues.map((l) => {
          const i = ranking.findIndex((r) => r.language === l)
          if (i < 0) return [l, '']
          return [l, str(ranking[i]!.score ?? ranking.length - i)]
        }),
      )
    }
    case 'attachment_style':
      return {
        style: text(d.style),
        anxiety: str(d.anxiety as number | undefined),
        avoidance: str(d.avoidance as number | undefined),
      }
    case 'disc': {
      const scores = (d.scores ?? {}) as Record<string, number | undefined>
      return {
        primary: text(d.primary),
        secondary: text(d.secondary),
        ...Object.fromEntries(discFactorValues.map((k) => [k, str(scores[k])])),
      }
    }
    case 'other':
      return {
        fields: ((d.fields ?? []) as { label: string; value: string }[])
          .map((x) => `${x.label}: ${x.value}`)
          .join('\n'),
      }
  }
}

/**
 * A headline for a result whose summary was left blank, where the details say
 * it in any language: the MBTI type, the Enneagram label, the top strengths,
 * the DISC letters. Null where it needs words (attachment, love languages).
 */
export function suggestSummary(test: PersonalityTest, details: unknown): string | null {
  const d = (details ?? {}) as Record<string, unknown>
  switch (test) {
    case 'mbti':
      return typeof d.type === 'string' && d.type
        ? `${d.type.toUpperCase()}${d.identity ? `-${text(d.identity)}` : ''}`
        : null
    case 'enneagram':
      return typeof d.type === 'number' && Number.isFinite(d.type)
        ? `${enneagramLabel({ type: d.type, wing: typeof d.wing === 'number' ? d.wing : undefined })}${d.instinct ? ` ${text(d.instinct)}` : ''}`
        : null
    case 'clifton_strengths':
    case 'via_strengths': {
      const names = ((d.strengths ?? []) as { name: string }[]).slice(0, 3).map((s) => s.name)
      return names.length ? names.join(', ') : null
    }
    case 'disc':
      return typeof d.primary === 'string' && d.primary
        ? `${d.primary}${typeof d.secondary === 'string' ? d.secondary.toLowerCase() : ''}`
        : null
    default:
      return null
  }
}
