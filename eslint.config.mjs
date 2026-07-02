// Flat ESLint config (ESLint 9). Mirrors maily's root config, adapted for
// vanilla JS: no TypeScript plugin (yet — see docs/ROADMAP.md maily
// convergence), globals set per runtime instead of per workspace.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'docs/**'] },
  js.configs.recommended,
  {
    // ES-module client code running in the browser
    files: ['client/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
    },
  },
  {
    // Classic script running in the service-worker scope
    files: ['public/service-worker.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: globals.serviceworker,
    },
  },
  {
    // CommonJS server + tests on Node
    files: ['server/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
  {
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
