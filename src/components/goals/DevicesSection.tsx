import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useSyncExternalStore } from 'react'
import { Check, Copy, Loader2, Smartphone, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { renderSVG } from 'uqr'
import { qk } from '~/lib/queries/keys'
import { createApiKey, listApiKeys, revokeApiKey } from '~/server/fn/api-keys.fn'

// Profile → Devices: API keys for the phone app's REST API (/api/v1/*).
//
// A new key is shown once, as text and as a QR code of an `anansi://connect`
// link: scanning it with the iPhone camera (or the app's own scanner) opens the
// app already pointed at this server with this key, and tapping it on the
// phone itself does the same. After this panel closes the key is gone; only
// its prefix is listed.

interface Props {
  fieldLabel: string
  inputClass: string
  sectionClass: string
}

type NewKey = { name: string; key: string }

export default function DevicesSection({ fieldLabel, inputClass, sectionClass }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const keys = useQuery({ queryKey: qk.apiKeys, queryFn: () => listApiKeys() })
  const [name, setName] = useState('iPhone')
  const [created, setCreated] = useState<NewKey | null>(null)
  const [copied, setCopied] = useState(false)
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => '',
  )

  const create = useMutation({
    mutationFn: (keyName: string) => createApiKey({ data: { name: keyName } }),
    onSuccess: (row) => {
      setCreated({ name: row.name, key: row.key })
      setCopied(false)
      void queryClient.invalidateQueries({ queryKey: qk.apiKeys })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('profile.devicesCreateFailed')),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => revokeApiKey({ data: { id } }),
    onSuccess: () => {
      toast.success(t('profile.devicesRevoked'))
      void queryClient.invalidateQueries({ queryKey: qk.apiKeys })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('profile.devicesRevokeFailed')),
  })

  const connectLink = created
    ? `anansi://connect?server=${encodeURIComponent(origin)}&key=${encodeURIComponent(created.key)}`
    : ''

  const copyKey = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.key)
      setCopied(true)
    } catch {
      toast.error(t('profile.devicesCopyFailed'))
    }
  }

  return (
    <div className={sectionClass}>
      <label className={fieldLabel}>
        <span className="inline-flex items-center gap-1.5">
          <Smartphone className="h-3 w-3" />
          {t('profile.devices')}
        </span>
      </label>
      <p className="mb-4 text-xs leading-relaxed text-[var(--ink-3)]">{t('profile.devicesHelp')}</p>

      {created ? (
        <div className="mb-4 rounded-lg border border-[var(--hairline-2)] bg-[var(--canvas)] p-4">
          <p className="mb-3 text-xs text-[var(--ink-2)]">{t('profile.devicesScan', { name: created.name })}</p>
          {origin ? (
            <img
              className="mx-auto mb-3 w-48 rounded-md bg-white p-2"
              src={`data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(connectLink, { border: 1 }))}`}
              alt={t('profile.devicesQrLabel')}
            />
          ) : null}
          <a
            href={connectLink}
            className="mb-3 block text-center text-xs text-[var(--clay)] underline underline-offset-2"
          >
            {t('profile.devicesOpenOnPhone')}
          </a>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={created.key}
              onClick={(e) => e.currentTarget.select()}
              className={`${inputClass} font-mono text-[12px]`}
              spellCheck={false}
              aria-label={t('profile.devicesKey')}
            />
            <button
              type="button"
              onClick={() => void copyKey()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-1.5 text-xs text-[var(--ink)]"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? t('profile.devicesCopied') : t('profile.devicesCopy')}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--ink-3)]">{t('profile.devicesShownOnce')}</p>
          <button
            type="button"
            onClick={() => setCreated(null)}
            className="mt-3 text-xs text-[var(--ink-2)] underline underline-offset-2"
          >
            {t('profile.devicesDone')}
          </button>
        </div>
      ) : (
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) create.mutate(name.trim())
          }}
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className={inputClass}
            placeholder={t('profile.devicesNamePlaceholder')}
            aria-label={t('profile.devicesName')}
          />
          <button
            type="submit"
            disabled={create.isPending || !name.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--clay)] px-3 py-1.5 text-xs text-[var(--paper)] disabled:opacity-50"
          >
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t('profile.devicesCreate')}
          </button>
        </form>
      )}

      {keys.data && keys.data.length > 0 ? (
        <ul className="divide-y divide-[var(--hairline)] rounded-lg border border-[var(--hairline)]">
          {keys.data.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-[var(--ink)]">{k.name}</div>
                <div className="font-mono text-[11px] text-[var(--ink-3)]">
                  {t('profile.devicesKeyLine', {
                    prefix: k.prefix,
                    used: k.lastUsedAt
                      ? t('profile.devicesLastUsed', { date: new Date(k.lastUsedAt).toLocaleDateString() })
                      : t('profile.devicesNeverUsed'),
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t('profile.devicesRevokeConfirm', { name: k.name }))) revoke.mutate(k.id)
                }}
                className="rounded-md p-1.5 text-[var(--ink-3)] hover:text-[var(--rust)]"
                aria-label={t('profile.devicesRevoke', { name: k.name })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : keys.isSuccess ? (
        <p className="text-[11px] text-[var(--ink-3)]">{t('profile.devicesNone')}</p>
      ) : null}
    </div>
  )
}
