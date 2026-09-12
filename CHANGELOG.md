# Changelog

All notable changes to ApplyPilot AI are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] — 2026-09-12

Production-readiness release. Addresses a full audit of the 1.0.0 codebase.

### Security & Privacy

- **A fresh install now ships a completely blank profile.** 1.0.0 shipped a
  hardcoded identity (name, email, phone, street address, employer, degree,
  social links) as `DEFAULT_PROFILE` and persisted it on install, so clicking
  Autofill before editing the profile would write another person's details into a
  live application. The demo data moved to an opt-in `SAMPLE_PROFILE` fixture
  behind Settings → "Load sample profile", and autofill stays inert until
  onboarding completes.
- **Added a sensitive-field denylist.** Values from password, payment-card,
  bank/routing/IBAN, government-identifier (SSN, NI, Aadhaar, PAN, tax ID,
  passport, licence), date-of-birth, salary-history and security-question fields
  are never read, stored, logged, or sent to the AI. Detection covers input type,
  `autocomplete` token, and label text.
- **Learning from typed values is now opt-in and off by default**
  (Settings → Privacy → "Learn from what I type"). 1.0.0 captured and persisted
  every field value on any page it classified as a job application — a
  classification that matched any URL path containing `/apply`, `/application` or
  `/jobs`, including banking, loan and visa forms.
- **Activity-log values are masked by default.** The `maskValue` flag existed in
  1.0.0 but no caller ever set it, so raw field values were stored in plaintext.
  Opt in via Settings → Privacy → "Record field values in the activity log".
- **The AI knowledge compiler can be disabled** (Settings → Privacy), keeping all
  learning on-device.
- **Added [PRIVACY.md](PRIVACY.md)** documenting exactly what is stored and what
  is transmitted, and corrected the README, which claimed "zero data
  exfiltration" while the compiler was sending saved answers and corrections to
  Google's API.
- The Gemini API key now travels in the `x-goog-api-key` header instead of a URL
  query parameter, keeping it out of logs and referrers.
- Escaped remote- and page-derived strings interpolated into the popup
  (`res.message`, `res.selectedModel`, ignored-field `data-id`).

### Fixed

- **Gemini model resolution was fundamentally broken.** 1.0.0 targeted
  `gemini-3.6-flash` / `3.5-flash` / `3.7-flash` — ids that do not exist — and
  actively filtered every real model out of the ListModels response by excluding
  anything matching `2.5`, `2.0` or `1.5`. Every AI call 404'd with no recovery
  path. Models are now discovered live and ranked (flash-lite → flash → pro,
  newest version first, stable over preview); no model id is hardcoded in the
  request path. Retired ids stored in a profile are migrated to auto-detect.
- **The background sync queue was silently dropped.** It was scheduled with a 25s
  `setTimeout`, but MV3 service workers are evicted after ~30s idle and the timer
  died with them. Now uses `chrome.alarms`.
- **`chrome.notifications` was called without the permission**, throwing a
  `TypeError` that was swallowed — the "no API key" path gave the user no
  feedback at all. Now surfaces an in-page toast, falling back to
  `chrome.notifications` (permission added) when no content script is reachable.
- **Fixed a lost-update race that reverted the work it had just done.**
  `processBackgroundSyncQueue` read the profile, ran mutations that each
  re-read and re-saved it, then wrote back its own stale snapshot.
- **Serialized all profile writes.** Every `StorageService` mutator was an
  unguarded read-modify-write against one storage key, and content scripts run in
  all frames — concurrent writes routinely clobbered each other. Mutations now
  run through a single promise chain. Regression test: 25 concurrent writes, 25
  survivors (previously ~1).
- **`getProfile()` returned `DEFAULT_PROFILE` by reference** on first run;
  callers mutated the module-level defaults. All reads are now deep-cloned.
- **"Capture & Learn Page Fields" destroyed career history.** It replaced
  `experience.items` and `education.items` wholesale with whatever was scraped
  from the page. It now merges per slot: non-empty scraped values win, empty ones
  leave stored values alone, and rows the page did not show are preserved.
- **A single shared debounce timer dropped data** — tabbing between two fields
  inside 600ms cancelled the first field's save. Timers are now per-element.
- **Audit logging caused O(n) storage churn.** Each entry rewrote the entire
  1000-entry array; a 40-field autofill meant 40 full read-modify-write cycles
  with concurrent writers dropping entries. Entries are now batched into a single
  write (regression test asserts exactly one write for a 40-entry burst).
- `chrome.sidePanel.open()` called from a content-script message always failed
  (a page gesture does not carry into the worker). It now fails gracefully with
  an actionable message instead of hanging the port.
- Message listeners no longer leave the channel open without responding.
- Replaced all 14 blocking `alert()` dialogs with inline, non-blocking status
  messaging.

### Improved

- **PDF extraction now handles the formats real resumes use.** Added PNG
  predictor reversal (`/DecodeParms /Predictor >= 10`) and `/ToUnicode` CMap
  decoding (bfchar and bfrange), so subset-embedded fonts from Word, Canva and
  LaTeX decode to real text instead of glyph indices. Text cleaning no longer
  strips non-ASCII, preserving accented names and non-Latin scripts.
- Model discovery is lazy: the common request path costs one network call, not
  two. ListModels is consulted only when no model is known or every candidate
  404s.
- Discovery failures now surface the actual cause (invalid key / permission /
  quota) instead of a generic message.
- Reduced per-page cost: the `MutationObserver` is rate-limited to one page
  evaluation per second, ignores attribute and character-data mutations, and the
  content script exits early in frames too small to hold an application form.

### Changed

- Dropped the unused `scripting` permission; added `alarms` and `notifications`.
- Narrowed `host_permissions` to `generativelanguage.googleapis.com`; `<all_urls>`
  is now an optional host permission.
- Added an explicit `content_security_policy` and `minimum_chrome_version: 116`.
- Added `package.json` (`npm test`, `npm run coverage`, `npm run lint`,
  `npm run check`) and a flat ESLint config. The README's documented test command
  did not work on Windows.
- README badges corrected: tests were reported as 54/54 (actual: 57), and the
  coverage figure averaged in the test files themselves. Added a "Known Testing
  Limitations" section.

### Testing

- 62 → 73 tests, all passing. Overall line coverage 95.98%, function coverage
  94.12%.
- New coverage for the sensitive-field denylist, opt-in gating, the
  onboarding gate, capture merge semantics, audit-log batching and masking,
  write serialization, blank-default integrity, model ranking, and the new PDF
  predictor/CMap decoders.

---

## [1.0.0] — 2026-09-10

Initial release: MV3 autofill engine, ATS adapters, dynamic knowledge store,
Gemini-backed resume parsing and answer drafting, audit logging, popup and side
panel UI.
