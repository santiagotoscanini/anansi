'use client'

// Login + Register screens — the two public auth surfaces. Both render
// full-screen 2-pane layouts, route-driven (not state-driven). Each one
// is invoked by its own route page; auth success redirects to /app via
// the `onSuccess` callback. Navigation between login ↔ register is also
// via callback so the parent route component decides whether to push,
// replace, or stay.

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGoals } from '~/contexts/GoalsContext'
import { AnansiMark, BrandLockup, Wordmark } from '~/components/goals/Brand'
import toast from 'react-hot-toast'

// Brand lockup that doubles as a back-to-landing link. Used in the
// corner of every auth screen so the brand is also the escape hatch.
function HomeLockup({ size = 22 }: { size?: number }) {
  const { t } = useTranslation()
  return (
    <Link href="/" aria-label={t('auth.homeAria')} style={{ display: 'inline-block', textDecoration: 'none' }}>
      <BrandLockup size={size} />
    </Link>
  )
}

// Shared field styles — kept colocated since these forms are the only
// callers and the visual treatment is specific to the auth chrome.
const fieldLabel = {
  display: 'block',
  fontSize: 12,
  color: 'var(--ink-2)',
  marginBottom: 6,
} as const

const fieldInput: React.CSSProperties = {
  width: '100%',
  height: 44,
  padding: '0 14px',
  background: 'var(--canvas)',
  border: '1px solid var(--hairline-2)',
  borderRadius: 10,
  fontSize: 14,
  color: 'var(--ink)',
  outline: 'none',
  fontFamily: 'var(--font-ui)',
}

const fieldError = {
  marginTop: 6,
  fontSize: 12,
  color: 'var(--rust)',
} as const

