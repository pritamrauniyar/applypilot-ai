// ApplyPilot AI - In-Page Content Engine
// High Performance, Low Memory (<50KB DOM footprint), Self-Learning Feedback Loop

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__applypilot_injected) return;
  window.__applypilot_injected = true;

  let cachedProfile = null;
  let floatingHubEl = null;

  // Helper to reliably access AtsAdapters across extension contexts
  function getAtsAdapters() {
    if (typeof window !== 'undefined' && window.AtsAdapters) return window.AtsAdapters;
    if (typeof globalThis !== 'undefined' && globalThis.AtsAdapters) return globalThis.AtsAdapters;
    if (typeof AtsAdapters !== 'undefined') return AtsAdapters;
    return null;
  }

  // 1. Fetch user profile from background storage or direct local storage
  async function loadProfile() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const data = await chrome.storage.local.get(['applypilot_profile']);
        if (data?.applypilot_profile) {
          cachedProfile = data.applypilot_profile;
          return cachedProfile;
        }
      } catch (e) {}
    }

    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: "GET_PROFILE" }, (response) => {
          if (response?.profile) {
            cachedProfile = response.profile;
          }
          resolve(cachedProfile);
        });
      } catch (e) {
        resolve(cachedProfile);
      }
    });
  }

  // 2. React / Vue / Modern Reactive Framework Value Setter
  // Standard input.value = val gets ignored by React synthetic state. This bypasses that reliably.
  function setNativeValue(element, value) {
    if (!element) return;

    if (element.tagName === 'SELECT') {
      const targetStr = String(value).toLowerCase().trim();
      let matchedIdx = -1;

      for (let i = 0; i < element.options.length; i++) {
        const opt = element.options[i];
        const optText = opt.text.toLowerCase().trim();
        const optVal = opt.value.toLowerCase().trim();

        if (optText === targetStr || optVal === targetStr || optText.includes(targetStr) || targetStr.includes(optText)) {
          matchedIdx = i;
          break;
        }
      }

      if (matchedIdx !== -1) {
        element.selectedIndex = matchedIdx;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }

    if (element.type === 'checkbox') {
      const shouldCheck = typeof value === 'boolean' ? value : ['yes', 'true', '1'].includes(String(value).toLowerCase());
      element.checked = shouldCheck;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('click', { bubbles: true }));
      return;
    }

    if (element.type === 'radio') {
      element.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('click', { bubbles: true }));
      return;
    }

    // Focus first to activate framework listener
    element.dispatchEvent(new Event('focus', { bubbles: true }));

    // Standard text, textarea, email, tel, url
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));

    // Add gentle visual highlight
    element.classList.add('ap-filled-highlight');
    setTimeout(() => {
      element.classList.remove('ap-filled-highlight');
    }, 2000);
  }

  // 3. Scan DOM Form Fields
  function scanFormFields() {
    const candidates = Array.from(document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea, button[aria-haspopup="listbox"], [role="combobox"]'
    ));
    const matched = [];
    const unmatched = [];
    const adapters = getAtsAdapters();

    if (!cachedProfile || !adapters) {
      return { matched, unmatched, total: candidates.length };
    }

    // Track sequential occurrences for experience and education fields
    const occurrenceCounts = {};

    for (const el of candidates) {
      if (el.closest && el.closest('#applypilot-floating-hub, #applypilot-review-card, .ap-toast')) continue;
      const descriptor = adapters.getElementDescriptor(el);

      // Probe first to see if this matches an experience or education field
      const probeMatch = adapters.matchElement(descriptor, cachedProfile, 0);
      let sectionIndex = 0;

      if (probeMatch.matched && probeMatch.def && (probeMatch.def.category === 'experience' || probeMatch.def.category === 'education')) {
        const key = probeMatch.def.key;
        sectionIndex = occurrenceCounts[key] || 0;
        occurrenceCounts[key] = sectionIndex + 1;
      }

      const matchResult = adapters.matchElement(descriptor, cachedProfile, sectionIndex);

      if (matchResult.matched && matchResult.value) {
        matched.push({ element: el, descriptor, matchResult, sectionIndex });
      } else {
        unmatched.push({ element: el, descriptor });
      }
    }

    return { matched, unmatched, total: candidates.length };
  }

  // 4. Autofill All Matched Fields
  async function autofillForm() {
    await loadProfile();
    const { matched } = scanFormFields();
    let filledCount = 0;

    for (const item of matched) {
      try {
        const el = item.element;
        // Don't overwrite non-empty fields that already have valid user/workday values
        const currentVal = (el.value !== undefined ? String(el.value).trim() : "") || (el.tagName === 'BUTTON' ? el.innerText.trim() : "");
        if (currentVal.length > 0 && el.type !== 'checkbox' && el.type !== 'radio' && el.tagName !== 'BUTTON') {
          continue;
        }

        setNativeValue(el, item.matchResult.value);
        filledCount++;
      } catch (err) {
        console.warn("[ApplyPilot] Error setting field value:", err);
      }
    }

    // Attach inline AI draft buttons to textareas
    attachInFieldAiButtons();

    // Update floating badge if present
    updateFloatingBadge(filledCount);

    showToast(`✓ Autofilled ${filledCount} fields!`);
    return { filledCount, totalMatched: matched.length };
  }

  // 5. In-Field AI Sparkle Assist for Textareas & Open-ended Questions
  function attachInFieldAiButtons() {
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

        chrome.runtime.sendMessage({
          action: "GENERATE_AI_ANSWER",
          question: questionText,
          jobTitle: document.title || "Software Engineer II"
        }, (res) => {
          btn.classList.remove('ap-loading');
          btn.innerHTML = `<span>✨ AI Draft</span>`;

          if (res && res.answer) {
            setNativeValue(ta, res.answer);
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
        <button class="ap-btn-primary" id="ap-review-approve">Approve, Fill & Remember (Save to Profile)</button>
      </div>
    `;

    document.body.appendChild(card);

    card.querySelector('#ap-review-close').onclick = () => { card.remove(); if (onDismiss) onDismiss(); };
    card.querySelector('#ap-review-skip').onclick = () => { card.remove(); if (onDismiss) onDismiss(); };
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
    chrome.runtime.sendMessage({
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
            chrome.runtime.sendMessage({
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
    if (floatingHubEl || document.getElementById('applypilot-floating-hub')) return;

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

    trigger.addEventListener('click', () => {
      menu.classList.toggle('ap-visible');
    });

    closeBtn.addEventListener('click', () => {
      menu.classList.remove('ap-visible');
    });

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
      chrome.runtime.sendMessage({ action: "OPEN_SIDEPANEL" });
    });
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
      const el = e.target;
      if (!el || !el.matches || !el.matches('input, select, textarea')) return;
      if (el.type === 'password' || el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;
      if (el.closest && el.closest('#applypilot-floating-hub, #applypilot-review-card, .ap-toast')) return;

      const rawVal = el.type === 'checkbox' ? (el.checked ? "Yes" : "No") : el.value;
      const val = typeof rawVal === 'string' ? rawVal.trim() : rawVal;
      if (!val || val.length === 0) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const adapters = getAtsAdapters();
        if (!adapters) return;
        await loadProfile();

        const descriptor = adapters.getElementDescriptor(el);
        const label = descriptor.combinedLabels || descriptor.placeholder || descriptor.name || descriptor.dataAutomationId;
        if (!label || label.length < 2) return;

        const cleanLabel = label.replace(/\*/g, '').replace(/\s+/g, ' ').trim();

        // Check if value is already identical in current profile
        const match = adapters.matchElement(descriptor, cachedProfile);
        if (match.matched && match.value === val) {
          return;
        }

        // Save into learned memory in background
        chrome.runtime.sendMessage({
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
          if (res && res.success) {
            if (cachedProfile) {
              cachedProfile.learnedMemory = cachedProfile.learnedMemory || [];
              const idx = cachedProfile.learnedMemory.findIndex(m => m.fieldLabel.toLowerCase() === cleanLabel.toLowerCase());
              if (idx >= 0) cachedProfile.learnedMemory[idx] = res.item;
              else cachedProfile.learnedMemory.unshift(res.item);
            }
            showToast(`✓ Remembered: "${cleanLabel.slice(0, 24)}"`);
          }
        });
      }, 600);
    };

    document.addEventListener('change', handleFieldChange, true);
    document.addEventListener('blur', handleFieldChange, true);
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
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'
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
        chrome.runtime.sendMessage({
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
        chrome.runtime.sendMessage({ action: "SAVE_PROFILE", profile: cachedProfile });
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
        chrome.runtime.sendMessage({ action: "SAVE_PROFILE", profile: cachedProfile });
        count += newEduItems.length;
      }
    }

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
      timer = setTimeout(() => {
        attachInFieldAiButtons();
      }, 400);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // 12. Runtime Message Listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
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
  });

  // 13. Initialization
  loadProfile().then((profile) => {
    if (profile?.settings?.showFloatingBadge !== false) {
      createFloatingHub();
    }
    attachInFieldAiButtons();
    attachFieldCaptureListeners();
    observeDynamicForms();
  });

})();
