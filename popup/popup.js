// ApplyPilot AI - Popup Logic

document.addEventListener('DOMContentLoaded', async () => {
  let activeProfile = null;
  let currentTab = null;

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
    const targetContent = document.getElementById(tabId);
    if (targetTabBtn) targetTabBtn.classList.add('active');
    if (targetContent) targetContent.classList.add('active');
    if (tabId === 'tab-logs') {
      renderAuditLogs();
      renderIgnoredFields();
    }
  }

  // Header Settings Button
  document.getElementById('btn-header-settings').addEventListener('click', () => {
    switchToTab('tab-settings');
  });

  // 2. Open Sidepanel Button
  document.getElementById('btn-open-sidepanel').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      window.close();
    }
  });

  // Quick API Key Save Button
  document.getElementById('btn-quick-save-key').addEventListener('click', async () => {
    const key = document.getElementById('quick-api-key').value.trim();
    if (!key) {
      alert("Please paste your Gemini API key first.");
      return;
    }
    await StorageService.saveApiKey(key);
    document.getElementById('setting-api-key').value = key;
    document.getElementById('api-key-banner').style.display = 'none';
    const statusEl = document.getElementById('save-status');
    statusEl.textContent = "Gemini API key saved!";
    statusEl.style.color = "var(--success)";
    setTimeout(() => {
      statusEl.textContent = "All changes saved locally";
      statusEl.style.color = "var(--text-muted)";
    }, 2500);
    await refreshProfile();
  });

  // Test API Key Connection Button
  document.getElementById('btn-test-api-key').addEventListener('click', async () => {
    const key = document.getElementById('setting-api-key').value.trim();
    const resultBox = document.getElementById('api-test-result');
    const btn = document.getElementById('btn-test-api-key');

    if (!key) {
      alert("Please enter your Gemini API key in the input box first.");
      return;
    }

    btn.textContent = "⏳ Testing Connection...";
    btn.disabled = true;
    resultBox.style.display = "block";
    resultBox.style.background = "#f8fafc";
    resultBox.style.color = "#475569";
    resultBox.textContent = "Querying Google Generative Language API...";

    chrome.runtime.sendMessage({
      action: "TEST_API_KEY",
      apiKey: key
    }, (res) => {
      btn.textContent = "⚡ Test API Connection";
      btn.disabled = false;

      if (res && res.success) {
        resultBox.style.background = "#ecfdf5";
        resultBox.style.color = "#065f46";
        resultBox.style.border = "1px solid #a7f3d0";
        resultBox.innerHTML = `<strong>✓ Connection Verified!</strong><br>${res.message}<br>Active Model: <code>${res.selectedModel}</code>`;
      } else {
        resultBox.style.background = "#fef2f2";
        resultBox.style.color = "#991b1b";
        resultBox.style.border = "1px solid #fecaca";
        resultBox.innerHTML = `<strong>❌ Connection Failed:</strong><br>${escapeHtml(res?.error || "Unknown error")}`;
      }
    });
  });

  // 3. Load Profile
  async function refreshProfile() {
    activeProfile = await StorageService.getProfile();
    populateForm(activeProfile);
    renderExperienceList(activeProfile.experience?.items || []);
    renderDynamicFields(activeProfile.dynamicFields || []);
    updateSummary(activeProfile);
    renderIgnoredFields();
  }

  function updateSummary(p) {
    const sumName = document.getElementById('sum-name');
    if (sumName) sumName.textContent = p.personal?.fullName || "Not set";
    const sumRole = document.getElementById('sum-role');
    if (sumRole) {
      sumRole.textContent = p.experience?.currentTitle 
        ? `${p.experience.currentTitle}${p.experience.currentCompany ? ` (${p.experience.currentCompany})` : ""}`
        : "Not set";
    }
    const sumNotice = document.getElementById('sum-notice');
    if (sumNotice) sumNotice.textContent = p.presets?.noticePeriod || p.experience?.noticePeriod || "Immediately available";
    const sumAuth = document.getElementById('sum-auth');
    if (sumAuth) sumAuth.textContent = `${p.presets?.workAuthorization || "Authorized"} (Sponsorship: ${p.presets?.requireSponsorship || "No"})`;
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
    document.getElementById('prof-first-name').value = p.personal?.firstName || "";
    document.getElementById('prof-last-name').value = p.personal?.lastName || "";
    document.getElementById('prof-email').value = p.personal?.email || "";
    document.getElementById('prof-phone').value = p.personal?.phone || "";
    document.getElementById('prof-address').value = p.personal?.address || "";
    document.getElementById('prof-city').value = p.personal?.city || "";
    document.getElementById('prof-state').value = p.personal?.state || "";
    document.getElementById('prof-postal').value = p.personal?.postalCode || "";
    document.getElementById('prof-country').value = p.personal?.country || "";

    // Links
    document.getElementById('prof-linkedin').value = p.links?.linkedin || "";
    document.getElementById('prof-github').value = p.links?.github || "";
    document.getElementById('prof-portfolio').value = p.links?.portfolio || "";

    // Experience & Education
    document.getElementById('prof-company').value = p.experience?.currentCompany || "";
    document.getElementById('prof-title').value = p.experience?.currentTitle || "";
    document.getElementById('prof-yoe').value = p.experience?.yearsOfExperience || "";
    document.getElementById('prof-skills').value = p.experience?.skills || "";
    document.getElementById('prof-degree').value = p.education?.degree || "";
    document.getElementById('prof-school').value = p.education?.school || "";

    // Presets
    document.getElementById('preset-work-auth').value = p.presets?.workAuthorization || "Yes";
    const workCountriesEl = document.getElementById('preset-work-countries');
    if (workCountriesEl) workCountriesEl.value = p.presets?.workCountries || "";
    document.getElementById('preset-require-sponsorship').value = p.presets?.requireSponsorship || "No";
    document.getElementById('preset-notice').value = p.presets?.noticePeriod || "Immediately available";
    document.getElementById('preset-salary').value = p.presets?.salaryExpectations || "";
    document.getElementById('preset-relocate').value = p.presets?.willingToRelocate || "Open to Remote, Hybrid, or Relocation";
    document.getElementById('preset-gender').value = p.presets?.gender || "Decline to state";
    document.getElementById('preset-veteran').value = p.presets?.veteranStatus || "No, I am not a protected veteran";
    document.getElementById('preset-disability').value = p.presets?.disabilityStatus || "No, I do not have a disability";

    // AI & Settings
    const apiKey = p.settings?.geminiApiKey || "";
    document.getElementById('setting-api-key').value = apiKey;
    let currentModel = p.settings?.model || "gemini-3.6-flash";
    if (currentModel.includes("2.5") || currentModel.includes("2.0") || currentModel.includes("1.5")) {
      currentModel = "gemini-3.6-flash";
      if (activeProfile && activeProfile.settings) {
        activeProfile.settings.model = currentModel;
        StorageService.saveProfile(activeProfile);
      }
    }
    document.getElementById('setting-model').value = currentModel;
    document.getElementById('setting-tone').value = p.settings?.answerTone || "Technical & Impactful";
    document.getElementById('setting-floating-badge').checked = p.settings?.showFloatingBadge !== false;

    // Show instant banner if API key is not yet configured
    const banner = document.getElementById('api-key-banner');
    if (banner) {
      banner.style.display = apiKey ? 'none' : 'block';
    }
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

    activeProfile.personal = {
      ...activeProfile.personal,
      firstName: document.getElementById('prof-first-name').value.trim(),
      lastName: document.getElementById('prof-last-name').value.trim(),
      fullName: `${document.getElementById('prof-first-name').value.trim()} ${document.getElementById('prof-last-name').value.trim()}`.trim(),
      email: document.getElementById('prof-email').value.trim(),
      phone: document.getElementById('prof-phone').value.trim(),
      address: document.getElementById('prof-address').value.trim(),
      city: document.getElementById('prof-city').value.trim(),
      state: document.getElementById('prof-state').value.trim(),
      postalCode: document.getElementById('prof-postal').value.trim(),
      country: document.getElementById('prof-country').value.trim(),
      location: `${document.getElementById('prof-city').value.trim()}, ${document.getElementById('prof-state').value.trim()}`
    };

    activeProfile.links = {
      linkedin: document.getElementById('prof-linkedin').value.trim(),
      github: document.getElementById('prof-github').value.trim(),
      portfolio: document.getElementById('prof-portfolio').value.trim()
    };

    activeProfile.experience = {
      ...activeProfile.experience,
      items: items.length > 0 ? items : (activeProfile.experience?.items || []),
      currentCompany: items[0]?.company || document.getElementById('prof-company').value.trim(),
      currentTitle: items[0]?.title || document.getElementById('prof-title').value.trim(),
      yearsOfExperience: document.getElementById('prof-yoe').value.trim(),
      skills: document.getElementById('prof-skills').value.trim()
    };

    activeProfile.education = {
      ...activeProfile.education,
      degree: document.getElementById('prof-degree').value.trim(),
      school: document.getElementById('prof-school').value.trim()
    };

    activeProfile.presets = {
      ...activeProfile.presets,
      workAuthorization: document.getElementById('preset-work-auth').value,
      workCountries: document.getElementById('preset-work-countries')?.value.trim() || "",
      requireSponsorship: document.getElementById('preset-require-sponsorship').value,
      noticePeriod: document.getElementById('preset-notice').value.trim(),
      salaryExpectations: document.getElementById('preset-salary').value.trim(),
      willingToRelocate: document.getElementById('preset-relocate').value.trim(),
      gender: document.getElementById('preset-gender').value,
      veteranStatus: document.getElementById('preset-veteran').value,
      disabilityStatus: document.getElementById('preset-disability').value
    };

    activeProfile.settings = {
      ...activeProfile.settings,
      geminiApiKey: document.getElementById('setting-api-key').value.trim(),
      model: document.getElementById('setting-model').value,
      answerTone: document.getElementById('setting-tone').value,
      showFloatingBadge: document.getElementById('setting-floating-badge').checked
    };

    await StorageService.saveProfile(activeProfile);

    const statusEl = document.getElementById('save-status');
    statusEl.textContent = "Saved successfully!";
    statusEl.style.color = "var(--success)";
    setTimeout(() => {
      statusEl.textContent = "All changes saved locally";
      statusEl.style.color = "var(--text-muted)";
    }, 2000);

    updateSummary(activeProfile);
    renderExperienceList(activeProfile.experience?.items || []);
  }

  document.getElementById('btn-save-profile').addEventListener('click', saveForm);

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
          const subEntries = Object.entries(f.nestedDetails).map(([k, v]) => 
            `<span style="background: rgba(99,102,241,0.08); color: var(--primary); padding: 1px 6px; border-radius: 4px; font-size: 10px;"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</span>`
          ).join(' ');
          nestedHtml = `<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">${nestedHtml ? nestedHtml + ' ' : ''}${subEntries}</div>`;
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
        alert("Please provide at least a concept name / label and primary answer value.");
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
  async function inspectActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;

    if (!tab) return;
    document.getElementById('ap-tab-url').textContent = tab.title || tab.url || "Current Page";

    try {
      chrome.tabs.sendMessage(tab.id, { action: "SCAN_FIELDS" }, (res) => {
        if (chrome.runtime.lastError || !res) {
          document.getElementById('stat-detected').textContent = "-";
          document.getElementById('stat-matched').textContent = "-";
          document.getElementById('stat-unmatched').textContent = "-";
          return;
        }

        document.getElementById('stat-detected').textContent = res.total || 0;
        document.getElementById('stat-matched').textContent = res.matchedCount || 0;
        document.getElementById('stat-unmatched').textContent = res.unmatchedCount || 0;
      });
    } catch (e) {
      console.warn("Could not inspect tab:", e);
    }
  }

  // Autofill Button
  document.getElementById('btn-autofill-page').addEventListener('click', async () => {
    if (!currentTab?.id) return;
    const btn = document.getElementById('btn-autofill-page');
    btn.textContent = "Filling...";

    chrome.tabs.sendMessage(currentTab.id, { action: "AUTOFILL" }, (res) => {
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
        </svg>
        Autofill Application Now
      `;

      if (res && res.filledCount !== undefined) {
        alert(`ApplyPilot AI: Successfully filled ${res.filledCount} fields!`);
        inspectActiveTab();
      } else {
        alert("ApplyPilot AI: No standard inputs detected or form already filled.");
      }
    });
  });

  // Scan Unmatched with AI Button
  document.getElementById('btn-scan-unmatched').addEventListener('click', async () => {
    if (!currentTab?.id) return;
    chrome.tabs.sendMessage(currentTab.id, { action: "SUGGEST_UNMATCHED" });
    window.close(); // Close popup so user sees in-page card
  });

  // Capture & Remember Page Details Button
  const captureBtn = document.getElementById('btn-capture-page');
  if (captureBtn) {
    captureBtn.addEventListener('click', async () => {
      if (!currentTab?.id) return;
      captureBtn.textContent = "Capturing...";
      chrome.tabs.sendMessage(currentTab.id, { action: "CAPTURE_PAGE_FIELDS" }, async (res) => {
        captureBtn.textContent = "📥 Capture & Remember Page Details";
        if (res && res.capturedCount !== undefined) {
          alert(`ApplyPilot AI: Successfully captured & saved ${res.capturedCount} fields into your memory!`);
          await refreshProfile();
          inspectActiveTab();
        } else {
          alert("ApplyPilot AI: All current details on this page are already recorded.");
        }
      });
    });
  }

  // 8. Resume Ingestion (File Drop & Text Paste)
  const dropzone = document.getElementById('resume-dropzone');
  const fileInput = document.getElementById('resume-file-input');
  const statusEl = document.getElementById('resume-file-status');

  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleResumeFile(e.dataTransfer.files[0]);
    }
  });

  // Auto-save model change immediately
  document.getElementById('setting-model').addEventListener('change', async (e) => {
    if (activeProfile) {
      activeProfile.settings = activeProfile.settings || {};
      activeProfile.settings.model = e.target.value;
      await StorageService.saveProfile(activeProfile);
      console.log("[ApplyPilot UI] Model updated to:", e.target.value);
    }
  });

  async function handleResumeFile(file) {
    statusEl.style.display = "block";
    statusEl.textContent = `Reading ${file.name}...`;
    statusEl.style.color = "var(--primary)";

    const chosenModel = document.getElementById('setting-model')?.value || activeProfile?.settings?.model || "gemini-3.6-flash";

    try {
      // 1. First extract text directly from the file client-side
      let extractedText = "";
      if (window.PdfExtractor) {
        extractedText = await window.PdfExtractor.extractText(file);
      }

      if (extractedText && extractedText.length > 20) {
        statusEl.textContent = `Extracting profile with Gemini AI (${chosenModel})...`;

        chrome.runtime.sendMessage({
          action: "PARSE_RESUME_TEXT",
          resumeText: extractedText,
          model: chosenModel
        }, (res) => {
          if (res && res.parsed) {
            applyParsedResume(res.parsed);
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
      console.warn("Client-side text extraction had error, attempting background parser:", extractErr);
    }

    // 2. If it's an image file (PNG/JPEG), Gemini multimodal supports it directly
    const mimeType = file.type || "application/pdf";
    if (mimeType.startsWith("image/")) {
      statusEl.textContent = `Analyzing image ${file.name} with Gemini AI (${chosenModel})...`;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result.split(',')[1];
        chrome.runtime.sendMessage({
          action: "PARSE_RESUME_FILE",
          base64Data,
          mimeType,
          model: chosenModel
        }, async (res) => {
          if (res && res.parsed) {
            applyParsedResume(res.parsed);
            statusEl.textContent = `✓ Successfully extracted profile from ${file.name}!`;
            statusEl.style.color = "var(--success)";
          } else {
            statusEl.textContent = res?.error || "Error parsing resume image.";
            statusEl.style.color = "var(--danger)";
          }
        });
      };
      reader.readAsDataURL(file);
      return;
    }

    // 3. If it's a PDF where text extraction didn't find sufficient text (scanned image PDF)
    statusEl.textContent = "No readable text detected in this PDF (it might be a scanned image or protected). Please paste your resume text in the box below.";
    statusEl.style.color = "var(--warning)";
    const textInput = document.getElementById('resume-text-input');
    if (textInput) textInput.focus();
  }

  // Parse Text Resume
  document.getElementById('btn-parse-resume-text').addEventListener('click', async () => {
    const text = document.getElementById('resume-text-input').value.trim();
    if (!text) {
      alert("Please paste your resume text first.");
      return;
    }

    const chosenModel = document.getElementById('setting-model')?.value || activeProfile?.settings?.model || "gemini-3.6-flash";
    const btn = document.getElementById('btn-parse-resume-text');
    btn.textContent = `Extracting with Gemini AI (${chosenModel})...`;
    btn.disabled = true;

    chrome.runtime.sendMessage({
      action: "PARSE_RESUME_TEXT",
      resumeText: text,
      model: chosenModel
    }, (res) => {
      btn.textContent = "✨ Extract Profile with Gemini AI";
      btn.disabled = false;

      if (res && res.parsed) {
        applyParsedResume(res.parsed);
        alert("ApplyPilot AI: Successfully parsed resume text! Profile updated.");
      } else {
        alert(res?.error || "Error parsing resume text.");
      }
    });
  });

  function applyParsedResume(parsed) {
    if (parsed.personal) {
      activeProfile.personal = { ...activeProfile.personal, ...parsed.personal };
    }
    if (parsed.links) {
      activeProfile.links = { ...activeProfile.links, ...parsed.links };
    }
    if (parsed.experience) {
      activeProfile.experience = { ...activeProfile.experience, ...parsed.experience };
      if (Array.isArray(parsed.experience.items)) {
        activeProfile.experience.items = parsed.experience.items;
      }
    }
    if (parsed.education) {
      activeProfile.education = { ...activeProfile.education, ...parsed.education };
      if (Array.isArray(parsed.education.items)) {
        activeProfile.education.items = parsed.education.items;
      }
    }
    if (parsed.suggestedCustomFields && Array.isArray(parsed.suggestedCustomFields)) {
      activeProfile.customFields = activeProfile.customFields || [];
      parsed.suggestedCustomFields.forEach(scf => {
        if (scf.label && scf.value) {
          activeProfile.customFields.push({
            id: "cf-" + Date.now() + Math.random().toString(36).substr(2, 4),
            label: scf.label,
            value: scf.value,
            keywords: scf.keywords || [scf.label.toLowerCase()]
          });
        }
      });
    }

    StorageService.saveProfile(activeProfile);
    populateForm(activeProfile);
    renderExperienceList(activeProfile.experience?.items || []);
    renderDynamicFields(activeProfile.dynamicFields || []);
    updateSummary(activeProfile);
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
    if (document.getElementById('log-stat-autofills')) document.getElementById('log-stat-autofills').textContent = stats.totalAutofills;
    if (document.getElementById('log-stat-captures')) document.getElementById('log-stat-captures').textContent = stats.totalManualCaptures;
    if (document.getElementById('log-stat-errors')) document.getElementById('log-stat-errors').textContent = stats.totalErrors;
    if (document.getElementById('log-stat-success-rate')) document.getElementById('log-stat-success-rate').textContent = `${stats.successRate} Success`;

    // Calculate deep fill metrics from recent telemetry and corrections
    let compulsoryFilled = 0;
    let compulsoryUnfilled = 0;
    let optionalFilled = 0;
    let optionalUnfilled = 0;
    let userCorrections = 0;

    userCorrections = syncQueue.filter(item => item.type === 'user_correction').length;
    logs.forEach(l => {
      if (l.actionType === 'manual_entry' && (l.details || '').includes('User corrected')) {
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

    if (document.getElementById('log-stat-compulsory')) {
      document.getElementById('log-stat-compulsory').textContent = `${compulsoryFilled} Filled`;
    }
    if (document.getElementById('log-stat-compulsory-unfilled')) {
      document.getElementById('log-stat-compulsory-unfilled').textContent = `${compulsoryUnfilled} Unfilled`;
    }
    if (document.getElementById('log-stat-optional')) {
      document.getElementById('log-stat-optional').textContent = `${optionalFilled} Filled`;
    }
    if (document.getElementById('log-stat-optional-unfilled')) {
      document.getElementById('log-stat-optional-unfilled').textContent = `${optionalUnfilled} Skipped`;
    }
    if (document.getElementById('log-stat-corrections')) {
      document.getElementById('log-stat-corrections').textContent = String(userCorrections);
    }

    const feedEl = document.getElementById('audit-log-feed');
    const filterQuery = (document.getElementById('log-filter-input')?.value || "").toLowerCase().trim();

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
    const listEl = document.getElementById('ignored-fields-list');
    const countBadge = document.getElementById('ignored-fields-count');
    const ignored = activeProfile.ignoredOptionalFields || [];

    countBadge.textContent = ignored.length;

    if (!ignored || ignored.length === 0) {
      listEl.innerHTML = `<div class="ap-text-muted" style="font-size: 11px; padding: 4px 0;">No ignored optional fields yet.</div>`;
      return;
    }

    listEl.innerHTML = ignored.map(item => `
      <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-hover); padding: 6px 8px; border-radius: 4px;">
        <span style="font-size: 11px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;" title="${escapeHtml(item.label)}">
          🚫 ${escapeHtml(item.label)}
        </span>
        <button class="ap-btn-unignore ap-btn ap-btn-outline ap-btn-sm" data-id="${item.id || item.label}" style="font-size: 10px; padding: 2px 6px;">
          Un-ignore
        </button>
      </div>
    `).join('');

    listEl.querySelectorAll('.ap-btn-unignore').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        await StorageService.removeIgnoredOptionalField(id);
        activeProfile = await StorageService.getProfile();
        renderIgnoredFields();
      });
    });
  }

  // Export JSON Button
  document.getElementById('btn-export-logs-json').addEventListener('click', async () => {
    const jsonStr = await AuditLogger.exportJSON();
    const dateStr = new Date().toISOString().split('T')[0];
    downloadFile(jsonStr, `applypilot-audit-log-${dateStr}.json`, 'application/json');
  });

  // Export CSV Button
  document.getElementById('btn-export-logs-csv').addEventListener('click', async () => {
    const csvStr = await AuditLogger.exportCSV();
    const dateStr = new Date().toISOString().split('T')[0];
    downloadFile(csvStr, `applypilot-audit-log-${dateStr}.csv`, 'text/csv');
  });

  // Clear Logs Button
  document.getElementById('btn-clear-logs').addEventListener('click', async () => {
    if (confirm("Clear all ApplyPilot activity and audit logs?")) {
      await AuditLogger.clearLogs();
      renderAuditLogs();
    }
  });

  // Sync & Refine Knowledge Base with AI Now Button
  const btnSyncAi = document.getElementById('btn-sync-ai-memory');
  if (btnSyncAi) {
    btnSyncAi.addEventListener('click', async () => {
      btnSyncAi.disabled = true;
      const originalHtml = btnSyncAi.innerHTML;
      btnSyncAi.innerHTML = `<span>⏳ Synthesizing with Gemini...</span>`;

      chrome.runtime.sendMessage({ action: "TRIGGER_BACKGROUND_SYNC_NOW" }, async (res) => {
        if (res && res.success) {
          btnSyncAi.innerHTML = `<span>✓ Synced & Refined (${res.processedCount || 0} items)!</span>`;
          await refreshProfile();
          await renderAuditLogs();
        } else {
          btnSyncAi.innerHTML = `<span>ℹ️ ${res?.message || res?.error || "Queue is empty or API key missing"}</span>`;
        }
        setTimeout(() => {
          btnSyncAi.innerHTML = originalHtml;
          btnSyncAi.disabled = false;
        }, 3000);
      });
    });
  }

  // Log filter search input
  document.getElementById('log-filter-input')?.addEventListener('input', () => {
    renderAuditLogs();
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initial load
  await refreshProfile();
  await inspectActiveTab();
});
