import next from 'eslint-config-next/core-web-vitals'
import tseslint from 'typescript-eslint'
import i18next from 'eslint-plugin-i18next'

const config = [
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
  // i18n enforcement — every user-facing string in UI code must route through
  // `t(...)` or `<Trans>`. Plugin defaults already exclude <Trans>, ALL_CAPS,
  // punctuation/symbol-only strings, emoji, and common DOM attrs (className,
  // type, id, …). Files mid-migration carry `/* eslint-disable
  // i18next/no-literal-string */` at the top; each migration commit removes
  // its file's disable as the strings get extracted.
  {
    files: ['src/components/**/*.tsx', 'src/app/**/*.tsx'],
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
