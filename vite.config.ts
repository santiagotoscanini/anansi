import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

// Nitro is the deployment adapter — it emits the runnable .output/server bundle
// that start.mjs boots in the container. It is NOT needed for `vite dev`, and
// its extra Vite environment interferes with server-function id resolution in
// dev, surfacing as "Invalid server function ID" at call time (not at startup —
// so it hides until you click the thing). Include it only for `vite build`;
// dev uses TanStack Start's own dev server.
//
// Tailwind is deliberately absent from this plugin list: the repo is still on
// Tailwind v3 via postcss.config.cjs, which Vite picks up natively. The
// @tailwindcss/vite plugin arrives in phase 3.6 together with the v4 upgrade,
// so that `next build` and `vite build` produce the same CSS until the flip.
export default defineConfig(({ command }) => ({
  resolve: { tsconfigPaths: true },
  // Plugin order matters: devtools first, then (build-only) nitro, then
  // tanstackStart → viteReact (Start must run before the React plugin).
  plugins: [devtools(), ...(command === 'build' ? [nitro()] : []), tanstackStart(), viteReact()],
}))
