import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import i18next from 'eslint-plugin-i18next'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  // Never lint generated or build output.
  {
    ignores: ['src/routeTree.gen.ts', '.output/**', '.nitro/**', 'dist/**', 'node_modules/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      // Type-aware linting: let typescript-eslint discover the nearest tsconfig.
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // React Compiler rules. Errors, not warnings, because the chronic
      // offender that used to trip them (GoalsContext's mirror state) is gone —
      // so a new hit is a real regression rather than known background noise.
      // If a specific call site is genuinely unfixable, eslint-disable-next-line
      // plus a one-line justification is the escape hatch.
      'react-hooks/preserve-manual-memoization': 'error',
      'react-hooks/set-state-in-effect': 'error',
      // Reading Date.now() during render is impure and the compiler is right to
      // flag it. Two call sites do it deliberately for an "is this overdue"
      // comparison whose result is never stored; both carry a disable with the
      // reason. Enabled explicitly here because it used to arrive via
      // eslint-config-next — dropping that would have silently retired the rule
      // and left those disables dangling.
      'react-hooks/purity': 'error',

      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],

      // TanStack Router signals a redirect by THROWING a plain object, not an
      // Error — `throw redirect({ to: '/login' })` is the documented API and
      // there is no alternative spelling. Allowing the router's two
      // control-flow types by name keeps the rule's real value (catching
      // `throw 'some string'`) without fighting the framework.
      '@typescript-eslint/only-throw-error': [
        'error',
        {
          allow: [
            { from: 'package', package: '@tanstack/router-core', name: ['Redirect', 'NotFoundError'] },
            { from: 'package', package: '@tanstack/react-router', name: ['Redirect', 'NotFoundError'] },
          ],
        },
      ],
    },
  },

  // The client/server boundary, enforced as a lint rule.
  //
  // `import "server-only"` used to do this. It throws under Vite — its package
  // exports map the `react-server` condition to an empty module and everything
  // else to a bare `throw`, and Vite's SSR pass does not apply that condition —
  // so it had to go. This is the replacement: modules a browser bundle is built
  // from may not reach into server-only code.
  //
  // `allowTypeImports` because a type import is erased at build and carries
  // nothing into the bundle; lib/queries/errors.ts legitimately imports the
  // AppErrorCode union from the service layer.
  {
    files: ['src/components/**', 'src/i18n/**', 'src/lib/queries/**', 'src/lib/mutations/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['~/server/services/**', '~/server/auth/**', '~/server/middleware/**', '~/lib/mcp/**'],
              allowTypeImports: true,
              message:
                'Client-reachable code must not import server internals. Call a server function from ~/server/fn/*.fn.ts instead.',
            },
          ],
        },
      ],
    },
  },

  // Plain JS config + script files aren't in the TS project — turn off the
  // type-checked rules for them to avoid "not found in project" errors. They
  // are Node scripts (start.mjs, scripts/*.mjs), so they get Node globals.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    // Browser globals too: the Playwright scripts pass functions to
    // `page.evaluate()`, whose bodies run in the page, not in Node.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // node:test's describe()/test() return promises the runner itself tracks;
  // awaiting them at the top level is not how the API is used.
  {
    files: ['src/**/*.test.ts'],
    rules: { '@typescript-eslint/no-floating-promises': 'off' },
  },

  // i18n enforcement — every user-facing string in UI code must route through
  // `t(...)` or `<Trans>`. Plugin defaults already exclude <Trans>, ALL_CAPS,
  // punctuation/symbol-only strings, emoji, and common DOM attrs (className,
  // type, id, …). Files that are deliberately English-only carry a
  // `/* eslint-disable i18next/no-literal-string */` header stating why.
  //
  // gpu-rig drops this plugin; this app must not. It is the only thing between
  // 55 useTranslation() call sites and English leaking back in one hardcoded
  // string at a time.
  {
    files: ['src/components/**/*.tsx', 'src/routes/**/*.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-text-only',
          'jsx-attributes': {
            include: ['alt', 'aria-label', 'placeholder', 'title'],
          },
        },
      ],
    },
  },

  // Keep ESLint out of Prettier's lane (must be last).
  prettier,
)
