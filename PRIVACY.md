# Privacy Policy — ApplyPilot AI

**Last updated:** 2026-09-12
**Applies to:** ApplyPilot AI browser extension, version 1.1.0 and later

ApplyPilot AI is a local-first tool. There is no ApplyPilot server, no account, and
no analytics. This document describes exactly what the extension stores, what
leaves your browser, and how to control or delete it.

---

## 1. What is stored, and where

All extension data lives in `chrome.storage.local`, inside your own browser
profile. Nothing is written to an ApplyPilot-operated server, because none exists.

| Data | Contains | Purpose |
|---|---|---|
| Profile | Name, contact details, links, work and education history, application presets | Filling application forms |
| Dynamic knowledge store | Question labels, aliases, and your saved answers | Matching unfamiliar questions to answers you have given before |
| Learned memory | Answers you approved for previously unrecognised questions | Reusing answers on later applications |
| Activity log | Timestamp, domain, field label, and outcome for each action (values masked by default) | Letting you audit what the extension did |
| Settings | Your Gemini API key, model choice, and privacy toggles | Configuration |

The activity log is capped at 1,000 entries and learned memory at 200 entries;
older entries are discarded automatically.

### Your Gemini API key

Your key is stored in `chrome.storage.local` in plain text, like any other
setting. Anyone with access to your operating-system user account, or to another
extension granted broad storage permissions, could read it. Treat it as you would
any credential kept in a browser profile, and revoke it in
[Google AI Studio](https://aistudio.google.com/app/apikey) if you suspect exposure.

---

## 2. What leaves your browser

**ApplyPilot sends data to exactly one destination: Google's Generative Language
API (`generativelanguage.googleapis.com`), authenticated with your own API key.**
There is no intermediary server. If you never configure a key, the extension makes
no network requests at all and every AI feature is simply unavailable.

Data is sent to Google only when one of these runs:

| Feature | What is sent |
|---|---|
| Resume parsing | The resume text or image you supplied |
| AI Draft / AI answer | The question, plus profile context: name, role, employer, education, location, work authorisation, notice period and salary expectations |
| Field suggestion | The field label, its options, the page title, and the profile fields listed above |
| Background knowledge compiler | Your dynamic knowledge store, past employer names, and the corrections you made to filled values |
| Test API Connection | Only your API key, to list available models |

Google's handling of this data is governed by the
[Gemini API Terms of Service](https://ai.google.dev/gemini-api/terms) and the
[Google Privacy Policy](https://policies.google.com/privacy). Note that on the
**free tier, Google may use submitted content to improve its products**; paid
tiers carry different commitments. Review those terms before sending real
personal data.

You can disable the background knowledge compiler entirely with
**Settings → Privacy → "Send corrections to Gemini to improve matching"**. With it
off, all learning stays on-device.

---

## 3. What is never collected

The extension refuses to read, store, log or transmit values from fields it
identifies as sensitive, regardless of any setting:

- Passwords and one-time codes
- Payment card details (number, CVV/CVC, expiry)
- Bank account, routing, IBAN, SWIFT and sort-code fields
- Government identifiers: SSN, SIN, National Insurance, Aadhaar, PAN, tax IDs, passport, driver's licence
- Date of birth
- Salary history and current salary
- Security questions and mother's maiden name

Detection is based on field type, `autocomplete` attribute, and label text. It is
a strong safeguard, not a guarantee against every possible unlabelled field — so
review a form before using autofill on it.

---

## 4. Permissions, and why each is needed

| Permission | Why |
|---|---|
| `storage` | Save your profile and settings locally |
| `activeTab` | Act on the tab you are currently looking at when you click the extension |
| `alarms` | Schedule the background knowledge compiler (MV3 service workers cannot hold timers) |
| `notifications` | Show a message when no page is available to display one |
| `sidePanel` | Open the companion side panel |
| `contextMenus` | Provide the right-click actions |
| Host access to `generativelanguage.googleapis.com` | Call the Gemini API with your key |
| Content script on `<all_urls>` | Job applications are hosted on thousands of domains and company career subdomains; the script self-limits at runtime to pages that look like application forms |

The extension requests **no** host permission for reading or sending data to any
site other than Google's API endpoint.

---

## 5. Your controls

- **Settings → Privacy → "Learn from what I type"** — off by default. When off, the extension does not record values you type.
- **Settings → Privacy → "Record field values in the activity log"** — off by default. When off, the log shows which field was filled but masks the value.
- **Settings → Privacy → "Send corrections to Gemini"** — turn off to keep all learning on-device.
- **Settings → Your Data → "Erase all my data"** — deletes your profile, learned answers and activity log from this browser. This is immediate and irreversible.
- **Activity tab → Export** — download everything the extension has recorded as JSON or CSV.
- Removing the extension from Chrome deletes all of its local storage.

---

## 6. Children

ApplyPilot AI is intended for job seekers and is not directed at children under 13.

## 7. Changes

Material changes to this policy will be noted in [CHANGELOG.md](CHANGELOG.md) and
reflected in the "Last updated" date above.

## 8. Contact

Questions or reports: open an issue at
<https://github.com/pritamrauniyar/applypilot-ai/issues>.
