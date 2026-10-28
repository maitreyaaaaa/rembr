import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
  },
];
