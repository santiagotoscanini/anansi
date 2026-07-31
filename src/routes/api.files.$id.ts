import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { db } from '~/lib/data'
import { files } from '~/lib/data/schema'
import { getServerSession } from '~/server/auth/session'

// Auth-gated file serving. Every uploaded blob lives in the `files` table and
// is fetched by id through this route. Only the file's owner can read it — the
// `(id, ownerId)` equality check folds the owner gate into the lookup so a
// missing row and a wrong owner are indistinguishable from the caller's side.
// No token TTLs; access is gated by the session cookie on every request.
//
// The path must stay exactly `/api/files/$id`: the literal string
// `/api/files/{id}` is persisted in `users.avatar_url` and `people.emoji`, so
// moving this route breaks every stored reference.
export const Route = createFileRoute('/api/files/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const session = await getServerSession()
        if (!session?.user?.id) return new Response('Unauthorized', { status: 401 })

        const [row] = await db
          .select({ data: files.data, mimeType: files.mimeType, sizeBytes: files.sizeBytes })
          .from(files)
          .where(and(eq(files.id, params.id), eq(files.ownerId, session.user.id)))
          .limit(1)
        if (!row) return new Response('Not found', { status: 404 })

        return new Response(new Uint8Array(row.data), {
          status: 200,
          headers: {
            'Content-Type': row.mimeType,
            'Content-Length': String(row.sizeBytes),
            // Private so a shared cache never holds another user's bytes;
            // 5 minutes so a page full of avatars doesn't refetch each one.
            'Cache-Control': 'private, max-age=300',
          },
        })
      },
    },
  },
})
