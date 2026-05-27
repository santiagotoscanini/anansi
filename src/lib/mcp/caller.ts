import "server-only";
import { createCaller } from "../api/root";

// Bridge between the MCP server and the existing tRPC routers. We avoid a
// network hop (no fetch back to /api/trpc) by building a server-side caller
// directly with a synthetic context that matches what `createTRPCContext`
// would produce for an authenticated request.
//
// `protectedProcedure` reads `ctx.user.userId`; nothing else looks at headers,
// so a minimal Headers object is fine. The tRPC instance threads userId
// through to every route's ownership check.
export function createMcpCaller(userId: string, userName: string) {
  return createCaller({
    headers: new Headers(),
    user: { userId, userName },
  });
}
