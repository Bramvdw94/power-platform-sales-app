import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // shadcn/ui components export their variant helpers next to the component.
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Only the Dataverse sales data gateway may talk to Dataverse: pages, hooks
    // and the sales rules go through the SalesGateway interface instead.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/data/dataverse/**', 'src/generated/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/generated/**', '@/generated', '@/generated/**'],
            message: 'Generated Dataverse services are only used inside src/data/dataverse. Use the SalesGateway instead.',
          },
          {
            group: ['@microsoft/power-apps/data', '@microsoft/power-apps/data/**'],
            message: 'Dataverse data access lives in src/data/dataverse. Use the SalesGateway instead.',
          },
        ],
      }],
    },
  },
])
