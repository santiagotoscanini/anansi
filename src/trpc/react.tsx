"use client";

import { loggerLink, httpBatchLink } from "@trpc/client";
import { createTRPCNext } from "@trpc/next";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import SuperJSON from "superjson";
import { type AppRouter } from "../lib/api/root";

/**
 * Inference helpers for input/output types:
 * - RouterInputs\<'goals'\>['goals']['create']
 * - RouterOutputs\<'goals'\>['data']['getAll']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export const api = createTRPCNext<AppRouter>({
  transformer: SuperJSON,
  config() {
    return {
      links: [
        // https://trpc.io/docs/client/links/loggerLink
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" || (op.direction === "down" && op.result instanceof Error),
        }),
        // https://trpc.io/docs/client/links/httpBatchLink
        httpBatchLink({
          url: getBaseUrl() + "/api/trpc",
          transformer: SuperJSON,
          headers: () => ({
            "Content-Type": "application/json",
            "x-trpc-source": "next.js-react",
          }),
        }),
      ],
    };
  },
});
