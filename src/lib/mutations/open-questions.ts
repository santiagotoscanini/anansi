import { useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from '~/lib/queries/keys'
import type { OpenQuestionRow } from '~/lib/queries/self'
import {
  addOpenQuestionNote,
  createOpenQuestion,
  deleteOpenQuestion,
  deleteOpenQuestionNote,
  reopenOpenQuestion,
  settleOpenQuestion,
  updateOpenQuestion,
  updateOpenQuestionNote,
} from '~/server/fn/open-questions.fn'

// Writes for the open questions on the Self page. A writing surface like the
// rest of Self, so the edits that are cheap to guess are optimistic: each one
// snapshots, patches, rolls back on failure, and refetches on settle so the
// server's copy (linked mentions, real ids, order) replaces the guess.

type Questions = OpenQuestionRow[]

function useOptimisticQuestions() {
  const queryClient = useQueryClient()
  return {
    queryClient,
    begin: async (patch: (old: Questions) => Questions) => {
      await queryClient.cancelQueries({ queryKey: qk.openQuestions })
      const snapshot = queryClient.getQueryData<Questions>(qk.openQuestions)
      if (snapshot) queryClient.setQueryData<Questions>(qk.openQuestions, patch(snapshot))
      return { snapshot }
    },
    rollback: (context: { snapshot?: Questions } | undefined) => {
      if (context?.snapshot) queryClient.setQueryData(qk.openQuestions, context.snapshot)
    },
    settle: () => queryClient.invalidateQueries({ queryKey: qk.openQuestions }),
  }
}

const patchQuestion = (id: string, fn: (q: OpenQuestionRow) => OpenQuestionRow) => (old: Questions) =>
  old.map((q) => (q.id === id ? fn(q) : q))

export function useCreateOpenQuestion() {
  const { settle } = useOptimisticQuestions()
  return useMutation({
    mutationFn: (data: Parameters<typeof createOpenQuestion>[0]['data']) => createOpenQuestion({ data }),
    onSettled: settle,
  })
}

export function useUpdateOpenQuestion() {
  const { begin, rollback, settle } = useOptimisticQuestions()
  return useMutation({
    mutationFn: (data: Parameters<typeof updateOpenQuestion>[0]['data']) => updateOpenQuestion({ data }),
    onMutate: (input) =>
      begin(
        patchQuestion(input.id, (q) => ({
          ...q,
          question: input.question ?? q.question,
          context: input.context === undefined ? q.context : input.context,
          answer: input.answer === undefined ? q.answer : input.answer,
          goalIds: input.goalIds ?? q.goalIds,
          personIds: input.personIds ?? q.personIds,
        })),
      ),
    onError: (_err, _vars, context) => rollback(context),
    onSettled: settle,
  })
}

export function useSettleOpenQuestion() {
  const { begin, rollback, settle } = useOptimisticQuestions()
  return useMutation({
    mutationFn: (data: Parameters<typeof settleOpenQuestion>[0]['data']) => settleOpenQuestion({ data }),
    onMutate: (input) =>
      begin(
        patchQuestion(input.id, (q) => ({
          ...q,
          status: 'settled',
          answer: input.answer,
          settledAt: q.settledAt ?? new Date(),
        })),
      ),
    onError: (_err, _vars, context) => rollback(context),
    onSettled: settle,
  })
}

export function useReopenOpenQuestion() {
  const { begin, rollback, settle } = useOptimisticQuestions()
  return useMutation({
    mutationFn: (id: string) => reopenOpenQuestion({ data: { id } }),
    onMutate: (id) => begin(patchQuestion(id, (q) => ({ ...q, status: 'open', settledAt: null }))),
    onError: (_err, _vars, context) => rollback(context),
    onSettled: settle,
  })
}

export function useDeleteOpenQuestion() {
  const { begin, rollback, settle } = useOptimisticQuestions()
  return useMutation({
    mutationFn: (id: string) => deleteOpenQuestion({ data: { id } }),
    onMutate: (id) => begin((old) => old.filter((q) => q.id !== id)),
    onError: (_err, _vars, context) => rollback(context),
    onSettled: settle,
  })
}

export function useAddOpenQuestionNote() {
  const { begin, rollback, settle } = useOptimisticQuestions()
  return useMutation({
    mutationFn: (data: Parameters<typeof addOpenQuestionNote>[0]['data']) => addOpenQuestionNote({ data }),
    onMutate: (input) =>
      begin(
        patchQuestion(input.questionId, (q) => ({
          ...q,
          notes: [
            {
              // A placeholder, replaced by the server's row on settle.
              id: `temp-${Date.now()}`,
              questionId: q.id,
              content: input.content,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...q.notes,
          ],
        })),
      ),
    onError: (_err, _vars, context) => rollback(context),
    onSettled: settle,
  })
}

export function useUpdateOpenQuestionNote() {
  const { begin, rollback, settle } = useOptimisticQuestions()
  return useMutation({
    mutationFn: (data: Parameters<typeof updateOpenQuestionNote>[0]['data']) => updateOpenQuestionNote({ data }),
    onMutate: (input) =>
      begin((old) =>
        old.map((q) => ({
          ...q,
          notes: q.notes.map((n) => (n.id === input.id ? { ...n, content: input.content } : n)),
        })),
      ),
    onError: (_err, _vars, context) => rollback(context),
    onSettled: settle,
  })
}

export function useDeleteOpenQuestionNote() {
  const { begin, rollback, settle } = useOptimisticQuestions()
  return useMutation({
    mutationFn: (id: string) => deleteOpenQuestionNote({ data: { id } }),
    onMutate: (id) => begin((old) => old.map((q) => ({ ...q, notes: q.notes.filter((n) => n.id !== id) }))),
    onError: (_err, _vars, context) => rollback(context),
    onSettled: settle,
  })
}
