// ApplyPilot AI - Side Panel Companion Script

document.addEventListener('DOMContentLoaded', async () => {
  let profile = null;

  async function loadData() {
    profile = await StorageService.getProfile();
    renderQuickCopyDrawer(profile);
    checkApiKeyBanner(profile);
    await checkActiveTab();
  }

  function checkApiKeyBanner(p) {
    const banner = document.getElementById('sp-api-banner');
    const input = document.getElementById('sp-api-key-input');
    const hasKey = Boolean(p.settings?.geminiApiKey);
    banner.style.display = hasKey ? 'none' : 'block';
    if (hasKey) input.value = p.settings.geminiApiKey;
  }

  // Save key from side panel
  document.getElementById('sp-btn-save-key').addEventListener('click', async () => {
    const key = document.getElementById('sp-api-key-input').value.trim();
    if (!key) {
      alert("Please paste your Gemini API key.");
      return;
    }
    await StorageService.saveApiKey(key);
    document.getElementById('sp-api-banner').style.display = 'none';
    alert("Gemini API key saved successfully!");
    await loadData();
  });

  // 1. Inspect Active Tab
  async function checkActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { action: "SCAN_FIELDS" }, (res) => {
      const badge = document.getElementById('sp-status-badge');
      if (chrome.runtime.lastError || !res) {
        badge.textContent = "Open a job portal tab";
        document.getElementById('sp-stat-total').textContent = "0";
        document.getElementById('sp-stat-matched').textContent = "0";
        document.getElementById('sp-stat-unmatched').textContent = "0";
        return;
      }

      badge.textContent = `${tab.title?.slice(0, 25) || "Active Tab"}...`;
      document.getElementById('sp-stat-total').textContent = res.total || 0;
      document.getElementById('sp-stat-matched').textContent = res.matchedCount || 0;
      document.getElementById('sp-stat-unmatched').textContent = res.unmatchedCount || 0;
    });
  }

  // Rescan button
  document.getElementById('sp-btn-refresh').addEventListener('click', checkActiveTab);

  // Autofill button
  document.getElementById('sp-autofill-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { action: "AUTOFILL" }, (res) => {
      if (res && res.filledCount !== undefined) {
        checkActiveTab();
      }
    });
  });

  // AI Unmatched
  document.getElementById('sp-scan-ai-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { action: "SUGGEST_UNMATCHED" });
  });

  // 2. Quick Copy Drawer
  function renderQuickCopyDrawer(p) {
    const list = document.getElementById('sp-drawer-list');
    list.innerHTML = '';

    const items = [
      { title: "Full Name", value: p.personal?.fullName },
      { title: "Email", value: p.personal?.email },
      { title: "Phone", value: p.personal?.phone },
      { title: "Location", value: p.personal?.location },
      { title: "LinkedIn", value: p.links?.linkedin },
      { title: "GitHub", value: p.links?.github },
      { title: "Portfolio", value: p.links?.portfolio },
      { title: "Current Title", value: `${p.experience?.currentTitle} at ${p.experience?.currentCompany}` },
      { title: "Tech Stack", value: p.experience?.skills },
      { title: "Notice Period", value: p.presets?.noticePeriod },
      { title: "Work Auth", value: p.presets?.workAuthorization },
      { title: "Target Salary", value: p.presets?.salaryExpectations }
    ];

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

  // 3. AI Essay Scratchpad
  document.getElementById('sp-btn-generate-essay').addEventListener('click', async () => {
    const prompt = document.getElementById('sp-ai-prompt').value.trim();
    if (!prompt) {
      alert("Please enter a question or prompt first.");
      return;
    }

    const btn = document.getElementById('sp-btn-generate-essay');
    btn.textContent = "⏳ Drafting...";
    btn.disabled = true;

    chrome.runtime.sendMessage({
      action: "GENERATE_AI_ANSWER",
      question: prompt
    }, (res) => {
      btn.textContent = "✨ Generate Answer";
      btn.disabled = false;

      if (res && res.answer) {
        document.getElementById('sp-ai-result-box').style.display = 'block';
        document.getElementById('sp-ai-result').value = res.answer;
      } else {
        alert(res?.error || "Error generating AI response. Check your Gemini API key.");
      }
    });
  });

  // Copy drafted essay
  document.getElementById('sp-btn-copy-essay').addEventListener('click', async () => {
    const text = document.getElementById('sp-ai-result').value;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('sp-btn-copy-essay');
    btn.textContent = "✓ Copied to Clipboard!";
    setTimeout(() => {
      btn.textContent = "📋 Copy";
    }, 1500);
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

  await loadData();
});
