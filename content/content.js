// ApplyPilot AI - In-Page Content Engine
// High Performance, Low Memory (<50KB DOM footprint), Self-Learning Feedback Loop

(function() {
  'use strict';

  // Prevent multiple injections
  if (typeof window !== 'undefined') {
    if (window.__applypilot_injected && typeof module === 'undefined') return;
    window.__applypilot_injected = true;
  }

  let cachedProfile = null;
  let floatingHubEl = null;

  // Helper to reliably access AtsAdapters across extension contexts
  function getAtsAdapters() {
    if (typeof window !== 'undefined' && window.AtsAdapters) return window.AtsAdapters;
    if (typeof globalThis !== 'undefined' && globalThis.AtsAdapters) return globalThis.AtsAdapters;
    if (typeof AtsAdapters !== 'undefined') return AtsAdapters;
    return null;
  }

  // Extension Context Validation Guard
  function isExtensionValid() {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  }

  // Safe Message Passing Guard against "Extension context invalidated"
  function safeSendMessage(message, callback) {
    if (!isExtensionValid()) {
      console.warn("[ApplyPilot] Extension context invalidated (reloaded). Please refresh this page to reconnect.");
      if (callback) callback({ error: "Extension context invalidated" });
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (res) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr && lastErr.message && (lastErr.message.includes("context invalidated") || lastErr.message.includes("Receiving end"))) {
          console.warn("[ApplyPilot] Message dispatch notice:", lastErr.message);
        }
        if (callback) {
          callback(res || (lastErr ? { error: lastErr.message } : null));
        }
      });
    } catch (err) {
      console.warn("[ApplyPilot] safeSendMessage caught:", err.message);
      if (callback) callback({ error: err.message });
    }
  }

  // Audit Logger Telemetry Helper
  function logAuditAction(entry) {
    try {
      const host = window.location.hostname || "";
      let portalType = "generic";
      if (host.includes("myworkdayjobs.com") || host.includes("workday")) portalType = "workday";
      else if (host.includes("greenhouse.io")) portalType = "greenhouse";
      else if (host.includes("lever.co")) portalType = "lever";
      else if (host.includes("ashbyhq.com")) portalType = "ashby";
      else if (host.includes("oracle") || host.includes("taleo") || host.includes("americanexpress")) portalType = "enterprise";

      safeSendMessage({
        action: "LOG_AUDIT_ENTRY",
        logData: {
          url: window.location.href,
          domain: host,
          portalType,
          ...entry
        }
      });
    } catch (e) {}
  }

  // 1. Fetch user profile from background storage or direct local storage
  async function loadProfile() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local && isExtensionValid()) {
      try {
        const data = await chrome.storage.local.get(['applypilot_profile']);
        if (data?.applypilot_profile) {
          cachedProfile = data.applypilot_profile;
          return cachedProfile;
        }
      } catch (e) {}
    }

    return new Promise((resolve) => {
      safeSendMessage({ action: "GET_PROFILE" }, (response) => {
        if (response?.profile) {
          cachedProfile = response.profile;
        }
        resolve(cachedProfile);
      });
    });
  }

  // 2. React / Vue / Modern Reactive Framework Value Setter
  // Guarded against DOMException, InvalidStateError, and read-only inputs
  function setNativeValue(element, value) {
    if (!element || value === undefined || value === null) return;
    if (element.disabled || element.readOnly) return;
    if (element.type === 'file') return; // File inputs can only be set to empty string programmatically

    const valStr = String(value).trim();

    if (element.tagName === 'SELECT') {
      const targetStr = valStr.toLowerCase();
      let matchedIdx = -1;

      if (element.options) {
        for (let i = 0; i < element.options.length; i++) {
          const opt = element.options[i];
          const optText = (opt.text || "").toLowerCase().trim();
          const optVal = (opt.value || "").toLowerCase().trim();

          if (optText === targetStr || optVal === targetStr || optText.includes(targetStr) || (targetStr.length > 3 && targetStr.includes(optText))) {
            matchedIdx = i;
            break;
          }
        }
      }

      if (matchedIdx !== -1) {
        try {
          element.selectedIndex = matchedIdx;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          element.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e) {
          console.warn("[ApplyPilot] Select dispatch notice:", e.message);
        }
      }
      return;
    }

    if (element.type === 'checkbox') {
      const shouldCheck = typeof value === 'boolean' ? value : ['yes', 'true', '1'].includes(valStr.toLowerCase());
      try {
        element.checked = shouldCheck;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('click', { bubbles: true }));
      } catch (e) {
        console.warn("[ApplyPilot] Checkbox dispatch notice:", e.message);
      }
      return;
    }

    if (element.type === 'radio') {
      try {
        element.checked = true;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('click', { bubbles: true }));
      } catch (e) {
        console.warn("[ApplyPilot] Radio dispatch notice:", e.message);
      }
      return;
    }

    if (element.isContentEditable || (element.getAttribute && element.getAttribute('contenteditable') === 'true')) {
      const adapters = getAtsAdapters();
      if (adapters?.ComplexUIAdapters) {
        adapters.ComplexUIAdapters.fillContentEditable(element, valStr);
        element.classList.add('ap-filled-highlight');
        setTimeout(() => {
          try { element.classList.remove('ap-filled-highlight'); } catch (e) {}
        }, 2000);
        return;
      }
    }

    // Handle Date & Month input types gracefully to prevent InvalidStateError / DOMException
    let formattedVal = valStr;

    if (element.type === 'date') {
      // If candidate role is ongoing ("Present" / "Current"), check any adjacent "Currently work here" checkbox
      if (valStr.toLowerCase().includes('present') || valStr.toLowerCase().includes('current')) {
        const container = element.closest('form, fieldset, section, div[data-automation-id*="experience"], div[class*="experience"], div');
        if (container) {
          const currentBox = container.querySelector('input[type="checkbox"][id*="current" i], input[type="checkbox"][name*="current" i], input[type="checkbox"][data-automation-id*="current" i]');
          if (currentBox && !currentBox.checked) {
            try {
              currentBox.checked = true;
              currentBox.dispatchEvent(new Event('change', { bubbles: true }));
              currentBox.dispatchEvent(new Event('click', { bubbles: true }));
            } catch (e) {}
          }
        }
        return; // Skip setting literal text "Present" into HTML5 <input type="date">
      }

      // Format to valid ISO date: YYYY-MM-DD
      if (/^\d{4}-\d{2}$/.test(valStr)) {
        formattedVal = `${valStr}-01`;
      } else if (/^\d{2}\/\d{4}$/.test(valStr)) {
        const parts = valStr.split('/');
        formattedVal = `${parts[1]}-${parts[0].padStart(2, '0')}-01`;
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(valStr)) {
        const parsed = new Date(valStr);
        if (!isNaN(parsed.getTime())) {
          formattedVal = parsed.toISOString().split('T')[0];
        } else {
          return; // Skip invalid date strings safely without throwing DOMException
        }
      }
    } else if (element.type === 'month') {
      if (valStr.toLowerCase().includes('present') || valStr.toLowerCase().includes('current')) {
        return;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(valStr)) {
        formattedVal = valStr.substring(0, 7);
      } else if (/^\d{4}-\d{2}$/.test(valStr)) {
        formattedVal = valStr;
      } else {
        const parsed = new Date(valStr);
        if (!isNaN(parsed.getTime())) {
          formattedVal = parsed.toISOString().substring(0, 7);
        } else {
          return;
        }
      }
    } else if (element.type === 'number') {
      const numMatch = valStr.match(/[-+]?[0-9]*\.?[0-9]+/);
      if (numMatch) {
        formattedVal = numMatch[0];
      } else {
        return;
      }
    }

    // Focus first to activate framework listener
    try {
      element.dispatchEvent(new Event('focus', { bubbles: true }));
    } catch (e) {}

    // Standard text, textarea, email, tel, url
    try {
      const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
      const prototype = Object.getPrototypeOf(element);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

      if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(element, formattedVal);
      } else if (valueSetter) {
        valueSetter.call(element, formattedVal);
      } else {
        element.value = formattedVal;
      }
    } catch (err) {
      try {
        element.value = formattedVal;
      } catch (fallbackErr) {
        console.warn("[ApplyPilot] DOMException setting field value:", fallbackErr.name, fallbackErr.message);
        throw fallbackErr;
      }
    }

    try {
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    } catch (e) {
      console.warn("[ApplyPilot] Event dispatch notice:", e.message);
    }

    // Add gentle visual highlight
    element.classList.add('ap-filled-highlight');
    setTimeout(() => {
      try {
        element.classList.remove('ap-filled-highlight');
      } catch (e) {}
    }, 2000);
  }

  // 3. Scan DOM Form Fields
  function scanFormFields() {
    const candidates = Array.from(document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]), select, textarea, button[aria-haspopup="listbox"], [role="combobox"], [role="radiogroup"], [role="switch"], [role="checkbox"]:not(input), [contenteditable="true"], .ProseMirror, .ql-editor, trix-editor'
    ));
    const matched = [];
    const unmatched = [];
    const allDescriptors = [];
    const allMatchResults = [];
    const adapters = getAtsAdapters();

    if (!cachedProfile || !adapters) {
      return { matched, unmatched, total: candidates.length, metrics: null };
    }

    // Track sequential occurrences for experience and education fields
    const occurrenceCounts = {};

    for (const el of candidates) {
      if (el.closest && el.closest('#applypilot-floating-hub, #applypilot-review-card, .ap-toast')) continue;
      const descriptor = adapters.getElementDescriptor(el);
      allDescriptors.push(descriptor);

      // Probe first to see if this matches an experience or education field
      const probeMatch = adapters.matchElement(descriptor, cachedProfile, 0);
      let sectionIndex = 0;

      if (probeMatch.matched && probeMatch.def && (probeMatch.def.category === 'experience' || probeMatch.def.category === 'education')) {
        const key = probeMatch.def.key;
        sectionIndex = occurrenceCounts[key] || 0;
        occurrenceCounts[key] = sectionIndex + 1;
      }

      const matchResult = adapters.matchElement(descriptor, cachedProfile, sectionIndex);
      allMatchResults.push(matchResult);

      // Skip explicitly ignored optional fields
      if (matchResult.ignored) {
        continue;
      }

      if (matchResult.matched && matchResult.value) {
        matched.push({ element: el, descriptor, matchResult, sectionIndex });
      } else {
        unmatched.push({ element: el, descriptor });
      }
    }

    const metrics = adapters.calculateFillMetrics ? adapters.calculateFillMetrics(allDescriptors, allMatchResults) : null;

    return { matched, unmatched, total: candidates.length, metrics };
  }

  // 4. Autofill All Matched Fields (Instant <10ms, Local-First, Zero AI Blocking)
  async function autofillForm() {
    await loadProfile();
    const { matched, unmatched, metrics } = scanFormFields();
    const adapters = getAtsAdapters();
    let filledCount = 0;

    for (const item of matched) {
      const el = item.element;
      const label = item.descriptor.combinedLabels || item.descriptor.name || item.descriptor.placeholder || "Field";
      const key = item.matchResult.def?.key || item.matchResult.key || "unknown";

      try {
        // Don't overwrite non-empty fields that already have valid user/workday values
        const currentVal = (el.value !== undefined ? String(el.value).trim() : "") || (el.tagName === 'BUTTON' ? el.innerText.trim() : "");
        if (currentVal.length > 0 && el.type !== 'checkbox' && el.type !== 'radio' && el.tagName !== 'BUTTON' && !el.isContentEditable) {
          continue;
        }

        // Support complex UI components via Universal ComplexUIAdapters
        const complex = adapters.detectComplexElement ? adapters.detectComplexElement(el) : null;
        const complexAdapters = adapters.ComplexUIAdapters || (typeof ComplexUIAdapters !== 'undefined' ? ComplexUIAdapters : null);

        if (complex && complexAdapters) {
          if (complex.type === "rich_text") {
            await complexAdapters.fillContentEditable(el, item.matchResult.value);
          } else if (complex.type === "custom_combobox") {
            await complexAdapters.fillCustomCombobox(el, item.matchResult.value);
          } else if (complex.type === "multi_tag_input") {
            await complexAdapters.fillMultiTagInput(el, item.matchResult.value);
          } else if (complex.type === "segmented_radiogroup") {
            await complexAdapters.fillSegmentedGroup(el, item.matchResult.value);
          } else if (complex.type === "custom_switch") {
            const boolVal = /^(yes|true|1|agree|authorized)$/i.test(String(item.matchResult.value).trim());
            await complexAdapters.fillCustomSwitch(el, boolVal);
          } else if (complex.type === "split_date") {
            await complexAdapters.fillSplitDate(complex.monthEl, complex.yearEl, item.matchResult.value);
          } else if (complex.type === "split_phone") {
            await complexAdapters.fillSplitPhone(complex.countryCodeEl, complex.numberEl, item.matchResult.value);
          } else if (complex.type === "split_salary") {
            await complexAdapters.fillSplitSalary(complex.currencyEl, complex.amountEl, complex.frequencyEl, item.matchResult.value);
          } else if (complex.type === "slider_rating") {
            await complexAdapters.fillSliderRating(el, item.matchResult.value);
          } else {
            setNativeValue(el, item.matchResult.value);
          }
        } else {
          setNativeValue(el, item.matchResult.value);
        }

        // Mark element as autofilled for user correction detection
        el.dataset.apAutofilled = "true";
        el.dataset.apAutofillVal = String(item.matchResult.value);
        el.dataset.apAutofillLabel = label;

        filledCount++;

        logAuditAction({
          actionType: "autofill",
          fieldLabel: label,
          fieldNameOrId: item.descriptor.name || item.descriptor.id,
          matchedKey: key,
          valueSet: item.matchResult.value,
          status: "success",
          details: `Autofilled from ${item.matchResult.source || "standard"}`
        });
      } catch (err) {
        console.warn("[ApplyPilot] Error setting field value:", err);
        logAuditAction({
          actionType: "autofill",
          fieldLabel: label,
          fieldNameOrId: item.descriptor.name || item.descriptor.id,
          matchedKey: key,
          valueSet: item.matchResult.value,
          status: "error",
          details: `DOMException/Error: ${err.message || String(err)}`
        });
      }
    }

    // Attach inline AI draft buttons to textareas
    attachInFieldAiButtons();

    // Queue deep telemetry for background Gemini analysis (non-blocking)
    const targetCompany = adapters.extractTargetCompany ? adapters.extractTargetCompany(window.location.href, document.title) : "";
    safeSendMessage({
      action: "QUEUE_BACKGROUND_SYNC",
      item: {
        type: "autofill_telemetry",
        targetCompany,
        url: window.location.href,
        pageTitle: document.title,
        metrics: metrics || { overallFillRate: "100%" },
        filledCount,
        totalMatched: matched.length,
        unmatchedCount: unmatched.length,
        unmatchedSample: unmatched.slice(0, 10).map(u => u.descriptor.combinedLabels || u.descriptor.name || "")
      }
    });

    // Update floating badge if present
    const rate = metrics?.overallFillRate ? ` (${metrics.overallFillRate})` : '';
    updateFloatingBadge(filledCount);

    showToast(`✓ Autofilled ${filledCount} fields${rate}!`);
    return { filledCount, totalMatched: matched.length, metrics };
  }

  // 5. In-Field AI Sparkle Assist for Textareas & Open-ended Questions
  function attachInFieldAiButtons() {
    const adapters = getAtsAdapters();
    if (adapters && typeof adapters.isJobApplicationPage === 'function') {
      const isJobPage = adapters.isJobApplicationPage(window.location.href, document);
      if (!isJobPage && !window.__applypilot_testing) return;
    }

    const textareas = document.querySelectorAll('textarea');
    for (const ta of textareas) {
      if (ta.dataset.apAiAttached) continue;
      ta.dataset.apAiAttached = "true";

      // Wrap in relative container if needed
      const parent = ta.parentElement;
      if (parent && getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ap-infield-ai-btn';
      btn.innerHTML = `<span>✨ AI Draft</span>`;
      btn.title = "Generate a tailored response using Gemini AI";

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        await loadProfile();
        const adapters = getAtsAdapters();
        if (!adapters) return;
        const descriptor = adapters.getElementDescriptor(ta);
        const questionText = descriptor.combinedLabels || descriptor.placeholder || descriptor.name || "Job Application Question";

        btn.classList.add('ap-loading');
        btn.innerHTML = `<span>⏳ Writing...</span>`;

        safeSendMessage({
          action: "GENERATE_AI_ANSWER",
          question: questionText,
          jobTitle: document.title || "Software Engineer II"
        }, (res) => {
          btn.classList.remove('ap-loading');
          btn.innerHTML = `<span>✨ AI Draft</span>`;

          if (res && res.answer) {
            setNativeValue(ta, res.answer);
            logAuditAction({
              actionType: "ai_suggest",
              fieldLabel: questionText,
              fieldNameOrId: descriptor.name || descriptor.id,
              matchedKey: "infield_ai_draft",
              valueSet: res.answer,
              status: "success",
              details: "AI draft generated and inserted"
            });
          } else if (res && res.error) {
            alert(`ApplyPilot AI Notice: ${res.error}`);
          }
        });
      });

      parent.appendChild(btn);
    }
  }

  // 6. Self-Learning Feedback Loop Review Card
  function showReviewCard({ descriptor, element, suggestedAnswer, onApprove, onDismiss }) {
    // Remove existing card if present
    const existing = document.getElementById('applypilot-review-card');
    if (existing) existing.remove();

    const card = document.createElement('div');
    card.id = 'applypilot-review-card';
    const questionText = descriptor.combinedLabels || descriptor.name || descriptor.placeholder || "Unknown Application Field";

    card.innerHTML = `
      <div class="ap-review-header">
        <div class="ap-review-badge">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
          </svg>
          ApplyPilot AI • Smart Field Suggestion
        </div>
        <button class="ap-close-btn" id="ap-review-close">&times;</button>
      </div>
      <div class="ap-review-body">
        <div class="ap-field-title">Application Question / Label:</div>
        <div class="ap-field-question">${escapeHtml(questionText)}</div>
        <div class="ap-field-title">Suggested Answer (Review or Edit):</div>
        <textarea class="ap-suggestion-textarea" id="ap-review-input">${escapeHtml(suggestedAnswer)}</textarea>
      </div>
      <div class="ap-review-footer">
        <button class="ap-btn-secondary" id="ap-review-skip">Skip</button>
        <button class="ap-btn-secondary" id="ap-review-ignore" title="Never ask or autofill this optional field again">Skip & Ignore Field</button>
        <button class="ap-btn-primary" id="ap-review-approve">Approve, Fill & Remember (Save to Profile)</button>
      </div>
    `;

    document.body.appendChild(card);

    card.querySelector('#ap-review-close').onclick = () => { card.remove(); if (onDismiss) onDismiss(); };
    card.querySelector('#ap-review-skip').onclick = () => { card.remove(); if (onDismiss) onDismiss(); };
    card.querySelector('#ap-review-ignore').onclick = () => {
      card.remove();
      safeSendMessage({
        action: "ADD_IGNORED_FIELD",
        fieldInfo: {
          label: questionText,
          keywords: [questionText.toLowerCase().trim(), descriptor.name, descriptor.id].filter(Boolean)
        }
      }, async () => {
        showToast(`✓ Ignored "${questionText.slice(0, 24)}"`);
        logAuditAction({
          actionType: "skipped",
          fieldLabel: questionText,
          fieldNameOrId: descriptor.name || descriptor.id,
          matchedKey: "ignored_field",
          valueSet: "",
          status: "skipped",
          details: "User added field to ignored optional list"
        });
        await loadProfile();
        if (onDismiss) onDismiss();
      });
    };

    card.querySelector('#ap-review-approve').onclick = () => {
      const finalVal = card.querySelector('#ap-review-input').value.trim();
      card.remove();
      if (onApprove) onApprove(finalVal);
    };
  }

  // 7. Process Unrecognized Fields With AI (Self-Learning Loop)
  async function suggestNextUnrecognizedField() {
    await loadProfile();
    const { unmatched } = scanFormFields();
    if (!unmatched.length) {
      alert("ApplyPilot AI: All detected fields on this page are already recognized and filled!");
      return;
    }

    const target = unmatched[0];
    const questionText = target.descriptor.combinedLabels || target.descriptor.name || target.descriptor.placeholder || "Career Application Question";

    // Extract options if select
    let options = [];
    if (target.element.tagName === 'SELECT') {
      options = Array.from(target.element.options).map(o => o.text.trim()).filter(Boolean);
    }

    // Query Gemini
    safeSendMessage({
      action: "SUGGEST_FIELD_ANSWER",
      fieldLabel: questionText,
      fieldType: target.descriptor.tag,
      options: options,
      pageContext: document.title
    }, (res) => {
      if (res && res.suggestion) {
        showReviewCard({
          descriptor: target.descriptor,
          element: target.element,
          suggestedAnswer: res.suggestion,
          onApprove: (approvedAnswer) => {
            // Fill into DOM
            setNativeValue(target.element, approvedAnswer);

            // Save into learnedMemory for current & future use!
            safeSendMessage({
              action: "SAVE_LEARNED_FIELD",
              fieldData: {
                fieldLabel: questionText,
                answer: approvedAnswer,
                fieldType: target.descriptor.tag,
                keywords: [
                  questionText.toLowerCase().trim(),
                  target.descriptor.name,
                  target.descriptor.id
                ].filter(Boolean)
              }
            }, () => {
              logAuditAction({
                actionType: "ai_suggest",
                fieldLabel: questionText,
                fieldNameOrId: target.descriptor.name || target.descriptor.id,
                matchedKey: questionText,
                valueSet: approvedAnswer,
                status: "success",
                details: "AI suggestion approved and learned"
              });
              // Reload profile memory
              loadProfile();
            });
          }
        });
      } else {
        alert(res?.error || "Could not generate AI suggestion for this field.");
      }
    });
  }

  // 8. Floating Action Hub
  function createFloatingHub() {
    const adapters = getAtsAdapters();
    if (adapters && typeof adapters.isJobApplicationPage === 'function') {
      const isJobPage = adapters.isJobApplicationPage(window.location.href, document);
      if (!isJobPage && !window.__applypilot_testing) return null;
    }

    if (floatingHubEl && !document.getElementById('applypilot-floating-hub')) {
      document.body.appendChild(floatingHubEl);
      return floatingHubEl;
    }
    if (floatingHubEl || document.getElementById('applypilot-floating-hub')) return floatingHubEl;

    floatingHubEl = document.createElement('div');
    floatingHubEl.id = 'applypilot-floating-hub';

    floatingHubEl.innerHTML = `
      <div class="ap-menu-card" id="ap-hub-menu">
        <div class="ap-menu-header">
          <div class="ap-menu-title">
            <span>🚀 ApplyPilot AI</span>
          </div>
          <button class="ap-close-btn" id="ap-menu-close">&times;</button>
        </div>
        <div class="ap-menu-body">
          <button class="ap-action-btn ap-primary-action" id="ap-btn-autofill">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            <span>Autofill All Detected Fields</span>
          </button>
          <button class="ap-action-btn" id="ap-btn-capture-fields">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            <span>📥 Capture & Learn Page Fields</span>
          </button>
          <button class="ap-action-btn" id="ap-btn-ai-scan">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
            </svg>
            <span>Scan Unmatched Field with AI</span>
          </button>
          <button class="ap-action-btn" id="ap-btn-sidepanel">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H5V5h9v12zm5 0h-3V5h3v12z"/>
            </svg>
            <span>Open ApplyPilot Side Panel</span>
          </button>
          <button class="ap-action-btn" id="ap-btn-hide-hub" style="font-size: 11px; opacity: 0.85; margin-top: 4px;">
            <span>✕ Dismiss widget on this page</span>
          </button>
        </div>
        <div class="ap-menu-footer">
          <span>Smart Autofill Active</span>
          <span>100% Local & Private</span>
        </div>
      </div>

      <div class="ap-floating-trigger" id="ap-hub-trigger">
        <svg viewBox="0 0 24 24">
          <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
        </svg>
        <span>ApplyPilot</span>
        <span class="ap-badge-count" id="ap-badge-count">Fill</span>
      </div>
    `;

    document.body.appendChild(floatingHubEl);

    const trigger = floatingHubEl.querySelector('#ap-hub-trigger');
    const menu = floatingHubEl.querySelector('#ap-hub-menu');
    const closeBtn = floatingHubEl.querySelector('#ap-menu-close');
    const hideBtn = floatingHubEl.querySelector('#ap-btn-hide-hub');

    trigger.addEventListener('click', () => {
      menu.classList.toggle('ap-visible');
    });

    closeBtn.addEventListener('click', () => {
      menu.classList.remove('ap-visible');
    });

    if (hideBtn) {
      hideBtn.addEventListener('click', () => {
        if (floatingHubEl) {
          floatingHubEl.remove();
          floatingHubEl = null;
        }
        showToast("ApplyPilot widget dismissed for this session");
      });
    }

    floatingHubEl.querySelector('#ap-btn-autofill').addEventListener('click', async () => {
      menu.classList.remove('ap-visible');
      await autofillForm();
    });

    floatingHubEl.querySelector('#ap-btn-capture-fields').addEventListener('click', async () => {
      menu.classList.remove('ap-visible');
      await capturePageValues();
    });

    floatingHubEl.querySelector('#ap-btn-ai-scan').addEventListener('click', async () => {
      menu.classList.remove('ap-visible');
      await suggestNextUnrecognizedField();
    });

    floatingHubEl.querySelector('#ap-btn-sidepanel').addEventListener('click', () => {
      menu.classList.remove('ap-visible');
      safeSendMessage({ action: "OPEN_SIDEPANEL" });
    });
    return floatingHubEl;
  }

  function updateFloatingBadge(count) {
    const badge = document.getElementById('ap-badge-count');
    if (badge && count !== undefined) {
      badge.textContent = `${count} Filled`;
    }
  }

  function showToast(msg) {
    let toast = document.getElementById('applypilot-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'applypilot-toast';
      toast.className = 'ap-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('ap-toast-visible');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('ap-toast-visible');
    }, 2600);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 9. Automatically Learn and Save Any Field When the User Types or Changes It
  function attachFieldCaptureListeners() {
    let debounceTimer = null;

    const handleFieldChange = (e) => {
      if (!isExtensionValid()) return;
      const el = e.target;
      if (!el || !el.matches || !el.matches('input, select, textarea')) return;
      if (el.type === 'password' || el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;
      if (el.closest && el.closest('#applypilot-floating-hub, #applypilot-review-card, .ap-toast')) return;

      const rawVal = el.type === 'checkbox' ? (el.checked ? "Yes" : "No") : el.value;
      const val = typeof rawVal === 'string' ? rawVal.trim() : rawVal;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        if (!isExtensionValid()) return;
        const adapters = getAtsAdapters();
        if (!adapters) return;
        if (typeof adapters.isJobApplicationPage === 'function') {
          const isJobPage = adapters.isJobApplicationPage(window.location.href, document);
          if (!isJobPage && !window.__applypilot_testing) return;
        }
        await loadProfile();

        const descriptor = adapters.getElementDescriptor(el);
        const label = descriptor.combinedLabels || descriptor.placeholder || descriptor.name || descriptor.dataAutomationId;
        if (!label || label.length < 2) return;

        const cleanLabel = label.replace(/\*/g, '').replace(/\s+/g, ' ').trim();

        // 1. Check if user completely removed/cleared an autofilled value or emptied a previously filled field
        const hadPreviousValue = el.dataset.apAutofilled === "true" || el.dataset.apHadValue === "true" || !!el.dataset.apAutofillVal;
        if ((!val || val.length === 0) && hadPreviousValue) {
          const originalVal = el.dataset.apAutofillVal || "";
          const targetCompany = adapters.extractTargetCompany ? adapters.extractTargetCompany(window.location.href, document.title) : "";

          // Mark element as cleared
          el.dataset.apAutofilled = "false";
          el.dataset.apAutofillVal = "";
          el.dataset.apUserCleared = "true";
          el.dataset.apHadValue = "false";

          // Calculate sectionIndex if inside experience/education/projects/references
          let sectionIndex = 0;
          const sectionContainer = el.closest('[data-automation-id*="workExperience"], [data-automation-id*="education"], .work-experience-item, .education-item, .experience-section, .education-section, [data-testid*="experience"], [data-testid*="education"], .experience-card, .education-card, fieldset');
          if (sectionContainer && sectionContainer.parentElement) {
            const siblings = Array.from(sectionContainer.parentElement.children).filter(c => c.matches && c.matches(sectionContainer.tagName));
            const sIdx = siblings.indexOf(sectionContainer);
            if (sIdx >= 0) sectionIndex = sIdx;
          }

          const parentScope = adapters.detectParentScope ? adapters.detectParentScope(el, [cleanLabel], sectionIndex) : (descriptor.parentScope || "Personal Information");

          let childKey = "custom";
          const lowerLbl = cleanLabel.toLowerCase();
          if (lowerLbl.includes("middle name") || (descriptor.name && descriptor.name.includes("middlename")) || (descriptor.id && descriptor.id.includes("middlename"))) childKey = "middleName";
          else if (/role description|job description|responsibilities|summary of duties/i.test(lowerLbl)) childKey = "roleDescription";
          else if (/job title|title|position|role/i.test(lowerLbl)) childKey = "title";
          else if (/company|employer|organization/i.test(lowerLbl)) childKey = "company";
          else if (/location|city/i.test(lowerLbl)) childKey = "location";
          else if (/start date|from date|begin date/i.test(lowerLbl)) childKey = "startDate";
          else if (/end date|to date/i.test(lowerLbl)) childKey = "endDate";
          else if (/school|university|college|institution/i.test(lowerLbl)) childKey = "school";
          else if (/degree/i.test(lowerLbl)) childKey = "degree";
          else if (/major|field of study/i.test(lowerLbl)) childKey = "fieldOfStudy";
          else if (/graduation year|year of graduation/i.test(lowerLbl)) childKey = "graduationYear";
          else if (/gpa|grade/i.test(lowerLbl)) childKey = "gpa";
          else childKey = descriptor.name || descriptor.id || cleanLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');

          // Clear local cache immediately
          if (cachedProfile) {
            if (childKey === "middleName") {
              if (cachedProfile.personal) cachedProfile.personal.middleName = "";
            }
            if (cachedProfile.learnedMemory) {
              cachedProfile.learnedMemory = cachedProfile.learnedMemory.filter(m => m && m.fieldLabel && m.fieldLabel.toLowerCase().trim() !== cleanLabel.toLowerCase());
            }
          }

          // Tell service worker to clear this field in persistent storage
          safeSendMessage({
            action: "USER_CLEARED_FIELD",
            fieldLabel: el.dataset.apAutofillLabel || cleanLabel,
            fieldKey: childKey,
            fieldNameOrId: descriptor.name || descriptor.id || "",
            parentScope,
            childKey,
            sectionIndex
          });

          // Queue background sync item
          safeSendMessage({
            action: "QUEUE_BACKGROUND_SYNC",
            item: {
              type: "user_cleared_field",
              fieldLabel: el.dataset.apAutofillLabel || cleanLabel,
              fieldNameOrId: descriptor.name || descriptor.id,
              originalValue: originalVal,
              correctedValue: "",
              targetCompany,
              url: window.location.href,
              pageTitle: document.title
            }
          });

          // Record skipped interaction for predictive ignore
          safeSendMessage({
            action: "RECORD_FIELD_INTERACTION",
            fieldLabel: cleanLabel,
            filled: false,
            value: "",
            isRequired: descriptor.isRequired
          });

          logAuditAction({
            actionType: "user_cleared_field",
            fieldLabel: cleanLabel,
            fieldNameOrId: descriptor.name || descriptor.id,
            matchedKey: cleanLabel,
            valueSet: "",
            status: "success",
            details: `User cleared field in ${parentScope}: "${originalVal}" -> ""`
          });

          showToast(`✓ Remembered: Left "${cleanLabel.slice(0, 24)}" blank`);
          return;
        }

        // If val is empty and wasn't autofilled or previously filled, nothing to save or record
        if (!val || val.length === 0) return;

        // 2. Check if user is correcting an autofilled value
        if (el.dataset.apAutofilled === "true" && el.dataset.apAutofillVal && el.dataset.apAutofillVal !== val) {
          const targetCompany = adapters.extractTargetCompany ? adapters.extractTargetCompany(window.location.href, document.title) : "";
          safeSendMessage({
            action: "QUEUE_BACKGROUND_SYNC",
            item: {
              type: "user_correction",
              fieldLabel: el.dataset.apAutofillLabel || cleanLabel,
              fieldNameOrId: descriptor.name || descriptor.id,
              originalValue: el.dataset.apAutofillVal,
              correctedValue: val,
              targetCompany,
              url: window.location.href,
              pageTitle: document.title
            }
          });

          logAuditAction({
            actionType: "user_correction",
            fieldLabel: cleanLabel,
            fieldNameOrId: descriptor.name || descriptor.id,
            matchedKey: cleanLabel,
            valueSet: val,
            status: "success",
            details: `User corrected autofilled value: "${el.dataset.apAutofillVal}" -> "${val}"`
          });

          showToast(`✓ Correction recorded for background AI refinement`);
        }

        // 3. Universal Hierarchical Parent-Context Saver
        let sectionIndex = 0;
        const sectionContainer = el.closest('[data-automation-id*="workExperience"], [data-automation-id*="education"], .work-experience-item, .education-item, .experience-section, .education-section, [data-testid*="experience"], [data-testid*="education"], .experience-card, .education-card, fieldset');
        if (sectionContainer && sectionContainer.parentElement) {
          const siblings = Array.from(sectionContainer.parentElement.children).filter(c => c.matches && c.matches(sectionContainer.tagName));
          const sIdx = siblings.indexOf(sectionContainer);
          if (sIdx >= 0) sectionIndex = sIdx;
        }

        const parentScope = adapters.detectParentScope ? adapters.detectParentScope(el, [cleanLabel], sectionIndex) : (descriptor.parentScope || "Personal Information");

        let category = "personal";
        if (parentScope.toLowerCase().includes("work experience") || parentScope.toLowerCase().includes("experience")) category = "experience";
        else if (parentScope.toLowerCase().includes("education")) category = "education";
        else if (parentScope.toLowerCase().includes("project")) category = "project";
        else if (parentScope.toLowerCase().includes("reference")) category = "reference";

        let childKey = "custom";
        const lowerLbl = cleanLabel.toLowerCase();
        if (lowerLbl.includes("middle name") || (descriptor.name && descriptor.name.includes("middlename")) || (descriptor.id && descriptor.id.includes("middlename"))) childKey = "middleName";
        else if (/role description|job description|responsibilities|summary of duties/i.test(lowerLbl)) childKey = "roleDescription";
        else if (/job title|title|position|role/i.test(lowerLbl)) childKey = "title";
        else if (/company|employer|organization/i.test(lowerLbl)) childKey = "company";
        else if (/location|city/i.test(lowerLbl)) childKey = "location";
        else if (/start date|from date|begin date/i.test(lowerLbl)) childKey = "startDate";
        else if (/end date|to date/i.test(lowerLbl)) childKey = "endDate";
        else if (/school|university|college|institution/i.test(lowerLbl)) childKey = "school";
        else if (/degree/i.test(lowerLbl)) childKey = "degree";
        else if (/major|field of study/i.test(lowerLbl)) childKey = "fieldOfStudy";
        else if (/graduation year|year of graduation/i.test(lowerLbl)) childKey = "graduationYear";
        else if (/gpa|grade/i.test(lowerLbl)) childKey = "gpa";
        else childKey = descriptor.name || descriptor.id || cleanLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');

        // Always save into Universal Hierarchical Storage (parentScope + childKey)
        safeSendMessage({
          action: "SAVE_NESTED_FIELD",
          parentScope,
          childKey,
          value: val,
          category,
          sectionIndex,
          metadata: {
            fieldLabel: cleanLabel,
            fieldName: descriptor.name || "",
            fieldId: descriptor.id || ""
          }
        }, (res) => {
          if (cachedProfile) {
            if (category === "experience") {
              cachedProfile.experience = cachedProfile.experience || { items: [] };
              cachedProfile.experience.items = cachedProfile.experience.items || [];
              while (cachedProfile.experience.items.length <= sectionIndex) {
                cachedProfile.experience.items.push({
                  id: `exp-${Date.now()}-${cachedProfile.experience.items.length}`,
                  title: "", company: "", location: "", startDate: "", endDate: "", isCurrent: false, description: ""
                });
              }
              if (childKey === "roleDescription" || childKey === "description") {
                cachedProfile.experience.items[sectionIndex].description = val;
              } else if (childKey in cachedProfile.experience.items[sectionIndex]) {
                cachedProfile.experience.items[sectionIndex][childKey] = val;
              }
            } else if (category === "education") {
              cachedProfile.education = cachedProfile.education || { items: [] };
              cachedProfile.education.items = cachedProfile.education.items || [];
              while (cachedProfile.education.items.length <= sectionIndex) {
                cachedProfile.education.items.push({
                  id: `edu-${Date.now()}-${cachedProfile.education.items.length}`,
                  school: "", degree: "", fieldOfStudy: "", graduationYear: "", gpa: ""
                });
              }
              if (childKey in cachedProfile.education.items[sectionIndex]) {
                cachedProfile.education.items[sectionIndex][childKey] = val;
              }
            } else if (childKey === "middleName") {
              if (cachedProfile.personal) cachedProfile.personal.middleName = val;
            }
          }

          logAuditAction({
            actionType: "manual_entry",
            fieldLabel: `${parentScope} - ${cleanLabel}`,
            fieldNameOrId: descriptor.name || descriptor.id,
            matchedKey: `${parentScope}.${childKey}`,
            valueSet: val,
            status: "success",
            details: `User saved hierarchical value for [${parentScope} -> ${childKey}]`
          });
          showToast(`✓ Remembered: ${parentScope} -> ${cleanLabel.slice(0, 20)}`);
        });

        // Record interaction for predictive feedback loop
        safeSendMessage({
          action: "RECORD_FIELD_INTERACTION",
          fieldLabel: cleanLabel,
          filled: true,
          value: val,
          isRequired: descriptor.isRequired
        });

        // If it's a general personal field, also learn it for global fallback
        if (category === "personal" && childKey !== "middleName") {
          safeSendMessage({
            action: "SAVE_LEARNED_FIELD",
            fieldData: {
              fieldLabel: cleanLabel,
              answer: val,
              fieldType: descriptor.tag,
              keywords: [
                cleanLabel.toLowerCase(),
                descriptor.name,
                descriptor.id,
                descriptor.dataAutomationId
              ].filter(Boolean)
            }
          }, (res) => {
            if (res && res.success && res.item && cachedProfile) {
              cachedProfile.learnedMemory = cachedProfile.learnedMemory || [];
              const idx = cachedProfile.learnedMemory.findIndex(m => m && m.fieldLabel && m.fieldLabel.toLowerCase() === cleanLabel.toLowerCase());
              if (idx >= 0) cachedProfile.learnedMemory[idx] = res.item;
              else cachedProfile.learnedMemory.unshift(res.item);
            }
          });
        }
      }, 600);
    };

    document.addEventListener('focus', (e) => {
      const adapters = getAtsAdapters();
      if (adapters && typeof adapters.isJobApplicationPage === 'function') {
        const isJobPage = adapters.isJobApplicationPage(window.location.href, document);
        if (!isJobPage && !window.__applypilot_testing) return;
      }
      const el = e.target;
      if (el && el.matches && el.matches('input, select, textarea') && el.value && el.value.trim().length > 0) {
        el.dataset.apHadValue = "true";
        if (!el.dataset.apAutofillVal) {
          el.dataset.apAutofillVal = el.value.trim();
        }
      }
    }, true);
    document.addEventListener('change', handleFieldChange, true);
    document.addEventListener('blur', handleFieldChange, true);

    // Form submission listener: track which optional fields the user left empty vs filled
    document.addEventListener('submit', () => {
      const adapters = getAtsAdapters();
      if (!adapters) return;
      if (typeof adapters.isJobApplicationPage === 'function') {
        const isJobPage = adapters.isJobApplicationPage(window.location.href, document);
        if (!isJobPage && !window.__applypilot_testing) return;
      }
      const allInputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea');
      for (const inp of allInputs) {
        const desc = adapters.getElementDescriptor(inp);
        if (!desc.isRequired) {
          const hasVal = (inp.value || "").trim().length > 0;
          const optLabel = desc.combinedLabels || desc.placeholder || desc.name;
          if (optLabel && optLabel.length >= 2) {
            safeSendMessage({
              action: "RECORD_FIELD_INTERACTION",
              fieldLabel: optLabel.replace(/\*/g, '').trim(),
              filled: hasVal,
              value: inp.value || "",
              isRequired: false
            });
          }
        }
      }
    }, true);
  }

  // 10. Scan & Capture All Non-Empty Page Fields (e.g. from Workday's Resume Parser)
  async function capturePageValues() {
    await loadProfile();
    const adapters = getAtsAdapters();
    if (!adapters) {
      console.warn("[ApplyPilot] AtsAdapters not available for page capture.");
      return { capturedCount: 0 };
    }

    const candidates = Array.from(document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]), select, textarea'
    ));

    let count = 0;
    const expTitles = [];
    const expCompanies = [];
    const expLocations = [];
    const expFroms = [];
    const expTos = [];
    const expDescs = [];

    const eduSchools = [];
    const eduDegrees = [];
    const eduFields = [];
    const eduGrads = [];
    const eduGpas = [];

    for (const el of candidates) {
      if (el.closest && el.closest('#applypilot-floating-hub, #applypilot-review-card, .ap-toast')) continue;
      const rawVal = el.type === 'checkbox' ? (el.checked ? "Yes" : "No") : el.value;
      const val = typeof rawVal === 'string' ? rawVal.trim() : rawVal;
      if (!val || val.length === 0) continue;

      const descriptor = adapters.getElementDescriptor(el);
      const label = descriptor.combinedLabels || descriptor.placeholder || descriptor.name || descriptor.dataAutomationId;
      if (!label || label.length < 2) continue;

      const cleanLabel = label.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
      const match = adapters.matchElement(descriptor, cachedProfile);

      // Track structured experience fields
      if (match.matched && match.def) {
        if (match.def.key === "currentTitle") expTitles.push(val);
        else if (match.def.key === "currentCompany") expCompanies.push(val);
        else if (match.def.key === "jobLocation") expLocations.push(val);
        else if (match.def.key === "startDate") expFroms.push(val);
        else if (match.def.key === "endDate") expTos.push(val);
        else if (match.def.key === "roleDescription") expDescs.push(val);
        else if (match.def.key === "school") eduSchools.push(val);
        else if (match.def.key === "degree") eduDegrees.push(val);
        else if (match.def.key === "fieldOfStudy") eduFields.push(val);
        else if (match.def.key === "graduationYear") eduGrads.push(val);
        else if (match.def.key === "gpa") eduGpas.push(val);
      }

      if (!match.matched || match.value !== val) {
        safeSendMessage({
          action: "SAVE_LEARNED_FIELD",
          fieldData: {
            fieldLabel: cleanLabel,
            answer: val,
            fieldType: descriptor.tag,
            keywords: [cleanLabel.toLowerCase(), descriptor.name, descriptor.id, descriptor.dataAutomationId].filter(Boolean)
          }
        });
        count++;
      }
    }

    // Save multi-experience items if detected on page
    if (expTitles.length > 0 || expCompanies.length > 0) {
      const maxExp = Math.max(expTitles.length, expCompanies.length);
      const newExpItems = [];
      for (let i = 0; i < maxExp; i++) {
        newExpItems.push({
          id: `exp-page-${Date.now()}-${i}`,
          title: expTitles[i] || "",
          company: expCompanies[i] || "",
          location: expLocations[i] || "",
          startDate: expFroms[i] || "",
          endDate: expTos[i] || "",
          isCurrent: expTos[i] ? expTos[i].toLowerCase().includes("present") : (i === 0),
          description: expDescs[i] || ""
        });
      }
      if (newExpItems.length > 0) {
        cachedProfile.experience = cachedProfile.experience || {};
        cachedProfile.experience.items = newExpItems;
        if (newExpItems[0].title) cachedProfile.experience.currentTitle = newExpItems[0].title;
        if (newExpItems[0].company) cachedProfile.experience.currentCompany = newExpItems[0].company;
        safeSendMessage({ action: "SAVE_PROFILE", profile: cachedProfile });
        count += newExpItems.length;
      }
    }

    // Save multi-education items if detected on page
    if (eduSchools.length > 0 || eduDegrees.length > 0) {
      const maxEdu = Math.max(eduSchools.length, eduDegrees.length);
      const newEduItems = [];
      for (let i = 0; i < maxEdu; i++) {
        newEduItems.push({
          id: `edu-page-${Date.now()}-${i}`,
          school: eduSchools[i] || "",
          degree: eduDegrees[i] || "",
          fieldOfStudy: eduFields[i] || "",
          graduationYear: eduGrads[i] || "",
          gpa: eduGpas[i] || ""
        });
      }
      if (newEduItems.length > 0) {
        cachedProfile.education = cachedProfile.education || {};
        cachedProfile.education.items = newEduItems;
        if (newEduItems[0].school) cachedProfile.education.school = newEduItems[0].school;
        if (newEduItems[0].degree) cachedProfile.education.degree = newEduItems[0].degree;
        safeSendMessage({ action: "SAVE_PROFILE", profile: cachedProfile });
        count += newEduItems.length;
      }
    }

    logAuditAction({
      actionType: "page_learned",
      fieldLabel: "Page Field Scan",
      fieldNameOrId: "bulk_capture",
      matchedKey: "bulk_capture",
      valueSet: `${count} fields`,
      status: "success",
      details: `Captured ${count} fields including multi-experience/education entries`
    });

    if (count > 0) {
      showToast(`✓ Captured & remembered ${count} fields from page!`);
      await loadProfile();
    } else {
      showToast(`All fields on this page are already in memory.`);
    }

    return { capturedCount: count };
  }

  // 11. Observe dynamic SPA steps (Workday steps 1 -> 2 -> 3)
  function observeDynamicForms() {
    let timer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const adapters = getAtsAdapters();
        const isJobPage = adapters && typeof adapters.isJobApplicationPage === 'function'
          ? adapters.isJobApplicationPage(window.location.href, document)
          : false;

        if (isJobPage) {
          if (!cachedProfile) await loadProfile();
          if (cachedProfile?.settings?.showFloatingBadge !== false) {
            createFloatingHub();
          }
          attachInFieldAiButtons();
        } else if (!window.__applypilot_testing) {
          if (floatingHubEl && floatingHubEl.parentElement) {
            floatingHubEl.remove();
            floatingHubEl = null;
          }
        }
      }, 400);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // 12. Runtime Message Listener
  const onMessageListener = (request, sender, sendResponse) => {
    (async () => {
      if (!isExtensionValid()) return;
      if (request.action === "AUTOFILL") {
        const res = await autofillForm();
        sendResponse({ success: true, ...res });
      } else if (request.action === "CAPTURE_PAGE_FIELDS") {
        const res = await capturePageValues();
        sendResponse({ success: true, ...res });
      } else if (request.action === "SCAN_FIELDS") {
        await loadProfile();
        const scan = scanFormFields();
        sendResponse({
          total: scan.total,
          matchedCount: scan.matched.length,
          unmatchedCount: scan.unmatched.length,
          matchedLabels: scan.matched.map(m => m.matchResult.label || m.matchResult.def?.key)
        });
      } else if (request.action === "SUGGEST_UNMATCHED") {
        await suggestNextUnrecognizedField();
        sendResponse({ success: true });
      }
    })();
    return true; // Keep channel open for async response
  };

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener(onMessageListener);
  }

  // 13. Initialization
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__applypilot_testing) {
    loadProfile().then((profile) => {
      const adapters = getAtsAdapters();
      const isJobPage = adapters && typeof adapters.isJobApplicationPage === 'function'
        ? adapters.isJobApplicationPage(window.location.href, document)
        : false;

      if (isJobPage) {
        if (profile?.settings?.showFloatingBadge !== false) {
          createFloatingHub();
        }
        attachInFieldAiButtons();
      }
      attachFieldCaptureListeners();
      observeDynamicForms();
    });
  }

  if (typeof module !== 'undefined') {
    module.exports = {
      isExtensionValid,
      safeSendMessage,
      logAuditAction,
      loadProfile,
      setNativeValue,
      scanFormFields,
      autofillForm,
      attachInFieldAiButtons,
      showReviewCard,
      suggestNextUnrecognizedField,
      createFloatingHub,
      updateFloatingBadge,
      showToast,
      escapeHtml,
      attachFieldCaptureListeners,
      capturePageValues,
      observeDynamicForms,
      onMessageListener
    };
  }

})();
