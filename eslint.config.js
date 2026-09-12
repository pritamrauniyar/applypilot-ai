// Flat ESLint config. The extension ships as plain classic scripts (no bundler),
// so each directory gets the globals that its runtime actually provides.
const globals = require('globals');

const sharedRules = {
  'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
  'no-undef': 'error',
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-console': 'off',
  eqeqeq: ['warn', 'smart'],
  'prefer-const': 'warn',
  'no-var': 'error'
};

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**']
  },

  // Service worker: importScripts pulls lib/* into one shared global scope.
  {
    files: ['background/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.serviceworker,
        chrome: 'readonly',
        module: 'writable',
        importScripts: 'readonly',
        StorageService: 'readonly',
        GeminiService: 'readonly',
        AuditLogger: 'readonly',
        PdfExtractor: 'readonly'
      }
    },
    rules: sharedRules
  },

  // Content scripts run in the page, alongside ats-adapters.js.
  {
    files: ['content/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        chrome: 'readonly',
        module: 'writable',
        AtsAdapters: 'writable',
        ComplexUIAdapters: 'readonly',
        // Provided by lib/storage.js where it is loaded (extension pages, tests).
        // Content scripts do not load storage.js, so both call sites are
        // typeof-guarded and fall back to the local matcher.
        is90PercentMatch: 'readonly'
      }
    },
    rules: {
      ...sharedRules,
      // `var AtsAdapters` is deliberate: it attaches to the isolated world's
      // global object so content.js can reach it. const/let would not.
      'no-var': 'off'
    }
  },

  // Shared libs load in both the worker and extension pages.
  {
    files: ['lib/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        chrome: 'readonly',
        module: 'writable'
      }
    },
    rules: sharedRules
  },

  // Extension pages (popup, side panel).
  {
    files: ['popup/**/*.js', 'sidepanel/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        chrome: 'readonly',
        StorageService: 'readonly',
        GeminiService: 'readonly',
        AuditLogger: 'readonly',
        PdfExtractor: 'readonly'
      }
    },
    rules: sharedRules
  },

  // Node test suite. The suites install their own `document`, `window`, `chrome`
  // and `fetch` stubs onto globalThis, so browser globals are legitimate here.
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.browser,
        chrome: 'writable',
        // Exported by lib/storage.js onto globalThis for the content script.
        is90PercentMatch: 'readonly',
        isNinetyPercentMatch: 'readonly',
        calculateStringSimilarity: 'readonly'
      }
    },
    rules: {
      ...sharedRules,
      'no-unused-vars': ['warn', { args: 'none' }],
      // Test fixtures intentionally use `var` in a few places for hoisting.
      'no-var': 'warn'
    }
  },

  // This config file itself.
  {
    files: ['eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: sharedRules
  }
];
