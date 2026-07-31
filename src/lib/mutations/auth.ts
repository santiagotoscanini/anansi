import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { signIn, signOut, signUp } from '~/server/fn/auth.fn'

// The three flows that change who is signed in.
//
// Not `useMutation`, unlike everything else in this directory: these are called
// from form submit handlers that already own their pending and error state, and
// they return a result object rather than throwing. A mutation object would add
// a second, redundant copy of both. What they do need — and what a bare server
// fn call would miss — is cache invalidation, which is the whole reason they
// live here instead of being imported directly by the forms.

/**
 * Drop every cached query.
 *
 * `resetQueries`, not `invalidateQueries`: invalidation keeps the old data
 * visible until the refetch lands, which after a sign-out means the previous
 * user's goals stay on screen. Reset clears them immediately. It also covers
 * sign-in, where the cache may hold `null` session data from before.
 */
function useResetIdentity() {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await queryClient.resetQueries()
  }, [queryClient])
}

export function useSignIn() {
  const resetIdentity = useResetIdentity()
  return useCallback(
    async (email: string, password: string) => {
      const result = await signIn({ data: { email, password } })
      if (result.ok) await resetIdentity()
      return result
    },
    [resetIdentity],
  )
}

export function useSignUp() {
  const resetIdentity = useResetIdentity()
  return useCallback(
    async (name: string, email: string, password: string) => {
      const result = await signUp({ data: { name, email, password } })
      if (result.ok) await resetIdentity()
      return result
    },
    [resetIdentity],
  )
}

export function useSignOut() {
  const resetIdentity = useResetIdentity()
  return useCallback(async () => {
    // The reset runs even if signOut throws. A failure here means the cookie
    // may still be live, but leaving the previous user's data rendered is the
    // worse of the two outcomes — and the next server-fn call will 401 anyway.
    try {
      await signOut()
    } finally {
      await resetIdentity()
    }
  }, [resetIdentity])
}
