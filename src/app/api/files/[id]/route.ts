import { NextResponse, type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { auth } from '~/lib/auth'
import { db } from '~/lib/data'
import { files } from '~/lib/data/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Auth-gated file serving. Replaces Supabase Storage's public/signed-URL flow:
// every uploaded blob lives in the `files` table and is fetched by id through
// this route. Only the file's owner can read it — the `(id, ownerId)` equality
// check folds the owner gate into the lookup so a missing row and a wrong
// owner are indistinguishable from the caller's side. No token TTLs; access is
// gated by the session cookie on every request.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await ctx.params
  const [row] = await db
    .select({ data: files.data, mimeType: files.mimeType, sizeBytes: files.sizeBytes })
    .from(files)
    .where(and(eq(files.id, id), eq(files.ownerId, session.user.id)))
    .limit(1)
  if (!row) return new NextResponse('Not found', { status: 404 })

  return new NextResponse(new Uint8Array(row.data), {
    status: 200,
    headers: {
      'Content-Type': row.mimeType,
      'Content-Length': String(row.sizeBytes),
      'Cache-Control': 'private, max-age=300',
    },
  })
}
