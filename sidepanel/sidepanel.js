// ApplyPilot AI - Side Panel Companion Script

document.addEventListener('DOMContentLoaded', async () => {
  let profile = null;

  const byId = (id) => document.getElementById(id);
  const setText = (id, text) => {
    const el = byId(id);
    if (el) el.textContent = text;
  };

  async function loadData() {
    profile = await StorageService.getProfile();
    renderQuickCopyDrawer(profile);
    await checkActiveTab();
  }

  // 1. Inspect Active Tab
  async function checkActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    try {
      chrome.tabs.sendMessage(tab.id, { action: "SCAN_FIELDS" }, (res) => {
        if (chrome.runtime?.lastError || !res) {
          setText('sp-status-badge', "Open a job portal tab");
          setText('sp-stat-total', "0");
          setText('sp-stat-matched', "0");
          setText('sp-stat-unmatched', "0");
          return;
        }

        setText('sp-status-badge', `${tab.title?.slice(0, 25) || "Active Tab"}...`);
        setText('sp-stat-total', res.total || 0);
        setText('sp-stat-matched', res.matchedCount || 0);
        setText('sp-stat-unmatched', res.unmatchedCount || 0);
      });
    } catch (e) {
      setText('sp-status-badge', "Open a job portal tab");
    }
  }

  // Rescan button
  byId('sp-btn-refresh')?.addEventListener('click', checkActiveTab);

  // Export audit logs button
  byId('sp-btn-export-logs')?.addEventListener('click', async () => {
    const jsonStr = await AuditLogger.exportJSON();
    const dateStr = new Date().toISOString().split('T')[0];
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `applypilot-audit-log-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  });

  // Autofill button
  byId('sp-autofill-btn')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { action: "AUTOFILL" }, (res) => {
      if (chrome.runtime?.lastError) {
        showSpStatus("Open a job application page and reload it to autofill.", "error");
        return;
      }
      if (res && res.filledCount !== undefined) {
        checkActiveTab();
      }
    });
  });

  // Capture & Learn Page Fields button
  const captureBtn = byId('sp-capture-btn');
  if (captureBtn) {
    captureBtn.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      captureBtn.textContent = "Saving...";
      chrome.tabs.sendMessage(tab.id, { action: "CAPTURE_PAGE_FIELDS" }, async (res) => {
        captureBtn.textContent = "📥 Learn Page";
        if (chrome.runtime?.lastError) {
          showSpStatus("Could not inspect this tab. Reload the application page.", "error");
          return;
        }
        if (res && res.capturedCount !== undefined) {
          await loadData();
          checkActiveTab();
        }
      });
    });
  }

  // Review Unmatched button
  byId('sp-scan-ai-btn')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { action: "SUGGEST_UNMATCHED" }, () => {
      void chrome.runtime?.lastError;
    });
  });

  // 2. Quick Copy Drawer
  function renderQuickCopyDrawer(p) {
    const list = byId('sp-drawer-list');
    if (!list) return;
    list.innerHTML = '';

    const currentRoleValue = [p.experience?.currentTitle, p.experience?.currentCompany].filter(Boolean).join(" at ");
    const items = [
      { title: "Full Name", value: p.personal?.fullName },
      { title: "Email", value: p.personal?.email },
      { title: "Phone", value: p.personal?.phone },
      { title: "Location", value: p.personal?.location },
      { title: "LinkedIn", value: p.links?.linkedin },
      { title: "GitHub", value: p.links?.github },
      { title: "Portfolio", value: p.links?.portfolio },
      { title: "Current Title", value: currentRoleValue },
      { title: "Tech Stack", value: p.experience?.skills },
      { title: "Notice Period", value: p.presets?.noticePeriod },
      { title: "Work Auth", value: p.presets?.workAuthorization },
      { title: "Target Salary", value: p.presets?.salaryExpectations }
    ];

    // Add sequential work experiences
    (p.experience?.items || []).forEach((exp, idx) => {
      if (exp.company || exp.title) {
        items.push({
          title: `💼 Role #${idx + 1}: ${exp.title || "Position"} @ ${exp.company || "Company"}`,
          value: `${exp.title || ""} at ${exp.company || ""}${exp.startDate || exp.endDate ? ` (${exp.startDate || ""} - ${exp.endDate || ""})` : ""}${exp.location ? ` • ${exp.location}` : ""}\n${exp.description || ""}`.trim()
        });
      }
    });

    // Add dynamic knowledge fields
    (p.dynamicFields || []).forEach(df => {
      if (df.value) {
        items.push({
          title: `🏷️ ${df.label}`,
          value: df.value
        });
      }
      if (df.nestedDetails && typeof df.nestedDetails === 'object') {
        const nestedStr = Object.entries(df.nestedDetails)
          .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
          .join('\n');
        items.push({
          title: `📋 ${df.label} (Details)`,
          value: nestedStr
        });
      }
      if (df.companyAnswers && typeof df.companyAnswers === 'object') {
        const compStr = Object.entries(df.companyAnswers)
          .map(([comp, ans]) => `${comp}: ${ans}`)
          .join('\n');
        items.push({
          title: `🏢 ${df.label} (Company Rules)`,
          value: compStr
        });
      }
    });

    // Add custom fields
    (p.customFields || []).forEach(cf => {
      items.push({ title: cf.label, value: cf.value });
    });

    items.forEach(item => {
      if (!item.value) return;

      const chip = document.createElement('div');
      chip.className = 'sp-copy-chip';
      chip.innerHTML = `
        <div>
          <div class="sp-copy-title">${escapeHtml(item.title)}</div>
          <div class="sp-copy-snippet">${escapeHtml(item.value)}</div>
        </div>
        <span class="sp-copy-icon">Copy</span>
      `;

      chip.addEventListener('click', async () => {
        await navigator.clipboard.writeText(item.value);
        const icon = chip.querySelector('.sp-copy-icon');
        const orig = icon.textContent;
        icon.textContent = "✓ Copied!";
        icon.style.color = "var(--success)";
        setTimeout(() => {
          icon.textContent = orig;
          icon.style.color = "var(--primary)";
        }, 1500);
      });

      list.appendChild(chip);
    });
  }

  // 3. Offline Smart Answer Builder
  byId('sp-btn-generate-essay')?.addEventListener('click', async () => {
    const promptInput = byId('sp-ai-prompt');
    const prompt = (promptInput?.value || "").trim();
    if (!prompt) {
      showSpStatus("Please enter a question or prompt first.", "error");
      return;
    }

    const btn = byId('sp-btn-generate-essay');
    if (btn) {
      btn.textContent = "⏳ Drafting...";
      btn.disabled = true;
    }

    chrome.runtime.sendMessage({
      action: "GENERATE_AI_ANSWER",
      question: prompt
    }, (res) => {
      if (btn) {
        btn.textContent = "⚡ Draft Answer";
        btn.disabled = false;
      }

      if (chrome.runtime?.lastError) {
        showSpStatus(chrome.runtime.lastError.message || "Could not reach background engine.", "error");
        return;
      }

      if (res && res.answer) {
        const resultBox = byId('sp-ai-result-box');
        const resultArea = byId('sp-ai-result');
        if (resultBox) resultBox.style.display = 'block';
        if (resultArea) resultArea.value = res.answer;
      } else {
        showSpStatus(res?.error || "Could not draft a response from your local profile. Add details in Profile.", "error");
      }
    });
  });

  // Copy drafted essay
  byId('sp-btn-copy-essay')?.addEventListener('click', async () => {
    const text = byId('sp-ai-result')?.value || "";
    if (!text) return;
    await navigator.clipboard.writeText(text);
    const btn = byId('sp-btn-copy-essay');
    if (btn) {
      btn.textContent = "✓ Copied to Clipboard!";
      setTimeout(() => {
        btn.textContent = "📋 Copy";
      }, 1500);
    }
  });

  // Inline status banner - see the note in popup.js about avoiding alert().
  let spStatusTimer = null;
  function showSpStatus(message, kind = "info") {
    const el = document.getElementById('sp-status-banner');
    if (!el) return;
    const palette = {
      success: ["#ecfdf5", "#065f46"],
      error: ["#fef2f2", "#991b1b"],
      info: ["#f8fafc", "#475569"]
    };
    const [bg, fg] = palette[kind] || palette.info;
    el.style.background = bg;
    el.style.color = fg;
    el.textContent = message;
    el.style.display = 'block';
    clearTimeout(spStatusTimer);
    spStatusTimer = setTimeout(() => { el.style.display = 'none'; }, 4000);
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

  await loadData();
});
