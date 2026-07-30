import "server-only";

/**
 * Everything a tool needs to act on the caller's behalf.
 *
 * This used to be the tRPC caller returned by `createMcpCaller`. Tools now call
 * the service layer directly, so the only thing to thread through is the
 * identity `validateBearer` resolved from the access token — no router, no
 * synthetic request context, no second validation pass.
 */
export type McpCtx = {
  userId: string;
};
