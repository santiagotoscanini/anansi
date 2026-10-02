import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'

// The guard on the app's HTTP surface. A new endpoint that forgets its auth
// fails here instead of shipping unauthenticated.
//
//   - Every server function in src/server/fn/*.fn.ts carries `authMiddleware`,
//     except the ones named in OPEN_FNS.
//   - Every file under src/routes that declares server `handlers` is named in
//     SERVER_ROUTES with the guard it uses, and actually calls it: `session`
//     (getServerSession, the browser cookie), `bearer` (validateBearer, the MCP
//     token) or `open` (no caller identity, and the reason why).

const ROUTES = 'src/routes'
const FNS = 'src/server/fn'

/** Server functions that run without a session, by file, and why. */
const OPEN_FNS: Record<string, readonly string[]> = {
  // The pre-sign-in surface. Each password/IdP door carries its own per-IP
  // limit; fetchSession/fetchAuthMode only describe the caller's own state.
  'auth.fn.ts': ['fetchAuthMode', 'probeEmail', 'startOidcSignIn', 'signIn', 'signUp', 'signOut', 'fetchSession'],
  // Reads the visitor's own theme/locale/sidebar cookies for the first paint.
  'shell.fn.ts': ['getShellPrefs'],
  // /oauth/authorize: validates the request first, then reads the session
  // itself and sends a signed-out visitor to /login.
  'oauth.fn.ts': ['resolveAuthorize'],
}

type Guard = 'session' | 'bearer' | 'open'

/** Every server route, and how it knows who is calling. */
const SERVER_ROUTES: Record<string, Guard> = {
  'api.files.$id.ts': 'session',
  'api.mcp.ts': 'bearer',
  'oauth.authorize.decision.ts': 'session', // plus its own same-origin check
  // Auth.js, cut to session/csrf/providers/signin/error, POST signout and the
  // OIDC door; the credentials doors 404 (the file says why).
  'api.auth.$.ts': 'open',
  // The platform's probe.
  'api.healthz.ts': 'open',
  // OAuth 2.1 for MCP clients: these ARE the token-issuing doors. Client
  // registration and token exchange are rate limited; the code exchange is
  // bound by PKCE; revoke only destroys the token presented.
  'oauth.register.ts': 'open',
  'oauth.token.ts': 'open',
  'oauth.revoke.ts': 'open',
  // Public discovery documents.
  '[.]well-known.oauth-authorization-server.ts': 'open',
  '[.]well-known.oauth-protected-resource.ts': 'open',
}

const GUARD_CALL: Record<Exclude<Guard, 'open'>, RegExp> = {
  session: /\bgetServerSession\(\)/,
  bearer: /\bvalidateBearer\(/,
}

const read = (dir: string, name: string) => fs.readFileSync(path.join(dir, name), 'utf8')

const routeFiles = fs.readdirSync(ROUTES).filter((f) => /\.tsx?$/.test(f) && f !== 'routeTree.gen.ts')
const serverRouteFiles = routeFiles.filter((f) => /\bhandlers\s*:/.test(read(ROUTES, f)))
const fnFiles = fs.readdirSync(FNS).filter((f) => f.endsWith('.fn.ts'))

/** Each `export const <name> = createServerFn(...)...` chain, by name. */
function serverFns(src: string): { name: string; chain: string }[] {
  const starts = [...src.matchAll(/export const (\w+)\s*=\s*createServerFn\(/g)]
  return starts.map((m, i) => ({
    name: m[1]!,
    chain: src.slice(m.index, starts[i + 1]?.index ?? src.length),
  }))
}

describe('the HTTP surface', () => {
  test('finds the files it guards', () => {
    assert.ok(serverRouteFiles.length > 0, 'no server routes found')
    assert.ok(fnFiles.length > Object.keys(OPEN_FNS).length, 'no server fn files found')
  })

  test('every server route is accounted for', () => {
    assert.deepEqual([...serverRouteFiles].sort(), Object.keys(SERVER_ROUTES).sort())
  })

  for (const [name, guard] of Object.entries(SERVER_ROUTES)) {
    if (guard === 'open') continue
    test(`${name} calls its ${guard} guard`, () => {
      assert.match(read(ROUTES, name), GUARD_CALL[guard])
    })
  }

  test('the open server fns all still exist (the list cannot rot)', () => {
    for (const [file, names] of Object.entries(OPEN_FNS)) {
      const found = serverFns(read(FNS, file)).map((f) => f.name)
      for (const n of names) assert.ok(found.includes(n), `${file}: ${n} is listed open but no longer exists`)
    }
  })

  for (const file of fnFiles) {
    test(`${file} gives every server fn authMiddleware`, () => {
      const src = read(FNS, file)
      const fns = serverFns(src)
      assert.equal(
        fns.length,
        (src.match(/createServerFn\(/g) ?? []).length,
        'a server fn is not `export const x = createServerFn(`',
      )
      assert.ok(fns.length > 0, 'no server functions found')
      const open = new Set(OPEN_FNS[file] ?? [])
      for (const { name, chain } of fns) {
        if (open.has(name)) continue
        assert.match(chain, /\.middleware\(\[[^\]]*\bauthMiddleware\b/, `${name} lacks authMiddleware`)
      }
    })
  }
})
