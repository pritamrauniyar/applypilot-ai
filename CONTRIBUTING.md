# Contributing to ApplyPilot AI

Thanks for your interest. This document covers how to run the project, the
conventions it follows, and the rules that exist for safety reasons.

---

## Getting set up

The extension ships as plain classic scripts — there is no build step and no
runtime dependencies. Node is needed only for the test suite and linter.

```bash
git clone https://github.com/pritamrauniyar/applypilot-ai.git
cd applypilot-ai
npm install          # devDependencies only (eslint)
npm run check        # lint + full test suite
```

Load it in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the repository root
4. After editing any file, hit **Reload** on the extension card, then refresh any
   open page so the content script re-injects

---

## Commands

| Command | What it does |
|---|---|
| `npm test` | Full suite (`node --test "test/*.js"`) |
| `npm run test:watch` | Re-run on change |
| `npm run coverage` | V8 coverage report |
| `npm run lint` | ESLint across all runtime targets |
| `npm run lint:fix` | Auto-fix what can be fixed |
| `npm run check` | Lint + test — run this before opening a PR |

> On Windows, always quote the glob: `node --test "test/*.js"`. An unquoted
> `test/` directory argument is not expanded and fails to resolve.

---

## Non-negotiables

These exist because violating them has already caused real bugs. See
[CHANGELOG.md](CHANGELOG.md) for what happened.

### 1. Never put personal data in `DEFAULT_PROFILE`

A fresh install must contain zero personal data. `DEFAULT_PROFILE` carries
structure and matching aliases only — never a pre-filled answer. Demo data
belongs in `SAMPLE_PROFILE`, which only ever loads when the user explicitly asks.
A test enforces this; do not weaken it.

Use reserved example domains (`example.com`) in fixtures. Never a real person's
name, handles, or contact details.

### 2. Never widen what gets captured

`isSensitiveField()` in `content/content.js` is a hard boundary. Anything it
matches must not be read, stored, logged, or sent to the AI. When adding a code
path that touches field values, call it first, and add the new field class to the
denylist and its test if you find a gap.

Any new data collection must be opt-in and off by default.

### 3. All profile writes go through `StorageService`

`chrome.storage.local` has no compare-and-swap, and content scripts run in every
frame. Every compound read-modify-write must be registered in
`SERIALIZED_MUTATORS` in `lib/storage.js`. Do not hand-patch a profile snapshot
and call `saveProfile()` — a concurrent writer will lose its update.

One caveat: a serialized mutator must not call another serialized mutator, or it
will deadlock on the shared chain. `saveWorkExperienceRoleDescription` is
deliberately excluded for this reason.

### 4. Never hardcode a Gemini model id in the request path

Models are discovered from the live ListModels response and ranked. Hardcoding an
id is exactly how 1.0.0 shipped an extension whose AI features returned 404 for
every user. If you need a preference change, adjust `MODEL_PREFERENCE` or
`compareModels()` in `lib/gemini-service.js`.

### 5. No timers for deferred work in the service worker

MV3 workers are evicted after ~30s idle and `setTimeout` dies with them. Use
`chrome.alarms` (minimum 1-minute delay).

### 6. No `alert()`, `confirm()` for flow control, or blocking dialogs in page context

Use `showToast()` in the content script, `showStatus()` in the popup, and
`showSpStatus()` in the side panel. `window.confirm` is acceptable only in
extension pages for destructive, user-initiated actions.

### 7. Escape anything interpolated into HTML

Page-derived and API-derived strings both count as untrusted. Use the local
`escapeHtml()`, or build nodes with the DOM API. Extension pages are a privileged
context.

---

## Code style

- Plain ES2022, classic scripts. No modules, no bundler, no transpiler.
- 2-space indent, semicolons, single quotes in JS.
- Match the surrounding file's conventions over any personal preference.
- Comment the *why*, not the *what* — especially for non-obvious guards. Most
  existing comments explain a bug that the code prevents; keep that pattern.
- Keep runtime dependencies at zero. The extension must stay auditable by reading
  the source.

---

## Testing

Every behavioural change needs a test. The suite uses `node:test` and `node:assert`
with hand-written mocks — no test framework, no jsdom.

- Security-relevant changes (denylist, gating, serialization) need explicit
  regression tests, not just incidental coverage.
- When changing matcher behaviour, use `SAMPLE_PROFILE`, never `DEFAULT_PROFILE`
  (which is blank by design).
- Be aware of what the suite does *not* prove: it is fully self-mocked and does
  not exercise real ATS markup. Verify adapter changes against a live form and
  say so in the PR.

---

## Pull requests

1. Branch from `main`.
2. Run `npm run check` — it must be clean.
3. Describe what you verified manually, especially for adapter or DOM changes.
4. Note any privacy-relevant change explicitly so it can be reflected in
   [PRIVACY.md](PRIVACY.md) and [CHANGELOG.md](CHANGELOG.md).

### Reporting a vulnerability

Please do not open a public issue for a security problem. Contact the maintainer
via <https://pritamrauniyar.com.np/> with details and reproduction steps.

---

## Adding a new ATS adapter

1. Add detection to `detectPortalType()` in `content/ats-adapters.js`.
2. Add field-matching hints to the relevant descriptor logic.
3. Add fixtures to `test/test-ats-adapters.js` and matcher cases to
   `test/test-matcher.js`.
4. Test against a real posting on that platform and report the result in the PR —
   the mocked suite cannot confirm it works.
