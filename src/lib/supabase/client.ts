import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Cookies are handled internally by
// `createBrowserClient` via `document.cookie`. Use from React components,
// hooks, and contexts — never from server code (route handlers, server
// components, middleware) — those go through `./server.ts` instead.
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
