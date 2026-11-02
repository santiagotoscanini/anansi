import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { toolInput } from './fields'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import * as authService from '~/server/services/auth'

// What a tool may say about the account. `me` also carries the invite code.
const profile = (me: Awaited<ReturnType<typeof authService.me>>) => ({
  id: me.id,
  name: me.name,
  email: me.email,
  avatarUrl: me.avatarUrl,
  locale: me.locale,
})

// The account, and `whoami`, the smoke-test: if a tool call
// reaches here and returns the right name, the bearer → token → service chain
// is healthy end-to-end. Keep it cheap; intended for connectivity checks.
export function registerSystemTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'whoami',
    {
      title: 'Who am I?',
      description:
        'Return the Anansi profile of the user whose token is being used. Useful for verifying the MCP connection works.',
      inputSchema: toolInput({}),
    },
    async () => {
      try {
        const me = await authService.me(ctx.userId)
        return mcpJsonResult({ id: me.id, name: me.name, email: me.email })
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_profile',
    {
      title: 'Update your profile',
      description:
        'Change your display name or the language of the app. Your email and password are changed in the app itself.',
      inputSchema: toolInput({
        name: z.string().min(1).max(100).optional(),
        locale: z.enum(['en', 'es']).optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ name, locale }) => {
      try {
        if (name !== undefined) await authService.updateProfile(ctx.userId, { name })
        if (locale !== undefined) await authService.setLocale(ctx.userId, locale)
        return mcpJsonResult(profile(await authService.me(ctx.userId)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'set_avatar',
    {
      title: 'Set your avatar',
      description: 'Use an image as your avatar, replacing the current one. `data` is base64.',
      inputSchema: toolInput({
        fileName: z.string().min(1).max(255),
        data: z.string().min(1).describe('The image, base64.'),
      }),
      annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        await authService.uploadAvatar(ctx.userId, args)
        return mcpJsonResult(profile(await authService.me(ctx.userId)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'remove_avatar',
    {
      title: 'Remove your avatar',
      description: 'Delete your avatar image.',
      inputSchema: toolInput({}),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        await authService.removeAvatar(ctx.userId)
        return mcpJsonResult(profile(await authService.me(ctx.userId)))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
