# ?? ApplyPilot AI — Universal Job Application Autofill & AI Copilot

<div align="center">

[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue.svg?style=for-the-badge&logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Google Gemini API](https://img.shields.io/badge/AI-Google%20Gemini%203%20Flash-4285F4.svg?style=for-the-badge&logo=googlegemini)](https://ai.google.dev/)
[![Tests](https://img.shields.io/badge/Tests-24%2F24%20Passing%20(100%25)-success.svg?style=for-the-badge&logo=checkmarx)]()
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local%20Storage-orange.svg?style=for-the-badge&logo=privacy)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero%20NPM%20Bloat-brightgreen.svg?style=for-the-badge)]()

<p align="center">
  <strong>10x your job application speed across Greenhouse, Lever, Workday, Ashby, and custom portals worldwide.</strong><br>
  Zero data exfiltration. Zero monthly subscriptions. Powered by your free Google Gemini API key.
</p>

[Quick Start](#-quick-start-in-30-seconds) •
[Architecture](#-high-level-architecture) •
[Key Features](#-key-features) •
[Why ApplyPilot?](#-why-applypilot-vs-alternatives) •
[ATS Compatibility](#-supported-applicant-tracking-systems-ats) •
[Test Suite](#-instant-local-testing-environment)

</div>

---

## ?? The Problem ApplyPilot Solves

Job seekers spend **hundreds of hours** filling out the exact same repetitive fields across different Applicant Tracking Systems (ATS). Existing autofill tools suffer from four major flaws:
1. **Expensive Subscriptions**: They charge \–\/month for basic text insertion.
2. **Privacy Risks**: Your resumes, contact details, work history, and demographic data are transmitted to third-party databases.
3. **Broken React/Vue Forms**: Inputs appear filled on-screen, but clear out or fail validation upon clicking "Submit" because framework synthetic events aren't triggered.
4. **US-Only & Role Restrictions**: They break on global portals requesting CTC, notice period in days, multi-currency salary ranges (?, €, \$, £), or right-to-work across different jurisdictions.

**ApplyPilot AI** was built to solve all four: it is **100% free forever**, stores **all data strictly in your browser's local storage**, natively supports **React/Vue/Angular synthetic event dispatching**, and includes a **self-learning question feedback loop** powered by Google's latest **Gemini 3 Flash** models.

---

## ??? High-Level Architecture

`mermaid
graph TD
    User["?? Candidate"] --> UI["??? UI Layer (Popup & Side Panel Companion)"]
    UI --> Storage["?? chrome.storage.local (100% Private, Zero External Servers)"]
    
    WebPage["?? Active Job Application (Greenhouse / Lever / Workday / Ashby)"]
    
    CE["? Content Engine (High-Performance DOM Scanner <50KB)"] <--> WebPage
    CE --> ATS["?? ATS Adapters (Multi-Signal Matcher: id, name, label, autocomplete)"]
    ATS --> Storage
    
    CE --> Setter["? Native Synthetic Event Dispatcher (React/Vue/Angular Compatible)"]
    Setter --> WebPage
    
    CE <--> SW["?? Background Service Worker (Manifest V3 Proxy)"]
    SW <--> Gemini["?? Google Gemini API (gemini-3.6-flash / Free Tier)"]
    
    Gemini --> Memory["?? Self-Learning Memory Feedback Loop"]
    Memory --> Storage
`

---

## ?? Key Features

### ? 1. 1-Click Multi-ATS Autofill
- **Multi-Signal Recognition**: Simultaneously cross-references HTML attributes (utocomplete, id, 
ame, data-automation-id), adjacent <label> tags, parent containers, and placeholder cues.
- **Native Synthetic Event Dispatcher**: Overrides standard DOM setters using Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set followed by synthetic input, change, and lur events. **Guarantees inputs register in React, Vue, and Angular forms without clearing on submit.**

### ?? 2. Self-Learning Memory Feedback Loop
- Encounter an unfamiliar or company-specific question like *"Describe your experience with Kubernetes at scale"*?
- Click **"? AI Assist"**: Gemini analyzes the question and proposes an answer based on your profile.
- Review the floating card: **Approve & Remember** or **Edit**.
- Once approved, ApplyPilot fills the field **and permanently records the question pattern** in your browser's local memory dictionary. The next time that question appears on any job board, it autofills instantly!

### ?? 3. Zero-Overhead Client-Side Resume Ingestion
- Drag & drop your PDF resume directly into the popup.
- Includes a custom **client-side Flate/Deflate decompression and stream text extraction engine** (lib/pdf-extractor.js) with zero npm library bloat.
- Directly feeds extracted plain text to Gemini 3 Flash with structured JSON output, auto-populating your entire profile in seconds.
- Built-in parseAndRepairJson ensures that even if token limits cut off response strings, the JSON tree is dynamically closed and recovered cleanly.

### ? 4. In-Field AI Essay Draft Button
- Automatically injects an elegant **"? AI Draft"** sparkle button into open-ended <textarea> prompts (*"Why our company?"*, *"Describe a technical hurdle you solved"*).
- One click generates a concise, articulate, and tailored response customized to the specific job title and company.

### ?? 5. Global & Multi-Country Presets
- Built for global applicants across India, Europe, UK, US, Canada, Australia, and Remote:
  - **Salary / CTC Expectations**: Supports flexible text & any currency (e.g. ?25 - 35 LPA, $160k - , €85k, or Negotiable).
  - **Notice Period / Availability**: Customizable for days, weeks, or immediate availability (e.g. Immediately available, 15 days, 30 days, 2 months).
  - **Authorized Work Countries**: Explicit multi-country support (India, United States, Canada, Remote / Any).
  - **Country Field Auto-Population**: Matches country selects and inputs across international portals.

### ?? 6. Multi-Step Side Panel Companion
- Docks seamlessly alongside lengthy multi-page application portals (like Workday).
- Displays a real-time checklist of detected, autofilled, and unmapped fields on the current page.
- Includes a **1-Click Quick-Copy Drawer** so you can grab any URL, skill, or snippet instantly.

### ?? 7. 100% Privacy & Zero Data Exfiltration
- **No telemetry, no tracking analytics, no middleman servers.**
- Your profile data never leaves your computer except via direct encrypted HTTPS calls from your browser to Google AI Studio using your own personal API key.

---

## ?? Why ApplyPilot vs. Alternatives?

| Feature | ApplyPilot AI ?? | Simplify / JobFill | Generic Form Fillers |
| :--- | :---: | :---: | :---: |
| **Cost** | **100% Free Forever** | \ – \ / month | Free / Freemium |
| **Privacy & Security** | **100% Local Storage (chrome.storage)** | Stored on third-party servers | Local or cloud sync |
| **AI Question Answering** | **Google Gemini 3 Flash (Free Tier)** | Proprietary / Paywalled | ? None |
| **Self-Learning Memory** | **Yes (Remembers approved answers)** | ? No | ? None |
| **React / Vue Event Support** | **Native Synthetic Setter Simulation** | Partial | ? Often wipes out on submit |
| **Global Currency / CTC Support**| **Yes (INR ? LPA, USD $, EUR €, GBP £)**| ? US-Centric | Partial |
| **Extension Footprint** | **< 50KB DOM footprint, Zero NPM Bloat**| Heavy bundle | Varies |
| **Open Source** | **MIT Licensed** | Proprietary Closed Source | Usually Closed Source |

---

## ?? Supported Applicant Tracking Systems (ATS)

ApplyPilot features dedicated adapters and heuristic detectors tuned for:
- ?? **Greenhouse** (oards.greenhouse.io, embedded Greenhouse iframes)
- ?? **Lever** (jobs.lever.co)
- ?? **Workday** (*.myworkdayjobs.com)
- ?? **Ashby** (jobs.ashbyhq.com)
- ?? **SmartRecruiters** (jobs.smartrecruiters.com)
- ? **Custom & Generic Application Portals** (Career pages on company websites)

---

## ?? Quick Start in 30 Seconds

### Step 1: Clone or Download
`ash
git clone https://github.com/pritamrauniyar/applypilot-ai.git
`

### Step 2: Load Unpacked in Chrome / Edge / Brave
1. Open your browser and navigate to chrome://extensions.
2. Toggle on **"Developer mode"** in the top-right corner.
3. Click **"Load unpacked"** in the top-left.
4. Select the pplypilot-ai folder.
5. Pin the **ApplyPilot AI** icon to your browser toolbar!

### Step 3: Add Your Free Google Gemini Key (1 Minute)
1. Grab a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Click the ApplyPilot extension icon, go to the **?? AI Key** tab, paste the key, and click **"Save Profile"**.
3. Click **"? Test API Connection"** to verify real-time connectivity to gemini-3.6-flash.

---

## ?? Instant Local Testing Environment

You don't need to hunt for live job postings to see ApplyPilot in action. The repository includes an interactive ATS test suite:

1. Open 	est/test-forms.html directly in your browser.
2. You'll see simulated forms for **Greenhouse**, **Lever**, and **Workday** alongside a real-time reactive event logger.
3. Click the floating **"ApplyPilot Fill"** badge or open the extension popup and click **"Autofill Application Now"**.
4. Run the automated unit test suite:
   `ash
   node test/test-matcher.js
   `
   `	ext
   ========================================
   Summary: 24/24 Tests Passed (100%)
   ========================================
   `

---

## ?? Repository Structure

`	ext
applypilot-ai/
+-- manifest.json              # Manifest V3 configuration & permission boundaries
+-- icons/                     # Crisp vector-generated PNG extension icons (16, 48, 128)
+-- popup/
¦   +-- popup.html             # Profile management & quick-fill popup UI
¦   +-- popup.css              # Polished responsive stylesheet
¦   +-- popup.js               # Tab controller, file reader, storage sync
+-- sidepanel/
¦   +-- sidepanel.html         # Multi-step Workday companion drawer
¦   +-- sidepanel.css          # Side panel dark/light accents
¦   +-- sidepanel.js           # Live DOM observer & quick-copy drawer
+-- content/
¦   +-- content.js             # Low-overhead DOM scanner (<50KB) & feedback loop UI
¦   +-- content.css            # Floating hub badge & review modal styling
¦   +-- ats-adapters.js        # Multi-signal matcher with weighted specificity
+-- background/
¦   +-- service-worker.js      # Ephemeral service worker, context menu, Gemini proxy
+-- lib/
¦   +-- storage.js             # Local profile schema & memory dictionary
¦   +-- gemini-service.js      # Direct Gemini 3 Flash REST client & repair engine
¦   +-- pdf-extractor.js       # Client-side Flate decompression & text regex parser
+-- test/
¦   +-- test-forms.html        # Interactive ATS simulation test suite
¦   +-- test-matcher.js        # Automated Node.js unit verification suite (24 tests)
¦   +-- test-pdf.js            # PDF decompression stream unit tests
+-- LICENSE                    # MIT License
+-- README.md                  # Comprehensive documentation & showcase
`

---

## ?? Contributing

Contributions, feature requests, and bug reports are welcome!
1. Fork the Project.
2. Create your Feature Branch (git checkout -b feature/AmazingFeature).
3. Commit your Changes (git commit -m 'Add some AmazingFeature').
4. Push to the Branch (git push origin feature/AmazingFeature).
5. Open a Pull Request.

---

## ?? License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for more information.

<div align="center">
  <sub>Built with ?? for job seekers worldwide. Star ? this repository if it helps your career search!</sub>
</div>
