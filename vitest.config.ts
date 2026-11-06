import { defineConfig } from 'vitest/config'

// vitest runs ONE file here: src/server/object-store.test.ts, the fleet's
// canonical contract test for the S3 module, written for vitest and copied
// verbatim from daedalus. Every test of anansi's own runs under node's runner
// (through tsx), the first half of `pnpm test`, which leaves this file out by
// name.
//
// Separate from vite.config.ts on purpose: the app config loads TanStack
// Start, Tailwind and the React Compiler, none of which a unit test wants.
export default defineConfig({
  test: {
    include: ['src/server/object-store.test.ts'],
    environment: 'node',
  },
})