export function LoginScreen({
  onSwitchToRegister,
  onSuccess,
}: {
  onSwitchToRegister: () => void
  onSuccess?: () => void
}) {
  const { signInWithPassword } = useGoals()
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error(t('auth.login.needCredentials'))
      return
    }
    setSubmitting(true)
    const { ok, error: errMsg } = await signInWithPassword(email, password)
    setSubmitting(false)
    if (ok) {
      toast.success(t('auth.login.welcomeBack'))
      setError(false)
      onSuccess?.()
    } else {
      setError(true)
      toast.error(errMsg ?? t('auth.login.credentialsRejected'))
      setPassword('')
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      {/* Brand panel — vellum, faint mark, kicker + display headline */}
      <div
        className="relative hidden overflow-hidden md:flex md:flex-col md:justify-between"
        style={{
          background: 'var(--paper-deep)',
          borderRight: '1px solid var(--hairline)',
          padding: '64px 64px 56px',
        }}
      >
        <div style={{ position: 'absolute', bottom: -160, left: -160, opacity: 0.06, color: 'var(--ink)' }}>
          <AnansiMark size={520} strokeWidth={1} />
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <HomeLockup size={26} />
        </div>
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 460 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              marginBottom: 28,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <span style={{ width: 28, height: 1, background: 'currentColor' }} />
            {t('auth.common.kicker')}
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 60, lineHeight: 1.1, letterSpacing: '-0.025em' }}>
            {t('auth.login.heroTitle')}
            <span className="brand-em">.</span>
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-text)',
              fontStyle: 'italic',
              fontSize: 19,
              color: 'var(--ink-2)',
              marginTop: 20,
              lineHeight: 1.45,
            }}
          >
            {t('auth.login.heroBody')}
          </p>
        </div>
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
          }}
        >
          <span>{t('auth.common.footerPrivate')}</span>
          <span>{t('auth.common.footerEncrypted')}</span>
          <span>{t('auth.common.footerNoNotifications')}</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center" style={{ padding: '64px 32px', background: 'var(--paper)' }}>
        <div className="mb-6 flex justify-center md:hidden">
          <HomeLockup size={22} />
        </div>
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md">
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.1em',
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            {t('auth.login.kicker')}
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 36,
              lineHeight: 1.1,
              marginBottom: 36,
              color: 'var(--ink)',
            }}
          >
            {t('auth.login.signInTo')} <Wordmark size={36} />
            <span className="brand-em">.</span>
          </h2>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={fieldLabel}>{t('auth.common.emailLabel')}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.common.emailPlaceholder')}
              required
              style={{ ...fieldInput, borderColor: error ? 'var(--rust)' : 'var(--hairline-2)' }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 8 }}>
            <span style={fieldLabel}>{t('auth.common.passwordLabel')}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.common.passwordPlaceholderShort')}
              required
              style={{ ...fieldInput, borderColor: error ? 'var(--rust)' : 'var(--hairline-2)' }}
            />
            {error && (
              <p style={{ marginTop: 6, fontSize: 12, color: 'var(--rust)' }}>{t('auth.login.credentialsError')}</p>
            )}
          </label>

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 24,
              width: '100%',
              height: 48,
              background: 'var(--clay)',
              color: 'var(--paper)',
              border: 0,
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 500,
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              opacity: submitting ? 0.7 : 1,
              transition: 'background var(--dur-1) var(--ease)',
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {t('auth.login.opening')}
              </>
            ) : (
              <>
                {t('auth.login.submit')} <ArrowRight size={14} />
              </>
            )}
          </button>

          <p
            style={{
              fontFamily: 'var(--font-text)',
              fontSize: 13,
              color: 'var(--ink-3)',
              marginTop: 28,
              textAlign: 'center',
            }}
          >
            {t('auth.login.newHere')}{' '}
            <button
              type="button"
              onClick={onSwitchToRegister}
              style={{
                color: 'var(--clay-deep)',
                background: 'transparent',
                border: 0,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {t('auth.login.beginAYear')}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}

export function RegisterScreen({
  onSwitchToLogin,
  onSuccess,
}: {
  onSwitchToLogin: () => void
  onSuccess?: () => void
}) {
  const { signUp } = useGoals()
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({})
  const [agreed, setAgreed] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const validate = () => {
    const next: typeof errors = {}
    if (!name.trim()) next.name = t('auth.register.errorName')
    if (!email.trim()) next.email = t('auth.register.errorEmailMissing')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = t('auth.register.errorEmailFormat')
    if (!password) next.password = t('auth.register.errorPasswordMissing')
    else if (password.length < 12) next.password = t('auth.register.errorPasswordShort')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    if (!agreed) {
      toast.error(t('auth.register.agreementNudge'))
      return
    }
    setSubmitting(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      const { ok, error: errMsg } = await signUp(name.trim(), normalizedEmail, password)
      if (!ok) {
        toast.error(errMsg ?? t('auth.register.emailTaken'))
        return
      }
      toast.success(t('auth.register.welcomeNamed', { name: name.split(' ')[0] }))
      onSuccess?.()
    } catch {
      toast.error(t('auth.register.genericError'))
    } finally {
      setSubmitting(false)
    }
  }

  const passwordStrength = (() => {
    if (!password) return null
    if (password.length < 12) return { label: t('auth.register.strengthShort'), color: 'var(--rust)' }
    if (password.length < 16) return { label: t('auth.register.strengthGood'), color: 'var(--amber)' }
    return { label: t('auth.register.strengthStrong'), color: 'var(--moss)' }
  })()

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="flex flex-col justify-center" style={{ padding: '64px 32px', background: 'var(--paper)' }}>
        <div className="mb-6 flex justify-center md:hidden">
          <HomeLockup size={22} />
        </div>
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md">
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.1em',
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            {t('auth.register.kicker')}
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 40,
              lineHeight: 1.05,
              marginBottom: 12,
              color: 'var(--ink)',
            }}
          >
            {t('auth.register.heroPre')} <span className="brand-em">{t('auth.register.heroEm')}</span>
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-text)',
              fontStyle: 'italic',
              fontSize: 16,
              color: 'var(--ink-2)',
              marginBottom: 32,
              lineHeight: 1.5,
            }}
          >
            {t('auth.register.heroBody')}
          </p>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={fieldLabel}>{t('auth.register.nameLabel')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('auth.register.namePlaceholder')}
              style={{ ...fieldInput, borderColor: errors.name ? 'var(--rust)' : 'var(--hairline-2)' }}
            />
            {errors.name && <p style={fieldError}>{errors.name}</p>}
          </label>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={fieldLabel}>{t('auth.common.emailLabel')}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.common.emailPlaceholder')}
              style={{ ...fieldInput, borderColor: errors.email ? 'var(--rust)' : 'var(--hairline-2)' }}
            />
            {errors.email && <p style={fieldError}>{errors.email}</p>}
          </label>

          <label style={{ display: 'block', marginBottom: 24 }}>
            <span style={{ ...fieldLabel, display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('auth.register.passwordLabel')}</span>
              {passwordStrength && (
                <span style={{ color: passwordStrength.color, fontSize: 11 }}>{passwordStrength.label}</span>
              )}
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.common.passwordPlaceholderLong')}
              style={{ ...fieldInput, borderColor: errors.password ? 'var(--rust)' : 'var(--hairline-2)' }}
            />
            {errors.password && <p style={fieldError}>{errors.password}</p>}
          </label>

          <label
            style={{
              display: 'flex',
              gap: 10,
              marginBottom: 24,
              fontSize: 13,
              color: 'var(--ink-2)',
              lineHeight: 1.45,
              cursor: 'pointer',
            }}
          >
            <button
              type="button"
              onClick={() => setAgreed((v) => !v)}
              aria-pressed={agreed}
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                background: agreed ? 'var(--clay)' : 'var(--canvas)',
                border: agreed ? '1px solid var(--clay)' : '1px solid var(--hairline-2)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 1,
                cursor: 'pointer',
              }}
            >
              {agreed && <Check size={12} color="var(--paper)" />}
            </button>
            <span>{t('auth.register.agreement')}</span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              height: 50,
              background: 'var(--clay)',
              color: 'var(--paper)',
              border: 0,
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 500,
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {t('auth.register.beginning')}
              </>
            ) : (
              <>
                {t('auth.register.submit')} <ArrowRight size={14} />
              </>
            )}
          </button>

          <p
            style={{
              fontFamily: 'var(--font-text)',
              fontSize: 13,
              color: 'var(--ink-3)',
              marginTop: 20,
              textAlign: 'center',
            }}
          >
            {t('auth.register.alreadyStarted')}{' '}
            <button
              type="button"
              onClick={onSwitchToLogin}
              style={{
                color: 'var(--clay-deep)',
                background: 'transparent',
                border: 0,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {t('auth.register.logIn')}
            </button>
          </p>
        </form>
      </div>

      {/* Ink testimonial panel — paper-on-ink, the single inverted register */}
      <div
        className="relative hidden overflow-hidden md:flex md:flex-col md:justify-between"
        style={{ background: 'var(--surface-inverse)', color: 'var(--on-inverse)', padding: '72px 64px' }}
      >
        <div style={{ position: 'absolute', top: -120, right: -120, opacity: 0.08, color: 'var(--on-inverse)' }}>
          <AnansiMark size={520} strokeWidth={1} />
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span style={{ color: 'var(--on-inverse)' }}>
            <HomeLockup size={22} />
          </span>
        </div>
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 460 }}>
          <div
            style={{
              fontFamily: 'var(--font-brand)',
              fontStyle: 'italic',
              fontSize: 72,
              color: 'var(--clay)',
              lineHeight: 0.5,
              fontWeight: 500,
              marginBottom: 24,
            }}
          >
            “
          </div>
          <p
            style={{
              fontFamily: 'var(--font-text)',
              fontStyle: 'italic',
              fontSize: 22,
              lineHeight: 1.45,
              color: 'var(--on-inverse)',
            }}
          >
            {t('auth.register.testimonialBody')}
          </p>
          <div
            style={{
              marginTop: 28,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: 20,
              borderTop: '1px solid var(--hairline-2)',
            }}
          >
            <span>{t('auth.register.testimonialWho')}</span>
            <span>{t('auth.register.testimonialDuration')}</span>
          </div>
        </div>
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
          }}
        >
          {t('auth.register.credit')}
        </div>
      </div>
    </div>
  )
}
