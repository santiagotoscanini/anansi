// Login + Register screens — the two public auth surfaces. Both render
// full-screen 2-pane layouts, route-driven (not state-driven). Each one
// is invoked by its own route page; auth success redirects to /app via
// the `onSuccess` callback. Navigation between login ↔ register is also
// via callback so the parent route component decides whether to push,
// replace, or stay.

import { useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSignIn, useSignUp } from '~/lib/mutations/auth'
import { probeEmail, startOidcSignIn } from '~/server/fn/auth.fn'
import { AnansiMark, BrandLockup, Wordmark } from '~/components/goals/Brand'
import toast from 'react-hot-toast'

// Brand lockup that doubles as a back-to-landing link. Used in the
// corner of every auth screen so the brand is also the escape hatch.
function HomeLockup({ size = 22 }: { size?: number }) {
  const { t } = useTranslation()
  return (
    <Link to="/" aria-label={t('auth.homeAria')} style={{ display: 'inline-block', textDecoration: 'none' }}>
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

/**
 * Shown when the identity provider bounced the sign-in back with an error.
 *
 * Its reason for existing is the loop: Auth.js sends every failed sign-in to
 * `pages.signIn` (= /login) with `?error=`, and /login's job under SSO is to
 * redirect to the IdP — so without a branch that renders instead of bouncing,
 * an account the IdP refuses spins between the two forever. `onRetry` is the
 * deliberate, user-initiated way back into that redirect.
 *
 * The code is surfaced verbatim rather than mapped to a friendlier sentence:
 * it is the only handle on what actually happened, and the two likely causes
 * (not in the allowed group, expired attempt) are already in the body copy.
 */
export function SignInErrorScreen({
  code,
  providerName,
  onRetry,
}: {
  code: string
  /** Null only if SSO is off, in which case this screen is unreachable. */
  providerName: string | null
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const provider = providerName ?? t('auth.oidc.providerFallback')

  return (
    <div
      className="flex min-h-screen flex-col justify-between"
      style={{ background: 'var(--paper)', padding: '48px 32px' }}
    >
      <HomeLockup size={22} />

      <div className="mx-auto w-full" style={{ maxWidth: 460 }}>
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
          {t('auth.oidc.errorKicker')}
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 36,
            lineHeight: 1.1,
            marginBottom: 16,
            color: 'var(--ink)',
          }}
        >
          {t('auth.oidc.errorTitle')}
        </h1>
        <p style={{ fontFamily: 'var(--font-text)', fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)' }}>
          {t('auth.oidc.errorBody', { provider })}
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', marginTop: 20 }}>
          {t('auth.oidc.errorCode', { code })}
        </p>

        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 32,
            height: 48,
            padding: '0 28px',
            background: 'var(--clay)',
            color: 'var(--paper)',
            border: 0,
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {t('auth.oidc.retry')} <ArrowRight size={14} />
        </button>
      </div>

      {/* Spacer twin of the lockup — keeps the message optically centred
          without a second absolutely-positioned element. */}
      <div aria-hidden style={{ height: 22 }} />
    </div>
  )
}

// EMAIL-FIRST, TWO-STEP. Step 'email' shows the address alone; submitting it
// asks the server which door that address goes through (`probeEmail`) and
// either hands the browser to the IdP or reveals the password field in place.
// A step, not a second page, so the browser's password manager sees one form
// with both fields.
//
// ⚠ THE ENUMERATION RULE, restated here because this is where it is visible:
// an address that does not exist gets the password field, exactly like one
// that does, and the credential check then fails identically. `probeEmail`
// collapses its `unknown` result into `password` server-side (auth.fn.ts)
// precisely so this component CANNOT render the difference even by accident.
export function LoginScreen({
  oidcEnabled,
  providerName,
  next,
  onSwitchToRegister,
  onSuccess,
}: {
  oidcEnabled: boolean
  /** Null only when SSO is off, in which case the IdP button never renders. */
  providerName: string | null
  /** Threaded into the OIDC flow so a `?next=` deep link survives the IdP round trip. */
  next?: string
  onSwitchToRegister?: () => void
  onSuccess?: () => void
}) {
  const signInWithPassword = useSignIn()
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // 'email' → the address only; 'password' → the credential field revealed
  // below it.
  const [step, setStep] = useState<'email' | 'password'>('email')
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const provider = providerName ?? t('auth.oidc.providerFallback')

  /** Full-page navigation, not a router push — the IdP is a different origin. */
  const goToIdp = async () => {
    const result = await startOidcSignIn({ data: { next } })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    window.location.href = result.url
  }

  const handleEmailStep = async () => {
    if (!email) {
      toast.error(t('auth.login.needEmail'))
      return
    }
    setSubmitting(true)
    try {
      const result = await probeEmail({ data: { email: email.trim() } })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.method === 'oidc') {
        await goToIdp()
        return
      }
      setStep('password')
    } catch {
      toast.error(t('auth.login.probeFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const handlePasswordStep = async () => {
    if (!password) {
      toast.error(t('auth.login.needCredentials'))
      return
    }
    setSubmitting(true)
    const result = await signInWithPassword(email.trim(), password)
    setSubmitting(false)
    if (result.ok) {
      toast.success(t('auth.login.welcomeBack'))
      setError(false)
      onSuccess?.()
    } else {
      setError(true)
      toast.error(result.error || t('auth.login.credentialsRejected'))
      setPassword('')
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await (step === 'email' ? handleEmailStep() : handlePasswordStep())
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
              // Going back to the address means the answer to "which door" is
              // stale — drop the password step with it.
              onChange={(e) => {
                setEmail(e.target.value)
                setStep('email')
                setPassword('')
                setError(false)
              }}
              placeholder={t('auth.common.emailPlaceholder')}
              autoComplete="username"
              autoFocus
              required
              style={{ ...fieldInput, borderColor: error ? 'var(--rust)' : 'var(--hairline-2)' }}
            />
          </label>

          {step === 'password' && (
            <label style={{ display: 'block', marginBottom: 8 }}>
              <span style={fieldLabel}>{t('auth.common.passwordLabel')}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.common.passwordPlaceholderShort')}
                autoComplete="current-password"
                autoFocus
                required
                style={{ ...fieldInput, borderColor: error ? 'var(--rust)' : 'var(--hairline-2)' }}
              />
              {error && (
                <p style={{ marginTop: 6, fontSize: 12, color: 'var(--rust)' }}>{t('auth.login.credentialsError')}</p>
              )}
            </label>
          )}

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
            ) : step === 'email' ? (
              <>
                {t('auth.login.continue')} <ArrowRight size={14} />
              </>
            ) : (
              <>
                {t('auth.login.submit')} <ArrowRight size={14} />
              </>
            )}
          </button>

          {/* The always-visible escape hatch. The probe routes the operator
              here automatically, but a browser mid-flow, a stale cookie or a
              typo in the address should never be able to hide the IdP door. */}
          {oidcEnabled && (
            <button
              type="button"
              onClick={() => void goToIdp()}
              disabled={submitting}
              style={{
                marginTop: 16,
                width: '100%',
                background: 'transparent',
                border: 0,
                fontSize: 13,
                color: 'var(--ink-3)',
                textDecoration: 'underline',
                textUnderlineOffset: 4,
                cursor: submitting ? 'not-allowed' : 'pointer',
                transition: 'color var(--dur-1) var(--ease)',
              }}
            >
              {t('auth.login.oidcButton', { provider })}
            </button>
          )}

          {/* Registration is open alongside the IdP (invite-gated when the
              deployment sets INVITE_CODE) — see /register's route. */}
          {onSwitchToRegister && (
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
          )}
        </form>
      </div>
    </div>
  )
}

export function RegisterScreen({
  inviteRequired,
  onSwitchToLogin,
  onSuccess,
}: {
  /** Whether this deployment's INVITE_CODE gate is on — from fetchAuthMode. */
  inviteRequired: boolean
  onSwitchToLogin: () => void
  onSuccess?: () => void
}) {
  const signUp = useSignUp()
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; inviteCode?: string }>({})
  const [agreed, setAgreed] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const validate = () => {
    const next: typeof errors = {}
    if (inviteRequired && !inviteCode.trim()) next.inviteCode = t('auth.register.errorInviteMissing')
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
      const result = await signUp(
        name.trim(),
        normalizedEmail,
        password,
        inviteRequired ? inviteCode.trim() : undefined,
      )
      if (!result.ok) {
        toast.error(result.error || t('auth.register.emailTaken'))
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

          {inviteRequired && (
            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={fieldLabel}>{t('auth.register.inviteLabel')}</span>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                style={{
                  ...fieldInput,
                  fontFamily: 'var(--font-mono)',
                  borderColor: errors.inviteCode ? 'var(--rust)' : 'var(--hairline-2)',
                }}
              />
              {errors.inviteCode ? (
                <p style={fieldError}>{errors.inviteCode}</p>
              ) : (
                <p style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-3)' }}>{t('auth.register.inviteHint')}</p>
              )}
            </label>
          )}

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
