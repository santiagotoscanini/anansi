import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// Nitro is the deployment adapter — it emits the runnable .output/server bundle
// that start.mjs boots in the container. It is NOT needed for `vite dev`, and
// its extra Vite environment interferes with server-function id resolution in
// dev, surfacing as "Invalid server function ID" at call time (not at startup —
// so it hides until you click the thing). Include it only for `vite build`;
// dev uses TanStack Start's own dev server.
//
// Tailwind is a Vite plugin now — v4 has no PostCSS step, so there is no
// postcss.config.cjs and no autoprefixer (v4 handles vendor prefixing itself
// via lightningcss). The scanned directories are declared by @source in
// src/styles/globals.css, not here.
export default defineConfig(({ command }) => ({
  resolve: { tsconfigPaths: true },
  // Plugin order matters: devtools first, then (build-only) nitro, then
  // tailwind → tanstackStart → viteReact (Start must run before the React plugin).
  plugins: [devtools(), ...(command === 'build' ? [nitro()] : []), tailwindcss(), tanstackStart(), viteReact()],
}))
