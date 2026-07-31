import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
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
  plugins: [
    devtools(),
    ...(command === 'build' ? [nitro()] : []),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    // React Compiler. eslint.config.mjs has enforced its rules
    // (`preserve-manual-memoization`, `set-state-in-effect`, `purity`) as ERRORS
    // since the migration, but the compiler itself was never installed — so the
    // codebase was paying the full constraint cost and getting none of the
    // auto-memoization. This turns it on.
    //
    // It is a SEPARATE plugin, not an option on viteReact. @vitejs/plugin-react
    // v6 moved its transform to oxc and dropped the `babel` option entirely, so
    // the v4-era `viteReact({ babel: { plugins: [...] } })` spelling is now
    // silently ignored — no error, no warning, and a build that looks fine while
    // compiling nothing. Verified by grepping the SSR chunks for
    // `react/compiler-runtime`, which is the only way to tell the difference.
    //
    // No `react-compiler-runtime` package needed: the runtime ships inside
    // React 19, which is also why `target` can be left at its default.
    //
    // This applies to the client build only, which is where the value is —
    // memoization pays off across re-renders and SSR renders each component
    // once. Compiled and uncompiled components interoperate freely, so a mixed
    // build is not a half-configured state.
    babel({ presets: [reactCompilerPreset()] }),
  ],
}))
