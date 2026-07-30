import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import ScaffoldNotice from '~/components/ScaffoldNotice'
import { safeNext } from '~/lib/safe-next'

// Same sanitize-in-the-validator contract as /login — see the note there,
// including why the transform must not default an absent `next` to '/app'.
export const Route = createFileRoute('/register')({
  validateSearch: z
    .object({
      next: z
        .string()
        .optional()
        .transform((v) => (v === undefined ? undefined : safeNext(v))),
    })
    .catch({ next: undefined }),
  component: () => <ScaffoldNotice route="/register" blockedOn="phase 3.2" />,
})
