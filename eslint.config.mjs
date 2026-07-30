import next from 'eslint-config-next/core-web-vitals'
import tseslint from 'typescript-eslint'
import i18next from 'eslint-plugin-i18next'
// Direct dependency, not inherited from eslint-config-next. The two rules
// enabled below are load-bearing (see the comment at their definition), and
// eslint-config-next is removed when Next goes — without this import they
// would silently stop running rather than error.
import reactHooks from 'eslint-plugin-react-hooks'

const config = [
  {
    ignores: [
      // Generated from src/routes by the TanStack Router plugin. Not source,
      // not gitignored-by-eslint-default, and it would report unused vars.
      'src/routeTree.gen.ts',
      '.next/**',
      '.output/**',
      '.nitro/**',
      'dist/**',
    ],
  },
  ...next,
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({
    ...c,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  ...tseslint.configs.stylisticTypeChecked.map((c) => ({
    ...c,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      // React Compiler rules — flipped to error after H1 (drop GoalsContext
      // mirror state) eliminated the chronic offender. New regressions block
      // the build instead of decaying into background noise. If a specific
      // call-site is genuinely unfixable, eslint-disable-next-line + a one-
      // line justification is the escape hatch.
      'react-hooks/preserve-manual-memoization': 'error',
      'react-hooks/set-state-in-effect': 'error',
    },
  },
  // Router-agnostic components, rendered by BOTH src/app (Next) and
  // src/routes (TanStack Start) while the two stacks coexist. They cannot
  // import next/link — it would break the Start build — nor TanStack's Link,
  // which would break the Next build. Plain <a> is the only spelling that
  // works in both, so the full page load it causes is deliberate, and these
  // are leaf pages where that costs nothing.
  //
  // Scoped to an explicit file list rather than a directory so a genuine
  // accidental <a> anywhere else still errors. Delete this block in phase
  // 3.6 along with eslint-config-next; the components switch to TanStack's
  // Link at the same time.
  {
    files: [
      'src/components/legal/PrivacyContent.tsx',
      'src/components/legal/TermsContent.tsx',
      'src/components/ScaffoldNotice.tsx',
    ],
    rules: { '@next/next/no-html-link-for-pages': 'off' },
  },
  // i18n enforcement — every user-facing string in UI code must route through
  // `t(...)` or `<Trans>`. Plugin defaults already exclude <Trans>, ALL_CAPS,
  // punctuation/symbol-only strings, emoji, and common DOM attrs (className,
  // type, id, …). Files mid-migration carry `/* eslint-disable
  // i18next/no-literal-string */` at the top; each migration commit removes
  // its file's disable as the strings get extracted.
  {
    files: ['src/components/**/*.tsx', 'src/app/**/*.tsx', 'src/routes/**/*.tsx'],
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
]

export default config
