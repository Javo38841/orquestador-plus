import eslint from '@eslint/js';
import angular from 'angular-eslint';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['dist/', 'release/', '.angular/', 'coverage/', 'playwright-report/', 'test-results/'],
  },
  {
    files: ['**/*.ts', '**/*.mts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ['scripts/**/*.mjs'],
    extends: [eslint.configs.recommended],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  {
    files: ['src/renderer/**/*.ts'],
    extends: [angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      // ADR-003: the renderer only reaches the system through the preload API.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'better-sqlite3', 'node:*', '**/main/**', '**/preload/**'],
              message: 'The renderer must use the preload API (DESKTOP_API), see ADR-003.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },
);
