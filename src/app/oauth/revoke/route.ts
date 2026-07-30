import { NextResponse, type NextRequest } from 'next/server'
import { revokeToken } from '~/lib/mcp/oauth/tokens'
import { appendAudit } from '~/lib/mcp/oauth/audit'
import { clientIpFromHeaders } from '~/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// RFC 7009 token revocation. Always 200 — even on unknown tokens — so an
// attacker can't probe which tokens exist.

async function readBody(req: NextRequest): Promise<Record<string, string>> {
  const contentType = req.headers.get('content-type') ?? ''
  const out: Record<string, string> = {}
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text()
    for (const [k, v] of new URLSearchParams(text).entries()) out[k] = v
    return out
  }
  if (contentType.includes('application/json')) {
    try {
      const parsed: unknown = await req.json()
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === 'string') out[k] = v
        }
      }
    } catch {
      /* ignore */
    }
  }
  return out
}

export async function POST(req: NextRequest) {
  const body = await readBody(req)
  const token = body.token
  if (!token) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'token required' }, { status: 400 })
  }
  const hint =
    body.token_type_hint === 'refresh_token' || body.token_type_hint === 'access_token'
      ? body.token_type_hint
      : undefined

  await revokeToken(token, hint)

  await appendAudit({
    event: 'token_revoked',
    ip: clientIpFromHeaders(req.headers),
    meta: { hint: hint ?? null },
  })

  return new NextResponse(null, { status: 200 })
}
