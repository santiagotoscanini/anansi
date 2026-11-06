import { createFileRoute } from '@tanstack/react-router'
import { fileResponse } from '~/server/api/file-response'
import { getServerSession } from '~/server/auth/session'
import { findOwnedFile } from '~/server/services/files'

// Auth-gated file serving. Every uploaded file is a `files` row (owner, type,
// size) whose bytes live in the app's bucket, and is fetched by id through this
// route. Only the file's owner can read it — the `(id, ownerId)` lookup folds
// the owner gate into the row query so a missing row and a wrong owner are
// indistinguishable from the caller's side. No token TTLs; access is gated by
// the session cookie on every request. The bucket is private: this route is
// the only way out for the bytes.
//
// The path must stay exactly `/api/files/$id`: the literal string
// `/api/files/{id}` is persisted in `users.avatar_url` and `people.emoji`, so
// moving this route breaks every stored reference.
export const Route = createFileRoute('/api/files/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await getServerSession()
        if (!session?.user?.id) return new Response('Unauthorized', { status: 401 })

        const file = await findOwnedFile(session.user.id, params.id)
        const response = file
          ? await fileResponse(file, request, {
              // Private so a shared cache never holds another user's bytes;
              // 5 minutes so a page full of avatars doesn't refetch each one.
              'Cache-Control': 'private, max-age=300',
            })
          : null
        return response ?? new Response('Not found', { status: 404 })
      },
    },
  },
})
