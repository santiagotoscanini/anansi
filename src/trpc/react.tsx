"use client";

import { loggerLink, httpBatchLink } from "@trpc/client";
import { createTRPCNext } from "@trpc/next";
import SuperJSON from "superjson";
import { type AppRouter } from "../lib/api/root";

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export const api = createTRPCNext<AppRouter>({
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
          headers: () => ({
            "Content-Type": "application/json",
            "x-trpc-source": "next.js-react",
          }),
        }),
      ],
      transformer: SuperJSON,
    };
  },
});
