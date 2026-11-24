// TickTick's Open API, the parts the sync uses. Reference:
// https://developer.ticktick.com/docs (the markdown is at /docs/openapi.md).
//
// Facts the sync leans on, from those docs:
//   - OAuth 2 authorization code only; the client authenticates to the token
//     endpoint with Basic auth; there is no refresh token.
//   - GET /project/{id}/data answers the list's UNDONE tasks only. Completed
//     ones come from POST /task/completed (a time window, at most 200).
//   - A subtask is a task with `parentId`; `items` is a checklist, not subtasks.
//   - Status: -1 won't do, 0 open, 2 completed.
import { env } from '~/lib/env'

const API = 'https://api.ticktick.com/open/v1'
const OAUTH = 'https://ticktick.com/oauth'
export const TICKTICK_SCOPE = 'tasks:read tasks:write'

export interface RemoteTask {
  id: string
  projectId: string
  title?: string
  content?: string | null
  desc?: string | null
  status?: number
  dueDate?: string | null
  startDate?: string | null
  isAllDay?: boolean
  timeZone?: string | null
  parentId?: string | null
  deleted?: number | boolean
  [key: string]: unknown
}

export interface RemoteProject {
  id: string
  name: string
  closed?: boolean
  kind?: string
  permission?: string
}

/** TickTick refused the token: the user has to connect again. */
export class TickTickAuthError extends Error {
  constructor() {
    super('TickTick no longer accepts the saved sign-in. Connect TickTick again.')
  }
}

export class TickTickError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function call<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  opts: { notFoundIsNull?: boolean } = {},
): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
    if (res.status === 401) throw new TickTickAuthError()
    if (res.status === 404 && opts.notFoundIsNull) return null
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      continue
    }
    const text = await res.text()
    if (!res.ok) {
      throw new TickTickError(res.status, `TickTick answered ${res.status} to ${method} ${path}: ${text.slice(0, 200)}`)
    }
    return text ? (JSON.parse(text) as T) : null
  }
}

export function tickTick(token: string) {
  return {
    listProjects: async () => (await call<RemoteProject[]>(token, 'GET', '/project')) ?? [],
    createProject: async (name: string) => {
      const project = await call<RemoteProject>(token, 'POST', '/project', { name, viewMode: 'list', kind: 'TASK' })
      if (!project) throw new TickTickError(500, 'TickTick created no list')
      return project
    },
    /** The list and its undone tasks, or null when the list is gone. */
    projectData: (projectId: string) =>
      call<{ project?: RemoteProject; tasks?: RemoteTask[] }>(
        token,
        'GET',
        `/project/${encodeURIComponent(projectId)}/data`,
        undefined,
        { notFoundIsNull: true },
      ),
    completedBetween: async (projectId: string, start: string, end: string) =>
      (await call<RemoteTask[]>(token, 'POST', '/task/completed', {
        projectIds: [projectId],
        startDate: start,
        endDate: end,
      })) ?? [],
    getTask: (projectId: string, taskId: string) =>
      call<RemoteTask>(
        token,
        'GET',
        `/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`,
        undefined,
        { notFoundIsNull: true },
      ),
    createTask: async (task: Partial<RemoteTask> & { projectId: string; title: string }) => {
      const created = await call<RemoteTask>(token, 'POST', '/task', task)
      if (!created?.id) throw new TickTickError(500, 'TickTick created no task')
      return created
    },
    updateTask: async (task: Partial<RemoteTask> & { id: string; projectId: string }) =>
      call<RemoteTask>(token, 'POST', `/task/${encodeURIComponent(task.id)}`, task),
    completeTask: (projectId: string, taskId: string) =>
      call<unknown>(
        token,
        'POST',
        `/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}/complete`,
        undefined,
        { notFoundIsNull: true },
      ),
    deleteTask: (projectId: string, taskId: string) =>
      call<unknown>(
        token,
        'DELETE',
        `/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`,
        undefined,
        { notFoundIsNull: true },
      ),
  }
}

export type TickTickClient = ReturnType<typeof tickTick>

function clientCredentials(): string {
  if (!env.TICKTICK_CLIENT_ID || !env.TICKTICK_CLIENT_SECRET) throw new Error('TickTick is not configured')
  return Buffer.from(`${env.TICKTICK_CLIENT_ID}:${env.TICKTICK_CLIENT_SECRET}`).toString('base64')
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.TICKTICK_CLIENT_ID ?? '',
    scope: TICKTICK_SCOPE,
    state,
    redirect_uri: redirectUri,
    response_type: 'code',
  })
  return `${OAUTH}/authorize?${params.toString()}`
}

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const res = await fetch(`${OAUTH}/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${clientCredentials()}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      scope: TICKTICK_SCOPE,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const body = (await res.json().catch(() => null)) as { access_token?: string } | null
  if (!res.ok || !body?.access_token)
    throw new TickTickError(res.status, `TickTick refused the sign-in (${res.status})`)
  return body.access_token
}

/** Best effort: a token TickTick already dropped is fine. */
export async function revokeToken(token: string): Promise<void> {
  try {
    const form = new FormData()
    form.set('token', token)
    await fetch('https://api.ticktick.com/oauth/revoke', {
      method: 'POST',
      headers: { authorization: `Basic ${clientCredentials()}` },
      body: form,
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    console.warn('[ticktick] revoke failed', e instanceof Error ? e.message : e)
  }
}
