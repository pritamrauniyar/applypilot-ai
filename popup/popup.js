// ApplyPilot - Popup Logic

document.addEventListener('DOMContentLoaded', async () => {
  let activeProfile = null;
  let currentTab = null;

  const byId = (id) => document.getElementById(id);
  const setText = (id, text) => {
    const el = byId(id);
    if (el) el.textContent = text;
  };
  const setVal = (id, val) => {
    const el = byId(id);
    if (el) el.value = val;
  };
  const getVal = (id, fallback = "") => {
    const el = byId(id);
    return el ? el.value : fallback;
  };

  // 1. Initialize Tabs
  const tabButtons = document.querySelectorAll('.ap-tab');
  const tabContents = document.querySelectorAll('.ap-tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchToTab(btn.dataset.tab);
    });
  });

  function switchToTab(tabId) {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    const targetTabBtn = document.querySelector(`.ap-tab[data-tab="${tabId}"]`);
    const targetContent = byId(tabId);
    if (targetTabBtn) targetTabBtn.classList.add('active');
    if (targetContent) targetContent.classList.add('active');
    if (tabId === 'tab-logs') {
      renderAuditLogs();
      renderIgnoredFields();
    }
  }

  // Header Settings Button
  byId('btn-header-settings')?.addEventListener('click', () => {
    switchToTab('tab-settings');
  });

  // 2. Open Sidepanel Button
  byId('btn-open-sidepanel')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.windowId && chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      window.close();
    }
  });

  // 3. Load Profile
  async function refreshProfile() {
    activeProfile = await StorageService.getProfile();
    populateForm(activeProfile);
    renderExperienceList(activeProfile.experience?.items || []);
    renderDynamicFields(activeProfile.dynamicFields || []);
    renderIgnoredFields();
  }

  // Render Work Experience History Cards in Sequence
  function renderExperienceList(items) {
    const container = document.getElementById('experience-list');
    const countBadge = document.getElementById('experience-count');
    if (!container) return;

    if (countBadge) countBadge.textContent = items.length;
    container.innerHTML = '';

    if (!items.length) {
      container.innerHTML = '<div class="ap-text-muted" style="padding: 6px 0; font-size: 11.5px;">No experience roles added yet. Click below or parse a resume to load your complete career history.</div>';
      return;
    }

    items.forEach((exp, idx) => {
      const card = document.createElement('div');
      card.className = 'ap-exp-card';
      card.dataset.id = exp.id || `exp-${idx}`;
      card.style.cssText = "background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; position: relative;";

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="font-size: 12px; color: var(--primary);">#${idx + 1} ${escapeHtml(exp.title || "Role")} ${exp.company ? `@ ${escapeHtml(exp.company)}` : ""}</strong>
          <button type="button" class="ap-field-del-btn ap-del-exp" title="Delete Role" style="position: static; font-size: 14px; line-height: 1;">&times;</button>
        </div>
        <div class="ap-grid-2" style="margin-bottom: 6px;">
          <div class="ap-input-group" style="margin-bottom: 0;">
            <label style="font-size: 11px;">Job Title</label>
            <input type="text" class="ap-exp-title" value="${escapeHtml(exp.title || "")}" placeholder="e.g. Software Engineer II" style="padding: 6px 8px; font-size: 12px;">
          </div>
          <div class="ap-input-group" style="margin-bottom: 0;">
            <label style="font-size: 11px;">Company</label>
            <input type="text" class="ap-exp-company" value="${escapeHtml(exp.company || "")}" placeholder="e.g. Uber" style="padding: 6px 8px; font-size: 12px;">
          </div>
        </div>
        <div class="ap-grid-2" style="margin-bottom: 6px;">
          <div class="ap-input-group" style="margin-bottom: 0;">
            <label style="font-size: 11px;">Location</label>
            <input type="text" class="ap-exp-location" value="${escapeHtml(exp.location || "")}" placeholder="e.g. San Francisco, CA" style="padding: 6px 8px; font-size: 12px;">
          </div>
          <div class="ap-input-group" style="margin-bottom: 0;">
            <label style="font-size: 11px;">Dates (From - To)</label>
            <div style="display: flex; gap: 4px;">
              <input type="text" class="ap-exp-start" value="${escapeHtml(exp.startDate || "")}" placeholder="From (e.g. 2022-08)" style="flex: 1; padding: 6px 6px; font-size: 11px;">
              <input type="text" class="ap-exp-end" value="${escapeHtml(exp.endDate || "")}" placeholder="To (e.g. Present)" style="flex: 1; padding: 6px 6px; font-size: 11px;">
            </div>
          </div>
        </div>
        <div style="margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
          <input type="checkbox" class="ap-exp-current" id="chk-curr-${idx}" ${exp.isCurrent ? 'checked' : ''} style="width: auto; margin: 0;">
          <label for="chk-curr-${idx}" style="font-size: 11px; margin: 0; cursor: pointer;">I currently work here</label>
        </div>
        <div class="ap-input-group" style="margin-bottom: 0;">
          <label style="font-size: 11px;">Role Description & Key Achievements</label>
          <textarea class="ap-exp-desc" rows="2" placeholder="Key responsibilities, systems scaled, impact..." style="padding: 6px 8px; font-size: 11.5px;">${escapeHtml(exp.description || "")}</textarea>
        </div>
      `;

      card.querySelector('.ap-del-exp').addEventListener('click', () => {
        activeProfile.experience.items.splice(idx, 1);
        renderExperienceList(activeProfile.experience.items);
      });

      container.appendChild(card);
    });
  }

  // Add Experience Button
  document.getElementById('btn-add-experience')?.addEventListener('click', () => {
    if (!activeProfile.experience) activeProfile.experience = {};
    if (!Array.isArray(activeProfile.experience.items)) activeProfile.experience.items = [];
    activeProfile.experience.items.push({
      id: `exp-${Date.now()}`,
      title: "",
      company: "",
      location: "",
      startDate: "",
      endDate: "",
      isCurrent: activeProfile.experience.items.length === 0,
      description: ""
    });
    renderExperienceList(activeProfile.experience.items);
  });

  function populateForm(p) {
    // Personal
    setVal('prof-first-name', p.personal?.firstName || "");
    setVal('prof-middle-name', p.personal?.middleName || "");
    setVal('prof-last-name', p.personal?.lastName || "");
    setVal('prof-email', p.personal?.email || "");
    setVal('prof-phone', p.personal?.phone || "");
    setVal('prof-address', p.personal?.address || "");
    setVal('prof-city', p.personal?.city || "");
    setVal('prof-state', p.personal?.state || "");
    setVal('prof-postal', p.personal?.postalCode || "");
    setVal('prof-country', p.personal?.country || "");

    // Links
    setVal('prof-linkedin', p.links?.linkedin || "");
    setVal('prof-github', p.links?.github || "");
    setVal('prof-portfolio', p.links?.portfolio || "");

    // Experience & Education
    setVal('prof-company', p.experience?.currentCompany || "");
    setVal('prof-title', p.experience?.currentTitle || "");
    setVal('prof-yoe', p.experience?.yearsOfExperience || "");
    setVal('prof-skills', p.experience?.skills || "");
    const deg = p.education?.degree || "";
    const major = p.education?.fieldOfStudy || "";
    const degDisplay = deg && major && !deg.toLowerCase().includes(major.toLowerCase())
      ? `${deg} — ${major}`
      : (deg || major || "");
    setVal('prof-degree', degDisplay);
    setVal('prof-school', p.education?.school || "");

    // Presets
    setVal('preset-work-auth', p.presets?.workAuthorization || "Yes");
    setVal('preset-work-countries', p.presets?.workCountries || "");
    setVal('preset-require-sponsorship', p.presets?.requireSponsorship || "No");
    setVal('preset-notice', p.presets?.noticePeriod || "Immediately available");
    setVal('preset-salary', p.presets?.salaryExpectations || "");
    setVal('preset-relocate', p.presets?.willingToRelocate || "Open to Remote, Hybrid, or Relocation");
    setVal('preset-gender', p.presets?.gender || "Decline to state");
    setVal('preset-veteran', p.presets?.veteranStatus || "No, I am not a protected veteran");
    setVal('preset-disability', p.presets?.disabilityStatus || "No, I do not have a disability");

    // Engine Settings & Privacy
    setVal('setting-tone', p.settings?.answerTone || "Professional & Impactful");
    const badgeEl = byId('setting-floating-badge');
    if (badgeEl) badgeEl.checked = p.settings?.showFloatingBadge !== false;
    const captureEl = byId('setting-capture-typed');
    if (captureEl) captureEl.checked = p.settings?.captureTypedValues === true;
    const logValEl = byId('setting-log-values');
    if (logValEl) logValEl.checked = p.settings?.logFieldValues === true;
  }

  // 4. Save Profile Form
  async function saveForm() {
    if (!activeProfile) return;

    // Collect experience items in sequence
    const expCards = document.querySelectorAll('#experience-list .ap-exp-card');
    const items = [];
    expCards.forEach((card, idx) => {
      items.push({
        id: card.dataset.id || `exp-${Date.now()}-${idx}`,
        title: card.querySelector('.ap-exp-title')?.value.trim() || "",
        company: card.querySelector('.ap-exp-company')?.value.trim() || "",
        location: card.querySelector('.ap-exp-location')?.value.trim() || "",
        startDate: card.querySelector('.ap-exp-start')?.value.trim() || "",
        endDate: card.querySelector('.ap-exp-end')?.value.trim() || "",
        isCurrent: card.querySelector('.ap-exp-current')?.checked || false,
        description: card.querySelector('.ap-exp-desc')?.value.trim() || ""
      });
    });

    const firstName = getVal('prof-first-name').trim();
    const middleNameEl = byId('prof-middle-name');
    const middleName = middleNameEl ? middleNameEl.value.trim() : (activeProfile.personal?.middleName || "");
    const lastName = getVal('prof-last-name').trim();
    const fullNameParts = [firstName, middleName, lastName].filter(Boolean);
    const city = getVal('prof-city').trim();
    const state = getVal('prof-state').trim();

    activeProfile.personal = {
      ...activeProfile.personal,
      firstName,
      middleName,
      lastName,
      fullName: fullNameParts.length > 0 ? fullNameParts.join(" ") : `${firstName} ${lastName}`.trim(),
      email: getVal('prof-email').trim(),
      phone: getVal('prof-phone').trim(),
      address: getVal('prof-address').trim(),
      city,
      state,
      postalCode: getVal('prof-postal').trim(),
      country: getVal('prof-country').trim(),
      location: [city, state].filter(Boolean).join(", ")
    };

    activeProfile.links = {
      ...activeProfile.links,
      linkedin: getVal('prof-linkedin').trim(),
      github: getVal('prof-github').trim(),
      portfolio: getVal('prof-portfolio').trim()
    };

    activeProfile.experience = {
      ...activeProfile.experience,
      items: items.length > 0 ? items : (activeProfile.experience?.items || []),
      currentCompany: items[0]?.company || getVal('prof-company').trim(),
      currentTitle: items[0]?.title || getVal('prof-title').trim(),
      yearsOfExperience: getVal('prof-yoe').trim(),
      skills: getVal('prof-skills').trim()
    };

    activeProfile.education = {
      ...activeProfile.education,
      degree: getVal('prof-degree').trim(),
      school: getVal('prof-school').trim()
    };

    activeProfile.presets = {
      ...activeProfile.presets,
      workAuthorization: getVal('preset-work-auth', "Yes"),
      workCountries: getVal('preset-work-countries').trim(),
      requireSponsorship: getVal('preset-require-sponsorship', "No"),
      noticePeriod: getVal('preset-notice').trim(),
      salaryExpectations: getVal('preset-salary').trim(),
      willingToRelocate: getVal('preset-relocate').trim(),
      gender: getVal('preset-gender', "Decline to state"),
      veteranStatus: getVal('preset-veteran', "No, I am not a protected veteran"),
      disabilityStatus: getVal('preset-disability', "No, I do not have a disability")
    };

    activeProfile.settings = {
      ...activeProfile.settings,
      answerTone: getVal('setting-tone', "Professional & Impactful"),
      showFloatingBadge: byId('setting-floating-badge')?.checked !== false,
      captureTypedValues: byId('setting-capture-typed')?.checked === true,
      logFieldValues: byId('setting-log-values')?.checked === true,
      aiKnowledgeSync: false
    };

    // Saving real details is what marks onboarding complete and unlocks autofill.
    if (activeProfile.personal?.email && (activeProfile.personal?.firstName || activeProfile.personal?.fullName)) {
      activeProfile.onboardingComplete = true;
    }

    await StorageService.saveProfile(activeProfile);

    showStatus("Saved successfully!", "success");
    renderExperienceList(activeProfile.experience?.items || []);
  }

  byId('btn-save-profile')?.addEventListener('click', saveForm);

  // 5. Render Dynamic Knowledge Entities
  function renderDynamicFields(fields = []) {
    const container = document.getElementById('dynamic-categories-container');
    const countBadge = document.getElementById('dynamic-fields-count');
    if (!container) return;

    const allFields = fields || [];
    const filterQuery = (document.getElementById('df-search-input')?.value || "").toLowerCase().trim();

    let filtered = allFields;
    if (filterQuery) {
      filtered = allFields.filter(f => {
        const labelMatch = (f.label || "").toLowerCase().includes(filterQuery);
        const valMatch = (f.value || "").toLowerCase().includes(filterQuery);
        const catMatch = (f.category || "").toLowerCase().includes(filterQuery);
        const aliasMatch = (f.aliases || []).some(a => a.toLowerCase().includes(filterQuery));
        const nestedMatch = f.nestedDetails ? JSON.stringify(f.nestedDetails).toLowerCase().includes(filterQuery) : false;
        const companyMatch = f.companyAnswers ? JSON.stringify(f.companyAnswers).toLowerCase().includes(filterQuery) : false;
        return labelMatch || valMatch || catMatch || aliasMatch || nestedMatch || companyMatch;
      });
    }

    if (countBadge) countBadge.textContent = `${allFields.length} Fields`;
    container.innerHTML = '';

    if (!filtered.length) {
      container.innerHTML = `
        <div class="ap-text-muted" style="padding: 12px; text-align: center; font-size: 11.5px; background: var(--bg-hover); border-radius: 6px;">
          ${filterQuery ? 'No dynamic fields matching "' + escapeHtml(filterQuery) + '"' : 'No dynamic fields found. Add your first field above or let the feedback loop learn as you apply!'}
        </div>
      `;
      return;
    }

    // Group fields by category
    const grouped = {};
    filtered.forEach(f => {
      const cat = f.category || "Custom / Learned";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(f);
    });

    const categoryIcons = {
      "Education": "🎓",
      "Work History": "💼",
      "Company-Specific": "🏢",
      "General Application": "🌐",
      "Contact & Links": "🔗",
      "Custom / Learned": "🏷️"
    };

    Object.keys(grouped).forEach(catName => {
      const groupCard = document.createElement('div');
      groupCard.className = 'ap-card';
      groupCard.style.cssText = "margin-bottom: 8px; padding: 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;";

      const icon = categoryIcons[catName] || "📁";
      const itemsHtml = grouped[catName].map(f => {
        let nestedHtml = '';
        if (f.nestedDetails && typeof f.nestedDetails === 'object') {
          const subEntries = Object.entries(f.nestedDetails)
            .filter(([k]) => !k.endsWith('_meta'))
            .map(([k, v]) => {
              let displayVal = '';
              if (v && typeof v === 'object') {
                const head = [v.title, v.company].filter(Boolean).join(' @ ');
                const desc = v.roleDescription || v.description || '';
                if (head && desc) {
                  displayVal = `${head}: ${desc.slice(0, 75)}${desc.length > 75 ? '…' : ''}`;
                } else {
                  displayVal = head || (desc ? `${desc.slice(0, 90)}${desc.length > 90 ? '…' : ''}` : '') ||
                    Object.values(v).filter(x => x !== undefined && x !== null && typeof x !== 'object').join(' — ');
                }
              } else {
                displayVal = String(v ?? '');
              }
              return `<span style="background: rgba(99,102,241,0.08); color: var(--primary); padding: 1px 6px; border-radius: 4px; font-size: 10px;"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(displayVal)}</span>`;
            })
            .join(' ');
          if (subEntries) {
            nestedHtml = `<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">${subEntries}</div>`;
          }
        } else if (f.companyAnswers && typeof f.companyAnswers === 'object') {
          const compEntries = Object.entries(f.companyAnswers).map(([k, v]) => 
            `<span style="background: rgba(16,185,129,0.1); color: #059669; padding: 1px 6px; border-radius: 4px; font-size: 10px;"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</span>`
          ).join(' ');
          nestedHtml = `<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">${compEntries}</div>`;
        }

        const aliasChips = (f.aliases || []).slice(0, 5).map(a => 
          `<span style="background: var(--bg-hover); color: var(--text-muted); font-size: 9.5px; padding: 1px 5px; border-radius: 3px;">${escapeHtml(a)}</span>`
        ).join(' ');

        return `
          <div class="ap-field-item" style="display: flex; justify-content: space-between; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid var(--border); position: relative;">
            <div style="flex: 1; padding-right: 8px;">
              <div style="font-weight: 600; font-size: 11.5px; color: var(--text);">${escapeHtml(f.label)}</div>
              <div style="font-size: 11px; color: var(--text); margin-top: 2px;">${escapeHtml(f.value || "")}</div>
              ${nestedHtml}
              ${aliasChips ? `<div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px;">${aliasChips}</div>` : ""}
            </div>
            <button class="ap-field-del-btn ap-del-df-btn" data-id="${f.id}" title="Remove Field" style="font-size: 14px; background: none; border: none; cursor: pointer; color: var(--text-muted);">&times;</button>
          </div>
        `;
      }).join('');

      groupCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="font-size: 11.5px; color: var(--text);">${icon} ${escapeHtml(catName)}</strong>
          <span style="font-size: 10px; background: var(--bg-hover); padding: 1px 5px; border-radius: 4px; color: var(--text-muted);">${grouped[catName].length}</span>
        </div>
        <div style="display: flex; flex-direction: column;">
          ${itemsHtml}
        </div>
      `;

      groupCard.querySelectorAll('.ap-del-df-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.dataset.id;
          if (confirm("Delete this dynamic entity from knowledge base?")) {
            await StorageService.deleteDynamicField(id);
            await refreshProfile();
          }
        });
      });

      container.appendChild(groupCard);
    });
  }

  // Add Dynamic Field Handlers
  const btnToggleAddDf = document.getElementById('btn-toggle-add-df');
  const btnCancelAddDf = document.getElementById('btn-cancel-add-df');
  const dfAddForm = document.getElementById('df-add-form');

  if (btnToggleAddDf && dfAddForm) {
    btnToggleAddDf.addEventListener('click', () => {
      dfAddForm.style.display = dfAddForm.style.display === 'none' ? 'block' : 'none';
    });
  }

  if (btnCancelAddDf && dfAddForm) {
    btnCancelAddDf.addEventListener('click', () => {
      dfAddForm.style.display = 'none';
    });
  }

  const btnSubmitAddDf = document.getElementById('btn-submit-add-df');
  if (btnSubmitAddDf) {
    btnSubmitAddDf.addEventListener('click', async () => {
      const label = document.getElementById('df-new-label')?.value.trim();
      const category = document.getElementById('df-new-category')?.value || "General Application";
      const value = document.getElementById('df-new-value')?.value.trim();
      const aliasesRaw = document.getElementById('df-new-aliases')?.value.trim();

      if (!label || !value) {
        showStatus("Please provide at least a concept name and an answer value.", "error");
        return;
      }

      const aliases = aliasesRaw 
        ? aliasesRaw.split(/[,;]+/).map(a => a.trim().toLowerCase()).filter(Boolean)
        : [label.toLowerCase()];

      await StorageService.addDynamicField({
        label,
        category,
        value,
        aliases
      });

      if (document.getElementById('df-new-label')) document.getElementById('df-new-label').value = '';
      if (document.getElementById('df-new-value')) document.getElementById('df-new-value').value = '';
      if (document.getElementById('df-new-aliases')) document.getElementById('df-new-aliases').value = '';
      if (dfAddForm) dfAddForm.style.display = 'none';

      await refreshProfile();
    });
  }

  // Dynamic Fields search filter
  document.getElementById('df-search-input')?.addEventListener('input', () => {
    if (activeProfile) {
      renderDynamicFields(activeProfile.dynamicFields || []);
    }
  });

  // 7. Active Tab Inspection & Autofill
  function renderDetectedFieldsPreview(fieldPreview = []) {
    const listEl = byId('detected-fields-list');
    if (!listEl) return;

    if (!Array.isArray(fieldPreview) || fieldPreview.length === 0) {
      listEl.innerHTML = '<div class="ap-text-muted" style="padding: 8px 0;">No active form fields detected on this page.</div>';
      return;
    }

    listEl.innerHTML = fieldPreview.map((item) => {
      const badgeColor = item.matched ? '#059669' : '#d97706';
      const badgeBg = item.matched ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)';
      const badgeLabel = item.matched ? 'Matched' : 'Unmapped';
      return `
        <div class="ap-field-item">
          <div class="ap-field-item-content">
            <div class="ap-field-label">${escapeHtml(item.label || "Field")}</div>
          </div>
          <span style="background: ${badgeBg}; color: ${badgeColor}; font-weight: 700; font-size: 10px; padding: 2px 6px; border-radius: 99px; white-space: nowrap;">${badgeLabel}</span>
        </div>
      `;
    }).join('');
  }

  async function inspectActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;

    if (!tab) return;
    setText('ap-tab-url', tab.title || tab.url || "Current Page");

    const setEmptyState = () => {
      setText('stat-detected', "-");
      setText('stat-matched', "-");
      setText('stat-unmatched', "-");
      setText('detected-fields-count', "0");
      setText('current-portal-tag', "Auto-Detect");
      renderDetectedFieldsPreview([]);
    };

    try {
      chrome.tabs.sendMessage(tab.id, { action: "SCAN_FIELDS" }, (res) => {
        if (chrome.runtime?.lastError || !res) {
          setEmptyState();
          return;
        }

        const total = res.total || 0;
        const matched = res.matchedCount || 0;
        const unmatched = res.unmatchedCount || 0;
        const portal = res.portalType && res.portalType !== 'generic'
          ? res.portalType.toUpperCase()
          : 'Auto-Detect';

        setText('stat-detected', total);
        setText('stat-matched', matched);
        setText('stat-unmatched', unmatched);
        setText('detected-fields-count', total);
        setText('current-portal-tag', portal);
        renderDetectedFieldsPreview(res.fieldPreview || []);
      });
    } catch (e) {
      console.warn("Could not inspect tab:", e);
      setEmptyState();
    }
  }

  // Autofill Button
  byId('btn-autofill-page')?.addEventListener('click', async () => {
    if (!currentTab?.id) return;
    const btn = byId('btn-autofill-page');
    if (btn) btn.textContent = "Filling...";

    chrome.tabs.sendMessage(currentTab.id, { action: "AUTOFILL" }, (res) => {
      if (btn) {
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          Autofill Application Now
        `;
      }

      if (chrome.runtime?.lastError) {
        showStatus("Open a job application page and reload it to autofill.", "error");
        return;
      }

      if (res && res.filledCount !== undefined) {
        showStatus(`Filled ${res.filledCount} fields on this page.`, "success");
        inspectActiveTab();
      } else {
        showStatus("No fillable inputs detected, or the form is already filled.", "info");
      }
    });
  });

  // Review Unmatched Fields Button
  byId('btn-scan-unmatched')?.addEventListener('click', async () => {
    if (!currentTab?.id) return;
    chrome.tabs.sendMessage(currentTab.id, { action: "SUGGEST_UNMATCHED" }, () => {
      void chrome.runtime?.lastError;
      window.close(); // Close popup so user sees in-page card
    });
  });

  // Capture & Remember Page Details Button
  const captureBtn = byId('btn-capture-page');
  if (captureBtn) {
    captureBtn.addEventListener('click', async () => {
      if (!currentTab?.id) return;
      captureBtn.textContent = "Capturing...";
      chrome.tabs.sendMessage(currentTab.id, { action: "CAPTURE_PAGE_FIELDS" }, async (res) => {
        captureBtn.textContent = "📥 Capture & Remember Page Details";
        if (chrome.runtime?.lastError) {
          showStatus("Could not read this tab. Reload the application page and try again.", "error");
          return;
        }
        if (res && res.capturedCount !== undefined) {
          showStatus(`Captured and saved ${res.capturedCount} fields.`, "success");
          await refreshProfile();
          inspectActiveTab();
        } else {
          showStatus("Everything on this page is already in your profile.", "info");
        }
      });
    });
  }

  // 8. Resume Ingestion (File Drop & Text Paste - 100% Offline)
  const dropzone = byId('resume-dropzone');
  const fileInput = byId('resume-file-input');
  const statusEl = byId('resume-file-status');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      handleResumeFile(file);
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "var(--primary)";
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = "#cbd5e1";
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "#cbd5e1";
      if (e.dataTransfer?.files?.[0]) {
        handleResumeFile(e.dataTransfer.files[0]);
      }
    });
  }

  async function handleResumeFile(file) {
    if (!statusEl || !file) return;
    statusEl.style.display = "block";
    statusEl.textContent = `Reading ${file.name}...`;
    statusEl.style.color = "var(--primary)";

    try {
      let extractedText = "";
      if (window.PdfExtractor) {
        extractedText = await window.PdfExtractor.extractText(file);
      }

      if (extractedText && extractedText.length > 20) {
        statusEl.textContent = "Parsing profile with Intelligent Engine (Offline & Private)...";

        if (window.DeterministicResumeParser && typeof window.DeterministicResumeParser.parse === 'function') {
          try {
            const parsed = window.DeterministicResumeParser.parse(extractedText);
            if (parsed && (
              parsed.personal?.fullName ||
              parsed.personal?.email ||
              parsed.experience?.items?.length ||
              parsed.education?.items?.length ||
              parsed.experience?.skills
            )) {
              await applyParsedResume(parsed);
              statusEl.textContent = `✓ Successfully parsed ${file.name} with Intelligent Engine!`;
              statusEl.style.color = "var(--success)";
              return;
            }
          } catch (offlineErr) {
            console.warn("Offline parser encountered error, falling back to background:", offlineErr);
          }
        }

        chrome.runtime.sendMessage({
          action: "PARSE_RESUME_TEXT",
          resumeText: extractedText
        }, async (res) => {
          if (chrome.runtime?.lastError) {
            statusEl.textContent = chrome.runtime.lastError.message || "Error parsing resume text.";
            statusEl.style.color = "var(--danger)";
            return;
          }
          if (res && res.parsed) {
            await applyParsedResume(res.parsed);
            statusEl.textContent = `✓ Successfully parsed ${file.name} into your profile!`;
            statusEl.style.color = "var(--success)";
          } else {
            statusEl.textContent = res?.error || "Error parsing resume text.";
            statusEl.style.color = "var(--danger)";
          }
        });
        return;
      }
    } catch (extractErr) {
      console.warn("Client-side text extraction had error:", extractErr);
    }

    const mimeType = file.type || "application/pdf";
    if (mimeType.startsWith("image/")) {
      statusEl.textContent = "Image files cannot be parsed offline. Please upload a PDF/TXT resume or paste your resume text below.";
      statusEl.style.color = "var(--warn)";
      byId('resume-text-input')?.focus();
      return;
    }

    // Scanned image-only PDF without embedded text
    statusEl.textContent = "No readable text detected in this PDF (it might be a scanned image or protected). Please paste your resume text in the box below.";
    statusEl.style.color = "var(--warn)";
    byId('resume-text-input')?.focus();
  }

  // Parse Text Resume
  byId('btn-parse-resume-text')?.addEventListener('click', async () => {
    const text = getVal('resume-text-input').trim();
    if (!text) {
      showStatus("Please paste your resume text first.", "error");
      return;
    }

    const btn = byId('btn-parse-resume-text');
    const resetLabel = "⚡ Parse & Import Resume Text";
    if (btn) {
      btn.textContent = "Parsing with Intelligent Engine...";
      btn.disabled = true;
    }

    if (window.DeterministicResumeParser && typeof window.DeterministicResumeParser.parse === 'function') {
      try {
        const parsed = window.DeterministicResumeParser.parse(text);
        if (parsed && (parsed.personal?.fullName || parsed.personal?.email || parsed.experience?.items?.length || parsed.education?.items?.length)) {
          await applyParsedResume(parsed);
          if (btn) {
            btn.textContent = resetLabel;
            btn.disabled = false;
          }
          showStatus("Resume parsed offline. Your profile has been updated.", "success");
          return;
        }
      } catch (offlineErr) {
        console.warn("Local resume parse fallback to background:", offlineErr);
      }
    }

    chrome.runtime.sendMessage({
      action: "PARSE_RESUME_TEXT",
      resumeText: text
    }, async (res) => {
      if (btn) {
        btn.textContent = resetLabel;
        btn.disabled = false;
      }

      if (chrome.runtime?.lastError) {
        showStatus(chrome.runtime.lastError.message || "Could not parse that resume text.", "error");
        return;
      }

      if (res && res.parsed) {
        await applyParsedResume(res.parsed);
        showStatus("Resume parsed. Your profile has been updated.", "success");
      } else {
        showStatus(res?.error || "Could not parse that resume text.", "error");
      }
    });
  });

  function mergeNonEmpty(base = {}, incoming = {}) {
    const out = { ...base };
    for (const [k, v] of Object.entries(incoming || {})) {
      if (typeof v === 'string') {
        if (v.trim()) out[k] = v.trim();
      } else if (v !== undefined && v !== null) {
        out[k] = v;
      }
    }
    return out;
  }

  async function applyParsedResume(parsed) {
    if (parsed.personal) {
      activeProfile.personal = mergeNonEmpty(activeProfile.personal, parsed.personal);
      // Clear stale region/state if new location specifies City+Country without a State (e.g. "Bengaluru, India")
      if (parsed.personal.location && !parsed.personal.state && parsed.personal.country) {
        activeProfile.personal.state = "";
      }
    }
    if (parsed.links) {
      activeProfile.links = mergeNonEmpty(activeProfile.links, parsed.links);
    }
    if (parsed.experience) {
      const existingItems = activeProfile.experience?.items || [];
      activeProfile.experience = mergeNonEmpty(activeProfile.experience, parsed.experience);
      if (Array.isArray(parsed.experience.items) && parsed.experience.items.length > 0) {
        activeProfile.experience.items = parsed.experience.items;
        activeProfile.experience.currentCompany = parsed.experience.items[0].company || activeProfile.experience.currentCompany || "";
        activeProfile.experience.currentTitle = parsed.experience.items[0].title || activeProfile.experience.currentTitle || "";
      } else {
        activeProfile.experience.items = existingItems;
      }
    }
    if (parsed.education) {
      const existingEduItems = activeProfile.education?.items || [];
      activeProfile.education = mergeNonEmpty(activeProfile.education, parsed.education);
      if (Array.isArray(parsed.education.items) && parsed.education.items.length > 0) {
        activeProfile.education.items = parsed.education.items;
      } else {
        activeProfile.education.items = existingEduItems;
      }
    }

    // Synchronize Dynamic Knowledge Store entities so Knowledge & Autofill match the parsed resume
    activeProfile.dynamicFields = activeProfile.dynamicFields || [];
    const syncDynamicValue = (canonicalKey, newValue) => {
      if (!newValue) return;
      const idx = activeProfile.dynamicFields.findIndex(df => df.canonicalKey === canonicalKey);
      if (idx >= 0) {
        activeProfile.dynamicFields[idx].value = newValue;
      }
    };

    syncDynamicValue('experience.currentCompany', activeProfile.experience?.currentCompany);
    syncDynamicValue('experience.currentTitle', activeProfile.experience?.currentTitle);
    syncDynamicValue('links.linkedin', activeProfile.links?.linkedin);
    syncDynamicValue('links.github', activeProfile.links?.github);
    syncDynamicValue('links.portfolio', activeProfile.links?.portfolio);

    if (activeProfile.education?.school || activeProfile.education?.degree || activeProfile.education?.fieldOfStudy) {
      const eduIdx = activeProfile.dynamicFields.findIndex(df =>
        df.canonicalKey === 'education.highest' ||
        df.id === 'df-edu-highest' ||
        (df.category === 'Education' && /higher education|highest degree/i.test(df.label || ''))
      );
      if (eduIdx >= 0) {
        const edu = activeProfile.education;
        activeProfile.dynamicFields[eduIdx].value = [edu.school, edu.degree, edu.fieldOfStudy].filter(Boolean).join(" — ");
        activeProfile.dynamicFields[eduIdx].nestedDetails = {
          ...(activeProfile.dynamicFields[eduIdx].nestedDetails || {}),
          institution: edu.school || "",
          college: edu.school || "",
          degree: edu.degree || "",
          major: edu.fieldOfStudy || "",
          fieldOfStudy: edu.fieldOfStudy || "",
          graduationYear: edu.graduationYear || "",
          gpa: edu.gpa || ""
        };
      }
    }

    if (Array.isArray(parsed.experience?.items) && parsed.experience.items.length > 0) {
      const nestedRoleDescriptions = {};
      parsed.experience.items.forEach((item, idx) => {
        if (item.description) {
          nestedRoleDescriptions[`Work Experience ${idx + 1}`] = {
            company: item.company || "",
            title: item.title || "",
            roleDescription: item.description,
            sectionIndex: idx
          };
        }
      });

      const roleDescIdx = activeProfile.dynamicFields.findIndex(df => df.canonicalKey === "experience.role_descriptions");
      if (roleDescIdx >= 0) {
        activeProfile.dynamicFields[roleDescIdx].nestedDetails = nestedRoleDescriptions;
        activeProfile.dynamicFields[roleDescIdx].value = parsed.experience.items[0]?.description || "";
      } else if (Object.keys(nestedRoleDescriptions).length > 0) {
        activeProfile.dynamicFields.push({
          id: "df-exp-role-descriptions",
          category: "Work Experience",
          canonicalKey: "experience.role_descriptions",
          label: "Work Experience Role Descriptions",
          aliases: [
            "role description",
            "job description",
            "responsibilities",
            "description of duties",
            "work experience description",
            "summary of duties"
          ],
          value: parsed.experience.items[0]?.description || "",
          nestedDetails: nestedRoleDescriptions,
          stats: { timesSuggested: 0, timesAccepted: 0, timesCorrected: 0, confidence: 1.0 }
        });
      }
    }

    if (parsed.suggestedCustomFields && Array.isArray(parsed.suggestedCustomFields)) {
      activeProfile.customFields = activeProfile.customFields || [];
      parsed.suggestedCustomFields.forEach(scf => {
        if (scf.label && scf.value) {
          const existingCf = activeProfile.customFields.find(
            cf => (cf.label || "").toLowerCase() === scf.label.toLowerCase()
          );
          if (existingCf) {
            existingCf.value = scf.value;
          } else {
            activeProfile.customFields.push({
              id: "cf-" + Date.now() + Math.random().toString(36).substr(2, 4),
              label: scf.label,
              value: scf.value,
              keywords: scf.keywords || [scf.label.toLowerCase()]
            });
          }
        }
      });
    }

    if (activeProfile.personal?.email && (activeProfile.personal?.firstName || activeProfile.personal?.fullName)) {
      activeProfile.onboardingComplete = true;
    }

    await StorageService.saveProfile(activeProfile);
    populateForm(activeProfile);
    renderExperienceList(activeProfile.experience?.items || []);
    renderDynamicFields(activeProfile.dynamicFields || []);
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // 10. Audit Logger & Activity UI
  async function renderAuditLogs() {
    const logs = await AuditLogger.getLogs();
    const stats = await AuditLogger.getStats();
    const syncQueue = (await StorageService.getPendingSyncQueue()) || [];

    // Update stats metrics
    setText('log-stat-autofills', stats.totalAutofills);
    setText('log-stat-captures', stats.totalManualCaptures);
    setText('log-stat-errors', stats.totalErrors);
    setText('log-stat-success-rate', `${stats.successRate} Success`);

    // Calculate deep fill metrics from recent telemetry and corrections
    let compulsoryFilled = 0;
    let compulsoryUnfilled = 0;
    let optionalFilled = 0;
    let optionalUnfilled = 0;
    let userCorrections = 0;

    userCorrections = syncQueue.filter(item => item.type === 'user_correction').length;
    logs.forEach(l => {
      if (l.actionType === 'user_correction' || (l.actionType === 'manual_entry' && (l.details || '').includes('User corrected'))) {
        userCorrections++;
      }
    });

    const latestTelemetry = [...syncQueue].reverse().find(i => i.type === 'autofill_telemetry' && i.metrics);
    if (latestTelemetry && latestTelemetry.metrics) {
      compulsoryFilled = latestTelemetry.metrics.compulsoryFilled || 0;
      compulsoryUnfilled = latestTelemetry.metrics.compulsoryUnfilled || 0;
      optionalFilled = latestTelemetry.metrics.optionalFilled || 0;
      optionalUnfilled = latestTelemetry.metrics.optionalUnfilled || 0;
    } else {
      compulsoryFilled = stats.totalAutofills;
      optionalFilled = Math.max(0, Math.floor(stats.totalAutofills * 0.25));
      compulsoryUnfilled = stats.totalErrors;
      optionalUnfilled = stats.totalSkipped;
    }

    setText('log-stat-compulsory', `${compulsoryFilled} Filled`);
    setText('log-stat-compulsory-unfilled', `${compulsoryUnfilled} Unfilled`);
    setText('log-stat-optional', `${optionalFilled} Filled`);
    setText('log-stat-optional-unfilled', `${optionalUnfilled} Skipped`);
    setText('log-stat-corrections', String(userCorrections));

    const feedEl = byId('audit-log-feed');
    if (!feedEl) return;
    const filterQuery = getVal('log-filter-input').toLowerCase().trim();

    let filtered = logs;
    if (filterQuery) {
      filtered = logs.filter(l =>
        (l.fieldLabel && l.fieldLabel.toLowerCase().includes(filterQuery)) ||
        (l.domain && l.domain.toLowerCase().includes(filterQuery)) ||
        (l.portalType && l.portalType.toLowerCase().includes(filterQuery)) ||
        (l.actionType && l.actionType.toLowerCase().includes(filterQuery)) ||
        (l.details && l.details.toLowerCase().includes(filterQuery))
      );
    }

    if (!filtered || filtered.length === 0) {
      feedEl.innerHTML = `<div class="ap-text-muted" style="padding: 8px 0;">No matching activity logged.</div>`;
      return;
    }

    feedEl.innerHTML = filtered.slice(0, 100).map(item => {
      const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      let badgeColor = "var(--primary)";
      let badgeLabel = "Autofilled";
      if (item.status === 'error') {
        badgeColor = "#ef4444";
        badgeLabel = "Error";
      } else if (item.actionType === 'user_correction') {
        badgeColor = "#0ea5e9";
        badgeLabel = "Corrected";
      } else if (item.actionType === 'user_cleared_field') {
        badgeColor = "#f59e0b";
        badgeLabel = "Cleared";
      } else if (item.actionType === 'ai_suggest') {
        badgeColor = "#6366f1";
        badgeLabel = "Assisted";
      } else if (item.actionType === 'background_sync') {
        badgeColor = "#14b8a6";
        badgeLabel = "Consolidated";
      } else if (item.actionType === 'manual_entry') {
        badgeColor = "#10b981";
        badgeLabel = "Manual";
      } else if (item.actionType === 'page_learned') {
        badgeColor = "#8b5cf6";
        badgeLabel = "Learned";
      } else if (item.actionType === 'skipped') {
        badgeColor = "#f59e0b";
        badgeLabel = "Skipped";
      }

      return `
        <div style="background: var(--bg-hover); padding: 8px; border-radius: 6px; border-left: 3px solid ${badgeColor}; display: flex; flex-direction: column; gap: 3px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="background: ${badgeColor}20; color: ${badgeColor}; font-weight: 700; font-size: 9.5px; padding: 1px 5px; border-radius: 4px;">${badgeLabel}</span>
              <span style="font-weight: 600; font-size: 11px; color: var(--text);">${escapeHtml(item.fieldLabel || item.matchedKey || "Field")}</span>
            </div>
            <span style="font-size: 9.5px; color: var(--text-muted);">${timeStr}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted);">
            <span>${escapeHtml(item.domain || item.portalType || "Portal")}</span>
            ${item.valueSet ? `<span style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text);">"${escapeHtml(item.valueSet)}"</span>` : ""}
          </div>
          ${item.details ? `<div style="font-size: 9.5px; color: var(--text-muted); font-style: italic;">${escapeHtml(item.details)}</div>` : ""}
        </div>
      `;
    }).join('');
  }

  // 11. Ignored Fields List Rendering
  function renderIgnoredFields() {
    const listEl = byId('ignored-fields-list');
    const ignored = activeProfile?.ignoredOptionalFields || [];

    setText('ignored-fields-count', ignored.length);
    if (!listEl) return;

    if (!ignored || ignored.length === 0) {
      listEl.innerHTML = `<div class="ap-text-muted" style="font-size: 11px; padding: 4px 0;">No ignored optional fields yet.</div>`;
      return;
    }

    listEl.innerHTML = ignored.map(item => `
      <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-hover); padding: 6px 8px; border-radius: 4px;">
        <span style="font-size: 11px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;" title="${escapeHtml(item.label)}">
          🚫 ${escapeHtml(item.label)}
        </span>
        <button class="ap-btn-unignore ap-btn ap-btn-outline ap-btn-sm" data-id="${escapeHtml(item.id || item.label)}" style="font-size: 10px; padding: 2px 6px;">
          Un-ignore
        </button>
      </div>
    `).join('');

    listEl.querySelectorAll('.ap-btn-unignore').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget?.dataset?.id || e.target?.dataset?.id;
        await StorageService.removeIgnoredOptionalField(id);
        activeProfile = await StorageService.getProfile();
        renderIgnoredFields();
      });
    });
  }

  // Export JSON Button
  byId('btn-export-logs-json')?.addEventListener('click', async () => {
    const jsonStr = await AuditLogger.exportJSON();
    const dateStr = new Date().toISOString().split('T')[0];
    downloadFile(jsonStr, `applypilot-audit-log-${dateStr}.json`, 'application/json');
  });

  // Export CSV Button
  byId('btn-export-logs-csv')?.addEventListener('click', async () => {
    const csvStr = await AuditLogger.exportCSV();
    const dateStr = new Date().toISOString().split('T')[0];
    downloadFile(csvStr, `applypilot-audit-log-${dateStr}.csv`, 'text/csv');
  });

  // Clear Logs Button
  byId('btn-clear-logs')?.addEventListener('click', async () => {
    if (confirm("Clear all ApplyPilot activity and audit logs?")) {
      await AuditLogger.clearLogs();
      renderAuditLogs();
    }
  });

  // Consolidate Learned Memory Now Button (Offline Local Engine)
  const btnSyncMemory = byId('btn-sync-ai-memory');
  if (btnSyncMemory) {
    btnSyncMemory.addEventListener('click', async () => {
      btnSyncMemory.disabled = true;
      const originalHtml = btnSyncMemory.innerHTML;
      btnSyncMemory.innerHTML = `<span>⏳ Consolidating local memory...</span>`;

      chrome.runtime.sendMessage({ action: "TRIGGER_BACKGROUND_SYNC_NOW" }, async (res) => {
        if (chrome.runtime?.lastError) {
          btnSyncMemory.innerHTML = `<span>ℹ️ ${escapeHtml(chrome.runtime.lastError.message || "Could not reach background engine")}</span>`;
        } else if (res && res.success) {
          btnSyncMemory.innerHTML = `<span>✓ Consolidated (${res.processedCount || 0} items)!</span>`;
          await refreshProfile();
          await renderAuditLogs();
        } else {
          btnSyncMemory.innerHTML = `<span>ℹ️ ${escapeHtml(res?.message || res?.error || "Memory queue is already empty")}</span>`;
        }
        setTimeout(() => {
          btnSyncMemory.innerHTML = originalHtml;
          btnSyncMemory.disabled = false;
        }, 3000);
      });
    });
  }

  // Log filter search input
  byId('log-filter-input')?.addEventListener('input', () => {
    renderAuditLogs();
  });

  // Inline, non-blocking status messaging. Modal alert() dialogs block the whole
  // browser and read as spammy inside an extension popup.
  let statusResetTimer = null;
  function showStatus(message, kind = "info") {
    const el = byId('save-status');
    if (!el) return;
    const colors = { success: "var(--success)", error: "#b91c1c", info: "var(--text-muted)" };
    el.textContent = message;
    el.style.color = colors[kind] || colors.info;
    clearTimeout(statusResetTimer);
    statusResetTimer = setTimeout(() => {
      el.textContent = "All changes saved locally";
      el.style.color = "var(--text-muted)";
    }, 4000);
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

  // Data controls: explicit, user-initiated sample load and full erase.
  const btnLoadSample = byId('btn-load-sample');
  if (btnLoadSample) {
    btnLoadSample.addEventListener('click', async () => {
      if (!confirm("Replace your current profile with the sample data?")) return;
      await StorageService.loadSampleProfile();
      await refreshProfile();
      showStatus("Sample profile loaded.", "success");
    });
  }

  const btnResetProfile = byId('btn-reset-profile');
  if (btnResetProfile) {
    btnResetProfile.addEventListener('click', async () => {
      if (!confirm("Erase your profile, learned answers and activity log from this browser? This cannot be undone.")) return;
      await StorageService.resetProfile();
      await AuditLogger.clearLogs();
      await refreshProfile();
      renderAuditLogs();
      showStatus("All local data erased.", "success");
    });
  }

  // Initial load
  await refreshProfile();
  await inspectActiveTab();

  // Nudge first-run users to fill in their details before autofill can do anything.
  if (activeProfile && !activeProfile.onboardingComplete && !activeProfile.personal?.email) {
    showStatus("Add your details below (or parse a resume) to enable autofill.", "info");
    switchToTab('tab-profile');
  }
});
