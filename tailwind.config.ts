import { type Config } from 'tailwindcss'

export default {
  mode: 'jit',
  // `src/routes` is the TanStack Start route tree, which coexists with
  // `src/app` until phase 3.6. It has to be listed here for the same reason
  // the v4 config will need an `@source` directive for it: Tailwind only
  // emits utilities it finds by scanning these globs, and a class used
  // exclusively in an unscanned directory silently produces no CSS — the
  // page still builds and still renders, just unstyled.
  content: [
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/routes/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'media',
} satisfies Config
