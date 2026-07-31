// `import 'dotenv/config'` MUST be the first statement in this module.
//
// Validation runs at import time, so it has to see a populated `process.env`.
// Next loads .env itself before user code, but Vite does not — it only exposes
// VITE_-prefixed vars via import.meta.env and never populates process.env. The
// nitro plugin that would load .env is build-only in the target config, so
// without this line every server-side var reads as undefined under `vite dev`
// and validation fails on a correctly-configured machine.
import 'dotenv/config'
import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

/**
 * Validated environment access. Import `env` from here instead of reading
 * `process.env` directly: validation runs the first time this module is
 * imported on the server, so a missing or malformed var fails fast at startup
 * with a message naming the variable, rather than surfacing later as a
 * connection error or a silently-unsigned cookie.
 *
 * Server vars are server-only — reading one from client code throws rather
 * than leaking it into the bundle.
 *
 * NOT included here, deliberately:
 *
 *   - MIGRATE_ONLY, read by start.mjs. That script runs before the app and
 *     outside the bundler, and its whole job is to exit before importing
 *     anything. It keeps its own plain `process.env` reads and its own
 *     preflight checks.
 *   - AUTH_TRUST_HOST, read by Auth.js internally rather than by our code.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Any Postgres: local docker, a Supabase session-pooler URL, RDS. The
    // Drizzle migrations create the whole schema including Auth.js's tables.
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid postgres:// connection string'),

    // Signs the Auth.js JWT session cookie. The minimum length is not
    // cosmetic: this secret is the HKDF input material for the cookie's
    // encryption key, so a short one weakens every session. Generate with
    // `openssl rand -base64 32`.
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 chars — use `openssl rand -base64 32`'),

    // ── Pocket ID (OIDC) ────────────────────────────────────────────────────
    //
    // All optional, and all absent in local dev. That ABSENCE is the signal to
    // fall back to email + password — see `oidcEnabled` below. Deliberately not
    // NODE_ENV: a production build without an IdP still has a way in, and a dev
    // container pointed at one behaves exactly like production.
    OIDC_ISSUER_URL: z.string().url('OIDC_ISSUER_URL must be a valid https:// URL').optional(),
    OIDC_CLIENT_ID: z.string().optional(),
    OIDC_CLIENT_SECRET: z.string().optional(),
    // Registered AT THE IDP and not changeable from here. Auth.js builds its own
    // callback URL from the request origin + basePath + `/callback/<provider
    // id>`, so this is not passed through to the wire — it is the value the
    // provider id is checked against, so the two cannot drift. See config.ts.
    OIDC_REDIRECT_URI: z.string().url('OIDC_REDIRECT_URI must be a valid absolute URL').optional(),
    OIDC_PROVIDER_ID: z.string().optional(),
    OIDC_PROVIDER_NAME: z.string().optional(),
    OIDC_SCOPES: z.string().optional(),
  },
  runtimeEnv: process.env,
  // An unset var and a var set to "" should behave identically; without this,
  // `AUTH_SECRET=` in a .env file passes a plain string check and produces a
  // uselessly-signed cookie.
  emptyStringAsUndefined: true,
})

/**
 * Is single sign-on configured on this deployment?
 *
 * The one flag everything else branches on: which provider Auth.js is built
 * with, whether `/login` renders a form or bounces to the IdP, and whether
 * `/register` exists at all. True only when the four vars that make an OIDC
 * round trip possible are ALL present — a half-configured IdP falls back to
 * password login rather than producing a broken redirect.
 *
 * `emptyStringAsUndefined` above means a var set to "" reads as absent here,
 * so blanking one in the env file is a valid way to turn SSO off.
 *
 * Server-side only, like everything else in this module. Client code that
 * needs the answer reads it through the `authMode` server function — importing
 * this file from a route or component would drag dotenv into the browser
 * bundle and throw on the first access.
 */
export const oidcEnabled = Boolean(
  env.OIDC_ISSUER_URL && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET && env.OIDC_REDIRECT_URI,
)
