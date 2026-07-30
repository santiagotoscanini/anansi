import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { auth } from "~/lib/auth";
import { isAppError } from "~/server/services/errors";

/**
 * 1. Context
 *
 * Auth identity is owned by Auth.js — we resolve the current session via the
 * `auth()` server helper, which decodes the JWT session cookie. The only thing
 * routers read off the context is `ctx.user.userId`.
 *
 * There used to be a `userName` field here, populated by a `SELECT name FROM
 * users` on every single request. Nothing ever read it — procedures that need
 * the profile (e.g. `auth.me`) query it themselves — so it was one wasted
 * round-trip per request. Removed.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();

  return { ...opts, user: { userId: session?.user?.id } };
};

/**
 * 2. Initialization
 *
 * We parse ZodErrors to get typesafety on the frontend if the procedure fails due to validation errors on the backend.
 */
const trpcBuilder = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = trpcBuilder.createCallerFactory;

/**
 * 3. Router & Procedure
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = trpcBuilder.router;

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = trpcBuilder.procedure;

/**
 * Translate a service-layer AppError into the TRPCError the clients already
 * expect. AppError's code set is a subset of TRPCError's by construction, so
 * this is lossless — the wire shape and every client's error handling are
 * unchanged.
 *
 * This exists because the business logic is moving into `src/server/services/`,
 * which must not depend on tRPC (the MCP tools and, after the migration, the
 * TanStack Start server functions call the same functions). tRPC becomes a thin
 * transport over those services, and this middleware is the seam.
 */
const translateAppErrors = trpcBuilder.middleware(async ({ next }) => {
  // NOTE: `next()` does not throw. tRPC catches downstream errors internally and
  // returns `{ ok: false, error }`, having already run the thrown value through
  // `getTRPCErrorFromUnknown` — which downgrades anything that isn't a TRPCError
  // to INTERNAL_SERVER_ERROR and stashes the original on `.cause`. So a
  // try/catch around `next()` silently never fires, and every AppError would
  // surface as a 500. Inspect the result instead.
  const result = await next();
  if (!result.ok && isAppError(result.error.cause)) {
    const appError = result.error.cause;
    throw new TRPCError({ code: appError.code, message: appError.message, cause: appError });
  }
  return result;
});

/**
 * Protected (authenticated) procedure
 *
 * This is a procedure that requires a user to be authenticated.
 */
export const protectedProcedure = trpcBuilder.procedure
  .use(translateAppErrors)
  .use(
    trpcBuilder.middleware(({ ctx, next }) => {
      if (!ctx.user.userId) {
        // Surface a real 401 to the client so React Query can distinguish
        // "session ended, redirect to login" from "server error".
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      return next({
        ctx: {
          ...ctx,
          user: ctx.user as { userId: string },
        },
      });
    }),
  );
