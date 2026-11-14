import js from '@eslint/js';
import globals from 'globals';

// Сначала только правила, ловящие настоящие ошибки. Стиль — забота Prettier.
const base = {
  ...js.configs.recommended.rules,
  'no-unused-vars': [
    'warn',
    { vars: 'local', args: 'none', caughtErrors: 'none', ignoreRestSiblings: true },
  ],
  'no-empty': ['warn', { allowEmptyCatch: true }],
  // Модули расширяют поведение, переопределяя функции друг друга (обёртки).
  'no-func-assign': 'off',
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '.build/**',
      'work/**',
      'build/**',
      'app/vendor/**',
      'pwa/public/vendor/**',
    ],
  },

  // Окно плеера: обычные <script>, у всех файлов общая глобальная область,
  // поэтому no-undef выключен — функции из соседних файлов он считал бы ошибками.
  {
    files: ['app/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.browser, module: 'writable' },
    },
    rules: { ...base, 'no-undef': 'off', 'no-redeclare': 'off' },
  },

  // Electron main/preload и Node-модули.
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: base,
  },
  {
    files: ['app/preload.cjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // Скрипты сборки и тестов.
  {
    files: ['**/*.mjs', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: base,
  },

  // SoundSync Pocket: страница, service worker и серверный worker.
  {
    files: ['pwa/public/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, Hls: 'readonly' },
    },
    rules: base,
  },
  {
    files: ['pwa/public/sw.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.serviceworker } },
  },
  {
    files: ['pwa/worker/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.serviceworker, AbortSignal: 'readonly' },
    },
    rules: base,
  },
];
