"use client";

import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import SuperJSON from "superjson";
import { useState } from "react";
import type { ReactNode } from "react";
import { type AppRouter } from "../lib/api/root";

/**
 * Inference helpers for input/output types:
 * - RouterInputs['goals']['create']
 * - RouterOutputs['data']['getAll']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

// App Router-native tRPC binding. The previous `withTRPC` HOC pattern from
// @trpc/next was Pages-Router-style and prevented Server Components from
// hydrating server-rendered tRPC data; createTRPCReact is the supported path.
export const api = createTRPCReact<AppRouter>();

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

// One QueryClient per browser tab. Stored in useState so a fast-refresh
// doesn't reset the cache.
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Keep data fresh enough for daily-use workflows but avoid the
        // every-window-focus refetch that was disabled per-query before.
        staleTime: 30_000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function TRPCProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  // useState(() => ...) so the client is built once per mount, not on every render.
  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          enabled: (op) => {
            // UNAUTHORIZED is the expected response for a signed-out visitor —
            // tRPC's loggerLink calls console.error on errored results, and
            // Next 16's devtools turn every console.error into an overlay
            // entry. Suppress that case so the dev overlay stays clean.
            if (op.direction === "down" && op.result instanceof Error) {
              const code = (op.result as { data?: { code?: string } }).data?.code;
              if (code === "UNAUTHORIZED") return false;
              return true;
            }
            return process.env.NODE_ENV === "development";
          },
        }),
        httpBatchLink({
          url: getBaseUrl() + "/api/trpc",
          transformer: SuperJSON,
          // Cookies are HttpOnly and same-origin — the browser sends them by
          // default, but be explicit for clarity.
          fetch(url, options) {
            return fetch(url, { ...options, credentials: "include" });
          },
          headers: () => ({ "x-trpc-source": "next.js-react" }),
        }),
      ],
    }),
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
