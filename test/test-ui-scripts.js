const test = require('node:test');
const assert = require('node:assert');

// 1. Mock DOM Engine for UI Scripts
class MockEvent {
  constructor(type, opts = {}) {
    this.type = type;
    this.bubbles = !!opts.bubbles;
    this.cancelable = !!opts.cancelable;
    this.defaultPrevented = false;
    this.target = opts.target || null;
    this.currentTarget = opts.currentTarget || null;
    this.dataTransfer = opts.dataTransfer || null;
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() {}
}

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.type = this.tagName === 'INPUT' ? 'text' : undefined;
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.readOnly = false;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.classList = {
      _classes: new Set(),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      contains: (c) => this.classList._classes.has(c),
      toggle: (c) => {
        if (this.classList._classes.has(c)) {
          this.classList._classes.delete(c);
          return false;
        } else {
          this.classList._classes.add(c);
          return true;
        }
      }
    };
    this.style = {};
    this._listeners = {};
    this.attributes = {};
    this.innerText = '';
    this.textContent = '';
    this.files = [];
  }

  set className(val) {
    this._className = val;
    this.classList._classes.clear();
    if (val && typeof val === 'string') {
      val.split(/\s+/).forEach(c => c && this.classList.add(c));
    }
  }

  get className() {
    return this._className || Array.from(this.classList._classes).join(' ');
  }

  getAttribute(k) {
    const key = k.toLowerCase();
    if (key === 'id' && this.id) return this.id;
    if (key === 'class' && this.className) return this.className;
    if (key === 'name' && this.name) return this.name;
    if (key === 'type' && this.type) return this.type;
    if (key === 'placeholder' && this.placeholder) return this.placeholder;
    if (key.startsWith('data-')) {
      const dataKey = key.slice(5);
      if (this.dataset[dataKey] !== undefined) return this.dataset[dataKey];
    }
    return this.attributes[key] || null;
  }

  setAttribute(k, v) {
    const key = k.toLowerCase();
    this.attributes[key] = String(v);
    if (key === 'id') this.id = String(v);
    if (key === 'class') this.className = String(v);
    if (key === 'name') this.name = String(v);
    if (key === 'type') this.type = String(v);
    if (key === 'placeholder') this.placeholder = String(v);
    if (key === 'value') this.value = String(v);
    if (key === 'checked') this.checked = true;
    if (key.startsWith('data-')) {
      const dataKey = key.slice(5);
      this.dataset[dataKey] = String(v);
    }
  }

  removeAttribute(k) {
    const key = k.toLowerCase();
    delete this.attributes[key];
    if (key.startsWith('data-')) {
      delete this.dataset[key.slice(5)];
    }
  }

  hasAttribute(k) {
    return Object.prototype.hasOwnProperty.call(this.attributes, k.toLowerCase());
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx >= 0) this.parentElement.children.splice(idx, 1);
    }
  }

  addEventListener(type, fn) {
    this._listeners[type] = this._listeners[type] || [];
    this._listeners[type].push(fn);
  }

  dispatchEvent(evt) {
    if (!evt.target) evt.target = this;
    if (!evt.currentTarget) evt.currentTarget = this;
    if (typeof this['on' + evt.type] === 'function') {
      this['on' + evt.type](evt);
    }
    const list = this._listeners[evt.type] || [];
    for (const fn of list) {
      fn.call(this, evt);
    }
    return !evt.defaultPrevented;
  }

  click() {
    const evt = new MockEvent('click', { bubbles: true, cancelable: true });
    this.dispatchEvent(evt);
  }

  focus() {
    this._focused = true;
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (curr.matches && curr.matches(selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  matches(sel) {
    if (!sel) return false;
    const selectors = sel.split(',').map(s => s.trim());
    return selectors.some(s => {
      if (s.includes('[') && s.includes(']')) {
        const prefix = s.split('[')[0];
        if (prefix && !this.matches(prefix)) return false;
        const attrMatch = s.match(/\[([a-zA-Z0-9_-]+)(?:=([^\],]+))?\]/);
        if (attrMatch) {
          const attrKey = attrMatch[1];
          let expectedVal = attrMatch[2];
          if (expectedVal) {
            expectedVal = expectedVal.replace(/^["']|["']$/g, '');
            const actualVal = this.getAttribute(attrKey);
            if (actualVal !== expectedVal) return false;
          } else {
            if (!this.hasAttribute(attrKey)) return false;
          }
        }
        return true;
      }

      if (s.startsWith('#')) return this.id === s.slice(1);
      if (s.startsWith('.')) {
        const className = s.slice(1);
        return this.classList.contains(className);
      }
      return this.tagName === s.toUpperCase();
    });
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    this.textContent = '';
    if (!html || typeof html !== 'string') return;

    const stack = [this];
    const tagRegex = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z0-9]+)([^>]*?)(\/)?>|([^<]+)/gs;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      if (match[0].startsWith('<!--')) continue;
      const isClosing = match[1] === '/';
      const tagName = match[2];
      const attrsStr = match[3] || '';
      const isSelfClosing = match[4] === '/' || ['input', 'img', 'br', 'hr'].includes((tagName || '').toLowerCase());
      const textContent = match[5];

      if (textContent) {
        const top = stack[stack.length - 1];
        top.textContent = (top.textContent || '') + textContent;
        if (top.tagName === 'TEXTAREA') top.value = top.textContent;
      } else if (isClosing) {
        if (stack.length > 1 && stack[stack.length - 1].tagName === tagName.toUpperCase()) {
          stack.pop();
        }
      } else if (tagName) {
        const el = new MockElement(tagName);
        const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
        let aMatch;
        while ((aMatch = attrRegex.exec(attrsStr)) !== null) {
          const attrName = aMatch[1];
          const attrVal = aMatch[2] !== undefined ? aMatch[2] : (aMatch[3] !== undefined ? aMatch[3] : (aMatch[4] !== undefined ? aMatch[4] : ''));
          el.setAttribute(attrName, attrVal);
        }
        if (attrsStr.includes('checked')) el.checked = true;
        stack[stack.length - 1].appendChild(el);
        if (!isSelfClosing) {
          stack.push(el);
        }
      }
    }
  }

  get textContent() {
    if (this._textContent !== undefined && this._textContent !== '') return this._textContent;
    if (this.children.length > 0) {
      return this.children.map(c => c.textContent).join(' ');
    }
    return this._textContent || '';
  }

  set textContent(val) {
    this._textContent = val !== null && val !== undefined ? String(val) : '';
  }

  get innerHTML() {
    if (this.children.length > 0) {
      return this.children.map(c => {
        const tag = c.tagName.toLowerCase();
        const attrs = Object.entries(c.attributes || {}).map(([k, v]) => ` ${k}="${v}"`).join('');
        return `<${tag}${attrs}>${c.innerHTML || c.textContent || ''}</${tag}>`;
      }).join('');
    }
    return this._innerHTML || this.textContent || '';
  }

  querySelector(sel) {
    const res = this.querySelectorAll(sel);
    return res.length > 0 ? res[0] : null;
  }

  querySelectorAll(sel) {
    const parts = sel.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      const firstMatches = this.querySelectorAll(parts[0]);
      const restSel = parts.slice(1).join(' ');
      const results = [];
      for (const m of firstMatches) {
        results.push(...m.querySelectorAll(restSel));
      }
      return results;
    }

    const results = [];
    const walk = (node) => {
      for (const ch of node.children) {
        if (ch.matches && ch.matches(sel)) results.push(ch);
        walk(ch);
      }
    };
    walk(this);
    return results;
  }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('BODY');
    this._docListeners = {};
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }

  getElementById(id) {
    let found = null;
    const walk = (node) => {
      if (node.id === id) { found = node; return; }
      for (const ch of node.children) {
        if (!found) walk(ch);
      }
    };
    walk(this.body);
    return found;
  }

  querySelector(sel) {
    if (sel.startsWith('#')) {
      const el = this.getElementById(sel.slice(1));
      if (el) return el;
    }
    return this.body.querySelector(sel);
  }

  querySelectorAll(sel) {
    const results = [];
    if (this.body.matches && this.body.matches(sel)) {
      results.push(this.body);
    }
    results.push(...this.body.querySelectorAll(sel));
    return results;
  }

  addEventListener(type, fn) {
    this._docListeners[type] = this._docListeners[type] || [];
    this._docListeners[type].push(fn);
  }

  async dispatchDomContentLoaded() {
    const list = this._docListeners['DOMContentLoaded'] || [];
    for (const fn of list) {
      await fn(new MockEvent('DOMContentLoaded'));
    }
  }
}

function buildPopupDOM() {
  const doc = new MockDocument();
  const body = doc.body;

  const btnHeaderSettings = new MockElement('BUTTON');
  btnHeaderSettings.id = 'btn-header-settings';
  body.appendChild(btnHeaderSettings);

  const btnOpenSidepanel = new MockElement('BUTTON');
  btnOpenSidepanel.id = 'btn-open-sidepanel';
  body.appendChild(btnOpenSidepanel);

  const tabNames = ['tab-quickfill', 'tab-dynamic', 'tab-profile', 'tab-presets', 'tab-resume', 'tab-logs', 'tab-settings'];
  tabNames.forEach((name, idx) => {
    const tabBtn = new MockElement('BUTTON');
    tabBtn.className = 'ap-tab' + (idx === 0 ? ' active' : '');
    tabBtn.setAttribute('data-tab', name);
    body.appendChild(tabBtn);

    const tabContent = new MockElement('DIV');
    tabContent.id = name;
    tabContent.className = 'ap-tab-content' + (idx === 0 ? ' active' : '');
    body.appendChild(tabContent);
  });

  const banner = new MockElement('DIV');
  banner.id = 'api-key-banner';
  banner.style.display = 'none';
  body.appendChild(banner);

  const quickApiKey = new MockElement('INPUT');
  quickApiKey.id = 'quick-api-key';
  body.appendChild(quickApiKey);

  const btnQuickSaveKey = new MockElement('BUTTON');
  btnQuickSaveKey.id = 'btn-quick-save-key';
  body.appendChild(btnQuickSaveKey);

  const btnAutofill = new MockElement('BUTTON');
  btnAutofill.id = 'btn-autofill-page';
  body.appendChild(btnAutofill);

  const btnScanUnmatched = new MockElement('BUTTON');
  btnScanUnmatched.id = 'btn-scan-unmatched';
  body.appendChild(btnScanUnmatched);

  const btnCapturePage = new MockElement('BUTTON');
  btnCapturePage.id = 'btn-capture-page';
  body.appendChild(btnCapturePage);

  const tabUrl = new MockElement('SPAN');
  tabUrl.id = 'ap-tab-url';
  body.appendChild(tabUrl);

  const statDetected = new MockElement('SPAN');
  statDetected.id = 'stat-detected';
  body.appendChild(statDetected);

  const statMatched = new MockElement('SPAN');
  statMatched.id = 'stat-matched';
  body.appendChild(statMatched);

  const statUnmatched = new MockElement('SPAN');
  statUnmatched.id = 'stat-unmatched';
  body.appendChild(statUnmatched);

  const sumName = new MockElement('SPAN');
  sumName.id = 'sum-name';
  body.appendChild(sumName);

  const sumRole = new MockElement('SPAN');
  sumRole.id = 'sum-role';
  body.appendChild(sumRole);

  const sumNotice = new MockElement('SPAN');
  sumNotice.id = 'sum-notice';
  body.appendChild(sumNotice);

  const sumAuth = new MockElement('SPAN');
  sumAuth.id = 'sum-auth';
  body.appendChild(sumAuth);

  const profileInputs = [
    'prof-first-name', 'prof-last-name', 'prof-email', 'prof-phone', 'prof-address',
    'prof-city', 'prof-state', 'prof-postal', 'prof-country',
    'prof-linkedin', 'prof-github', 'prof-portfolio',
    'prof-company', 'prof-title', 'prof-yoe', 'prof-skills', 'prof-degree', 'prof-school',
    'preset-work-auth', 'preset-work-countries', 'preset-require-sponsorship', 'preset-notice',
    'preset-salary', 'preset-relocate', 'preset-gender', 'preset-veteran', 'preset-disability',
    'setting-api-key', 'setting-model', 'setting-tone'
  ];
  profileInputs.forEach(id => {
    const el = new MockElement('INPUT');
    el.id = id;
    body.appendChild(el);
  });

  const settingFloatingBadge = new MockElement('INPUT');
  settingFloatingBadge.id = 'setting-floating-badge';
  settingFloatingBadge.type = 'checkbox';
  settingFloatingBadge.checked = true;
  body.appendChild(settingFloatingBadge);

  const btnTestApiKey = new MockElement('BUTTON');
  btnTestApiKey.id = 'btn-test-api-key';
  body.appendChild(btnTestApiKey);

  const apiTestResult = new MockElement('DIV');
  apiTestResult.id = 'api-test-result';
  body.appendChild(apiTestResult);

  const expContainer = new MockElement('DIV');
  expContainer.id = 'experience-list';
  body.appendChild(expContainer);

  const expCount = new MockElement('SPAN');
  expCount.id = 'experience-count';
  body.appendChild(expCount);

  const btnAddExp = new MockElement('BUTTON');
  btnAddExp.id = 'btn-add-experience';
  body.appendChild(btnAddExp);

  const dfContainer = new MockElement('DIV');
  dfContainer.id = 'dynamic-categories-container';
  body.appendChild(dfContainer);

  const dfCount = new MockElement('SPAN');
  dfCount.id = 'dynamic-fields-count';
  body.appendChild(dfCount);

  const dfSearch = new MockElement('INPUT');
  dfSearch.id = 'df-search-input';
  body.appendChild(dfSearch);

  const btnToggleAddDf = new MockElement('BUTTON');
  btnToggleAddDf.id = 'btn-toggle-add-df';
  body.appendChild(btnToggleAddDf);

  const btnCancelAddDf = new MockElement('BUTTON');
  btnCancelAddDf.id = 'btn-cancel-add-df';
  body.appendChild(btnCancelAddDf);

  const dfAddForm = new MockElement('DIV');
  dfAddForm.id = 'df-add-form';
  dfAddForm.style.display = 'none';
  body.appendChild(dfAddForm);

  const btnSubmitAddDf = new MockElement('BUTTON');
  btnSubmitAddDf.id = 'btn-submit-add-df';
  body.appendChild(btnSubmitAddDf);

  const dfNewLabel = new MockElement('INPUT');
  dfNewLabel.id = 'df-new-label';
  body.appendChild(dfNewLabel);

  const dfNewCategory = new MockElement('SELECT');
  dfNewCategory.id = 'df-new-category';
  dfNewCategory.value = 'General Application';
  body.appendChild(dfNewCategory);

  const dfNewValue = new MockElement('TEXTAREA');
  dfNewValue.id = 'df-new-value';
  body.appendChild(dfNewValue);

  const dfNewAliases = new MockElement('INPUT');
  dfNewAliases.id = 'df-new-aliases';
  body.appendChild(dfNewAliases);

  const dropzone = new MockElement('DIV');
  dropzone.id = 'resume-dropzone';
  body.appendChild(dropzone);

  const fileInput = new MockElement('INPUT');
  fileInput.id = 'resume-file-input';
  fileInput.type = 'file';
  body.appendChild(fileInput);

  const resumeStatus = new MockElement('DIV');
  resumeStatus.id = 'resume-file-status';
  body.appendChild(resumeStatus);

  const resumeTextInput = new MockElement('TEXTAREA');
  resumeTextInput.id = 'resume-text-input';
  body.appendChild(resumeTextInput);

  const btnParseResumeText = new MockElement('BUTTON');
  btnParseResumeText.id = 'btn-parse-resume-text';
  body.appendChild(btnParseResumeText);

  const logStats = [
    'log-stat-autofills', 'log-stat-captures', 'log-stat-errors', 'log-stat-success-rate',
    'log-stat-compulsory', 'log-stat-compulsory-unfilled', 'log-stat-optional',
    'log-stat-optional-unfilled', 'log-stat-corrections'
  ];
  logStats.forEach(id => {
    const el = new MockElement('SPAN');
    el.id = id;
    body.appendChild(el);
  });

  const auditFeed = new MockElement('DIV');
  auditFeed.id = 'audit-log-feed';
  body.appendChild(auditFeed);

  const logFilter = new MockElement('INPUT');
  logFilter.id = 'log-filter-input';
  body.appendChild(logFilter);

  const ignoredList = new MockElement('DIV');
  ignoredList.id = 'ignored-fields-list';
  body.appendChild(ignoredList);

  const ignoredCount = new MockElement('SPAN');
  ignoredCount.id = 'ignored-fields-count';
  body.appendChild(ignoredCount);

  const btnExportJson = new MockElement('BUTTON');
  btnExportJson.id = 'btn-export-logs-json';
  body.appendChild(btnExportJson);

  const btnExportCsv = new MockElement('BUTTON');
  btnExportCsv.id = 'btn-export-logs-csv';
  body.appendChild(btnExportCsv);

  const btnClearLogs = new MockElement('BUTTON');
  btnClearLogs.id = 'btn-clear-logs';
  body.appendChild(btnClearLogs);

  const btnSyncAi = new MockElement('BUTTON');
  btnSyncAi.id = 'btn-sync-ai-memory';
  body.appendChild(btnSyncAi);

  const saveStatus = new MockElement('DIV');
  saveStatus.id = 'save-status';
  body.appendChild(saveStatus);

  const btnSaveProfile = new MockElement('BUTTON');
  btnSaveProfile.id = 'btn-save-profile';
  body.appendChild(btnSaveProfile);

  return doc;
}

function buildSidepanelDOM() {
  const doc = new MockDocument();
  const body = doc.body;

  const banner = new MockElement('DIV');
  banner.id = 'sp-api-banner';
  banner.style.display = 'none';
  body.appendChild(banner);

  const keyInput = new MockElement('INPUT');
  keyInput.id = 'sp-api-key-input';
  body.appendChild(keyInput);

  const btnSaveKey = new MockElement('BUTTON');
  btnSaveKey.id = 'sp-btn-save-key';
  body.appendChild(btnSaveKey);

  const badge = new MockElement('SPAN');
  badge.id = 'sp-status-badge';
  body.appendChild(badge);

  const statTotal = new MockElement('SPAN');
  statTotal.id = 'sp-stat-total';
  body.appendChild(statTotal);

  const statMatched = new MockElement('SPAN');
  statMatched.id = 'sp-stat-matched';
  body.appendChild(statMatched);

  const statUnmatched = new MockElement('SPAN');
  statUnmatched.id = 'sp-stat-unmatched';
  body.appendChild(statUnmatched);

  const btnRefresh = new MockElement('BUTTON');
  btnRefresh.id = 'sp-btn-refresh';
  body.appendChild(btnRefresh);

  const btnExport = new MockElement('BUTTON');
  btnExport.id = 'sp-btn-export-logs';
  body.appendChild(btnExport);

  const btnAutofill = new MockElement('BUTTON');
  btnAutofill.id = 'sp-autofill-btn';
  body.appendChild(btnAutofill);

  const btnCapture = new MockElement('BUTTON');
  btnCapture.id = 'sp-capture-btn';
  body.appendChild(btnCapture);

  const btnScanAi = new MockElement('BUTTON');
  btnScanAi.id = 'sp-scan-ai-btn';
  body.appendChild(btnScanAi);

  const drawerList = new MockElement('DIV');
  drawerList.id = 'sp-drawer-list';
  body.appendChild(drawerList);

  const promptInput = new MockElement('INPUT');
  promptInput.id = 'sp-ai-prompt';
  body.appendChild(promptInput);

  const btnGenerateEssay = new MockElement('BUTTON');
  btnGenerateEssay.id = 'sp-btn-generate-essay';
  body.appendChild(btnGenerateEssay);

  const resultBox = new MockElement('DIV');
  resultBox.id = 'sp-ai-result-box';
  resultBox.style.display = 'none';
  body.appendChild(resultBox);

  const resultArea = new MockElement('TEXTAREA');
  resultArea.id = 'sp-ai-result';
  body.appendChild(resultArea);

  const btnCopyEssay = new MockElement('BUTTON');
  btnCopyEssay.id = 'sp-btn-copy-essay';
  body.appendChild(btnCopyEssay);

  return doc;
}

// 2. Setup Global Mock Context
function setupMockEnv(mockDoc) {
  let savedProfile = {
    personal: {
      firstName: "Pritam",
      lastName: "Rauniyar",
      fullName: "Pritam Rauniyar",
      email: "pritam@example.com",
      phone: "+977 9800000000",
      address: "Kathmandu, Nepal",
      city: "Kathmandu",
      state: "Bagmati",
      postalCode: "44600",
      country: "Nepal",
      location: "Kathmandu, Bagmati"
    },
    links: {
      linkedin: "https://linkedin.com/in/pritamrauniyar",
      github: "https://github.com/pritamrauniyar",
      portfolio: "https://pritamrauniyar.com.np/"
    },
    experience: {
      currentTitle: "Software Engineer",
      currentCompany: "ApplyPilot AI",
      yearsOfExperience: "4",
      skills: "JavaScript, Python, AI",
      items: [
        {
          id: "exp-1",
          title: "Senior Engineer",
          company: "Tech Corp",
          location: "Remote",
          startDate: "2022-01",
          endDate: "Present",
          isCurrent: true,
          description: "Scaled microservices architecture."
        }
      ]
    },
    education: {
      degree: "B.Tech in Computer Science",
      school: "MNNIT Allahabad"
    },
    presets: {
      workAuthorization: "Yes",
      workCountries: "Nepal, USA",
      requireSponsorship: "No",
      noticePeriod: "Immediately available",
      salaryExpectations: "$120,000",
      willingToRelocate: "Remote / Hybrid",
      gender: "Male",
      veteranStatus: "No, I am not a protected veteran",
      disabilityStatus: "No, I do not have a disability"
    },
    dynamicFields: [
      {
        id: "df-1",
        label: "Higher Education",
        category: "Education",
        value: "MNNIT Allahabad",
        aliases: ["college", "university", "alma mater"],
        nestedDetails: { degree: "B.Tech", major: "ECE" }
      },
      {
        id: "df-2",
        label: "Former Employee",
        category: "Company-Specific",
        value: "No",
        aliases: ["previously worked here"],
        companyAnswers: { Microsoft: "No", Uber: "Yes" }
      }
    ],
    customFields: [
      { id: "cf-1", label: "Favorite Tech", value: "Node.js" }
    ],
    ignoredOptionalFields: [
      { id: "ign-1", label: "Middle Name" }
    ],
    settings: {
      geminiApiKey: "AIzaSyFakeKey123",
      model: "gemini-3.6-flash",
      answerTone: "Technical & Impactful",
      showFloatingBadge: true
    }
  };

  let mockLogs = [
    {
      timestamp: Date.now() - 60000,
      fieldLabel: "Email Address",
      domain: "job-portal.com",
      portalType: "workday",
      actionType: "autofill",
      valueSet: "pritam@example.com",
      status: "success",
      details: "Autofilled from personal profile"
    },
    {
      timestamp: Date.now() - 120000,
      fieldLabel: "Phone Number",
      domain: "job-portal.com",
      portalType: "greenhouse",
      actionType: "manual_entry",
      valueSet: "+977 9800000000",
      status: "success",
      details: "User corrected phone number"
    },
    {
      timestamp: Date.now() - 180000,
      fieldLabel: "Salary Expectation",
      domain: "job-portal.com",
      portalType: "lever",
      actionType: "page_learned",
      valueSet: "120k",
      status: "success",
      details: "Captured from page submission"
    },
    {
      timestamp: Date.now() - 240000,
      fieldLabel: "Portfolio Link",
      domain: "job-portal.com",
      portalType: "ashby",
      actionType: "skipped",
      valueSet: "",
      status: "skipped",
      details: "Optional field skipped by user"
    },
    {
      timestamp: Date.now() - 300000,
      fieldLabel: "Unknown Question",
      domain: "job-portal.com",
      portalType: "custom",
      actionType: "autofill",
      valueSet: "",
      status: "error",
      details: "No matching memory field found"
    }
  ];

  let mockSyncQueue = [
    {
      type: "user_correction",
      field: "phone",
      value: "+977 9800000000"
    },
    {
      type: "autofill_telemetry",
      metrics: {
        compulsoryFilled: 8,
        compulsoryUnfilled: 1,
        optionalFilled: 4,
        optionalUnfilled: 2
      }
    }
  ];

  const alerts = [];
  const confirms = [];
  let confirmReturn = true;

  global.alert = (msg) => alerts.push(msg);
  global.confirm = (msg) => { confirms.push(msg); return confirmReturn; };
  global.window = {
    close: () => { global.window._closed = true; },
    PdfExtractor: {
      extractText: async (file) => file._mockText !== undefined ? file._mockText : "Experienced Software Engineer with proficiency in AI and Node.js..."
    }
  };
  global.document = mockDoc;
  const mockClipboard = {
    _copied: '',
    writeText: async (text) => { mockClipboard._copied = text; }
  };
  try {
    Object.defineProperty(global.navigator, 'clipboard', {
      value: mockClipboard,
      configurable: true,
      writable: true
    });
  } catch {
    global.navigator = { clipboard: mockClipboard };
  }
  global.Blob = class {
    constructor(parts, opts) { this.parts = parts; this.opts = opts; }
  };
  global.URL = {
    createObjectURL: (b) => `blob:mock-${Math.random()}`,
    revokeObjectURL: () => {}
  };
  global.FileReader = class {
    readAsDataURL(file) {
      setTimeout(() => {
        this.result = `data:${file.type || 'image/png'};base64,bW9ja0ltYWdlRGF0YQ==`;
        if (this.onload) this.onload();
      }, 10);
    }
  };

  global.StorageService = {
    getProfile: async () => JSON.parse(JSON.stringify(savedProfile)),
    saveProfile: async (p) => { savedProfile = JSON.parse(JSON.stringify(p)); return true; },
    saveApiKey: async (key) => { savedProfile.settings.geminiApiKey = key; return true; },
    deleteDynamicField: async (id) => {
      savedProfile.dynamicFields = (savedProfile.dynamicFields || []).filter(f => f.id !== id);
      return true;
    },
    addDynamicField: async (field) => {
      savedProfile.dynamicFields = savedProfile.dynamicFields || [];
      savedProfile.dynamicFields.push({ id: `df-${Date.now()}`, ...field });
      return true;
    },
    removeIgnoredOptionalField: async (id) => {
      savedProfile.ignoredOptionalFields = (savedProfile.ignoredOptionalFields || []).filter(i => (i.id || i.label) !== id);
      return true;
    },
    getPendingSyncQueue: async () => JSON.parse(JSON.stringify(mockSyncQueue))
  };

  global.AuditLogger = {
    getLogs: async () => [...mockLogs],
    getStats: async () => ({
      totalAutofills: 15,
      totalManualCaptures: 3,
      totalErrors: 1,
      totalSkipped: 2,
      successRate: "93.3%"
    }),
    exportJSON: async () => JSON.stringify(mockLogs, null, 2),
    exportCSV: async () => "timestamp,actionType,fieldLabel,status\n" + mockLogs.map(l => `${l.timestamp},${l.actionType},${l.fieldLabel},${l.status}`).join('\n'),
    clearLogs: async () => { mockLogs = []; }
  };

  let mockRuntimeHandlers = {};
  let mockTabHandlers = {};

  global.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (msg, cb) => {
        if (mockRuntimeHandlers[msg.action]) {
          mockRuntimeHandlers[msg.action](msg, cb);
        } else {
          if (cb) cb({ success: true });
        }
      }
    },
    tabs: {
      query: async (queryInfo) => [{ id: 101, windowId: 501, title: "Google Careers | Software Engineer", url: "https://careers.google.com/jobs/123" }],
      sendMessage: (tabId, msg, cb) => {
        if (mockTabHandlers[msg.action]) {
          mockTabHandlers[msg.action](msg, cb);
        } else {
          if (cb) cb({ success: true });
        }
      }
    },
    sidePanel: {
      open: async (opts) => { global.chrome.sidePanel._openedWith = opts; }
    }
  };

  return {
    getProfile: () => savedProfile,
    setProfile: (p) => { savedProfile = p; },
    getLogs: () => mockLogs,
    setLogs: (l) => { mockLogs = l; },
    setSyncQueue: (q) => { mockSyncQueue = q; },
    alerts,
    confirms,
    getCopied: () => mockClipboard._copied,
    setConfirmReturn: (val) => { confirmReturn = val; },
    setRuntimeHandler: (action, fn) => { mockRuntimeHandlers[action] = fn; },
    setTabHandler: (action, fn) => { mockTabHandlers[action] = fn; }
  };
}

// ==========================================
// TEST SUITE: POPUP LOGIC (popup/popup.js)
// ==========================================
test('Popup UI: Tabs, Settings, and API Key Verification', async (t) => {
  const doc = buildPopupDOM();
  const env = setupMockEnv(doc);

  // Set default tab handler for tab scanning
  env.setTabHandler('SCAN_FIELDS', (msg, cb) => {
    cb({ total: 10, matchedCount: 8, unmatchedCount: 2 });
  });

  // Load popup.js
  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await doc.dispatchDomContentLoaded();

  // Test 1: Active Tab inspection on load
  assert.strictEqual(String(doc.getElementById('stat-detected').textContent), "10");
  assert.strictEqual(String(doc.getElementById('stat-matched').textContent), "8");
  assert.strictEqual(String(doc.getElementById('stat-unmatched').textContent), "2");

  // Test 2: Tab navigation
  const tabButtons = doc.querySelectorAll('.ap-tab');
  assert.ok(tabButtons.length > 0);

  // Switch to Presets tab
  const presetsBtn = doc.querySelector('.ap-tab[data-tab="tab-presets"]');
  assert.ok(presetsBtn);
  presetsBtn.click();
  assert.ok(presetsBtn.classList.contains('active'));
  assert.ok(doc.getElementById('tab-presets').classList.contains('active'));

  // Switch to Logs tab (triggers renderAuditLogs and renderIgnoredFields)
  const logsBtn = doc.querySelector('.ap-tab[data-tab="tab-logs"]');
  logsBtn.click();
  await new Promise(r => setTimeout(r, 20));
  assert.ok(logsBtn.classList.contains('active'));
  assert.ok(doc.getElementById('tab-logs').classList.contains('active'));
  assert.ok(String(doc.getElementById('log-stat-autofills').textContent).length > 0);

  // Test header settings button (switches to tab-settings)
  doc.getElementById('btn-header-settings').click();
  assert.ok(doc.getElementById('tab-settings').classList.contains('active'));

  // Test open side panel button
  await doc.getElementById('btn-open-sidepanel').click();
  await new Promise(r => setTimeout(r, 20));
  assert.deepStrictEqual(global.chrome.sidePanel._openedWith, { windowId: 501 });
  assert.strictEqual(global.window._closed, true);

  // Test Quick API Key Save - Empty error
  doc.getElementById('quick-api-key').value = "   ";
  doc.getElementById('btn-quick-save-key').click();
  assert.strictEqual(env.alerts[env.alerts.length - 1], "Please paste your Gemini API key first.");

  // Test Quick API Key Save - Success
  doc.getElementById('quick-api-key').value = "AIzaSyNewValidKey";
  await doc.getElementById('btn-quick-save-key').click();
  assert.strictEqual(doc.getElementById('setting-api-key').value, "AIzaSyNewValidKey");
  assert.strictEqual(doc.getElementById('api-key-banner').style.display, "none");
  assert.ok(doc.getElementById('save-status').textContent.includes("Gemini API key saved"));

  // Test Test API Key Button - Empty error
  doc.getElementById('setting-api-key').value = " ";
  doc.getElementById('btn-test-api-key').click();
  assert.strictEqual(env.alerts[env.alerts.length - 1], "Please enter your Gemini API key in the input box first.");

  // Test Test API Key Button - Successful connection
  doc.getElementById('setting-api-key').value = "AIzaSyVerifiedKey";
  env.setRuntimeHandler('TEST_API_KEY', (msg, cb) => {
    assert.strictEqual(msg.apiKey, "AIzaSyVerifiedKey");
    cb({ success: true, message: "Valid key connected", selectedModel: "gemini-3.6-flash" });
  });
  doc.getElementById('btn-test-api-key').click();
  assert.ok(doc.getElementById('api-test-result').innerHTML.includes("Connection Verified"));

  // Test Test API Key Button - Failed connection
  env.setRuntimeHandler('TEST_API_KEY', (msg, cb) => {
    cb({ success: false, error: "API_KEY_INVALID" });
  });
  doc.getElementById('btn-test-api-key').click();
  assert.ok(doc.getElementById('api-test-result').innerHTML.includes("Connection Failed"));
});

test('Popup UI: Profile Form, Summary and Work Experience History Cards', async (t) => {
  const doc = buildPopupDOM();
  const env = setupMockEnv(doc);

  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await doc.dispatchDomContentLoaded();

  // Verify form populated correctly
  assert.strictEqual(doc.getElementById('prof-first-name').value, "Pritam");
  assert.strictEqual(doc.getElementById('prof-last-name').value, "Rauniyar");
  assert.strictEqual(doc.getElementById('sum-name').textContent, "Pritam Rauniyar");
  assert.strictEqual(String(doc.getElementById('experience-count').textContent), "1");

  // Test Add Experience button
  doc.getElementById('btn-add-experience').click();
  assert.strictEqual(String(doc.getElementById('experience-count').textContent), "2");

  // Fill in newly added experience card
  const cards = doc.querySelectorAll('#experience-list .ap-exp-card');
  assert.strictEqual(cards.length, 2);
  const newCard = cards[1];
  newCard.querySelector('.ap-exp-title').value = "Lead Architect";
  newCard.querySelector('.ap-exp-company').value = "Open Innovations";
  newCard.querySelector('.ap-exp-location').value = "San Francisco, CA";
  newCard.querySelector('.ap-exp-start').value = "2020-01";
  newCard.querySelector('.ap-exp-end').value = "2021-12";
  newCard.querySelector('.ap-exp-desc').value = "Architected distributed workflow engines.";

  // Modify personal info & presets
  doc.getElementById('prof-first-name').value = "Pritam";
  doc.getElementById('prof-last-name').value = "K. Rauniyar";
  doc.getElementById('prof-email').value = "contact@pritamrauniyar.com.np";
  doc.getElementById('prof-phone').value = "+977 9811111111";
  doc.getElementById('prof-address').value = "New Baneshwor";
  doc.getElementById('prof-city').value = "Kathmandu";
  doc.getElementById('prof-state').value = "Bagmati";
  doc.getElementById('prof-postal').value = "44600";
  doc.getElementById('prof-country').value = "Nepal";
  doc.getElementById('prof-linkedin').value = "https://linkedin.com/in/pritam";
  doc.getElementById('prof-github').value = "https://github.com/pritam";
  doc.getElementById('prof-portfolio').value = "https://pritamrauniyar.com.np/";
  doc.getElementById('prof-company').value = "ApplyPilot";
  doc.getElementById('prof-title').value = "Founding Engineer";
  doc.getElementById('prof-yoe').value = "5";
  doc.getElementById('prof-skills').value = "AI Agents, Chrome Extensions, Systems Architecture";
  doc.getElementById('prof-degree').value = "B.Tech ECE";
  doc.getElementById('prof-school').value = "MNNIT";
  doc.getElementById('preset-work-auth').value = "Yes";
  doc.getElementById('preset-work-countries').value = "Global / Remote";
  doc.getElementById('preset-require-sponsorship').value = "No";
  doc.getElementById('preset-notice').value = "15 days";
  doc.getElementById('preset-salary').value = "$150,000";
  doc.getElementById('preset-relocate').value = "Remote";
  doc.getElementById('preset-gender').value = "Male";
  doc.getElementById('preset-veteran').value = "No, I am not a protected veteran";
  doc.getElementById('preset-disability').value = "No, I do not have a disability";
  doc.getElementById('setting-api-key').value = "AIzaSyCustomKey";
  doc.getElementById('setting-model').value = "gemini-3.7-flash";
  doc.getElementById('setting-tone').value = "Story & Challenge Oriented";
  doc.getElementById('setting-floating-badge').checked = false;

  // Save profile
  await doc.getElementById('btn-save-profile').click();
  assert.ok(doc.getElementById('save-status').textContent.includes("Saved successfully"));
  const updated = env.getProfile();
  assert.strictEqual(updated.personal.fullName, "Pritam K. Rauniyar");
  assert.strictEqual(updated.personal.email, "contact@pritamrauniyar.com.np");
  assert.strictEqual(updated.settings.model, "gemini-3.7-flash");
  assert.strictEqual(updated.settings.showFloatingBadge, false);

  // Test delete experience role button
  const delBtns = doc.querySelectorAll('.ap-del-exp');
  assert.strictEqual(delBtns.length, 2);
  delBtns[0].click();
  assert.strictEqual(String(doc.getElementById('experience-count').textContent), "1");

  // Test auto-save model selector change event
  const modelSelect = doc.getElementById('setting-model');
  modelSelect.value = "gemini-3.6-flash";
  await modelSelect.dispatchEvent(new MockEvent('change', { target: modelSelect }));
  assert.strictEqual(env.getProfile().settings.model, "gemini-3.6-flash");
});

test('Popup UI: Dynamic Knowledge Store Search, Add, Delete and Category Grouping', async (t) => {
  const doc = buildPopupDOM();
  const env = setupMockEnv(doc);

  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await doc.dispatchDomContentLoaded();

  // Verify dynamic fields count
  assert.strictEqual(doc.getElementById('dynamic-fields-count').textContent, "2 Fields");

  // Test Search Filter matching label
  const searchInput = doc.getElementById('df-search-input');
  searchInput.value = "Education";
  searchInput.dispatchEvent(new MockEvent('input'));
  assert.ok(doc.getElementById('dynamic-categories-container').innerHTML.includes("Higher Education"));
  assert.ok(!doc.getElementById('dynamic-categories-container').innerHTML.includes("Former Employee"));

  // Test Search Filter matching alias
  searchInput.value = "alma mater";
  searchInput.dispatchEvent(new MockEvent('input'));
  assert.ok(doc.getElementById('dynamic-categories-container').innerHTML.includes("Higher Education"));

  // Test Search Filter matching nested details
  searchInput.value = "ECE";
  searchInput.dispatchEvent(new MockEvent('input'));
  assert.ok(doc.getElementById('dynamic-categories-container').innerHTML.includes("Higher Education"));

  // Test Search Filter matching companyAnswers
  searchInput.value = "Uber";
  searchInput.dispatchEvent(new MockEvent('input'));
  assert.ok(doc.getElementById('dynamic-categories-container').innerHTML.includes("Former Employee"));

  // Test Search Filter matching nothing
  searchInput.value = "non_existent_xyz";
  searchInput.dispatchEvent(new MockEvent('input'));
  assert.ok(doc.getElementById('dynamic-categories-container').innerHTML.includes("No dynamic fields matching"));

  // Reset search
  searchInput.value = "";
  searchInput.dispatchEvent(new MockEvent('input'));

  // Test Add Form Toggle and Cancel
  const toggleBtn = doc.getElementById('btn-toggle-add-df');
  const cancelBtn = doc.getElementById('btn-cancel-add-df');
  const addForm = doc.getElementById('df-add-form');

  toggleBtn.click();
  assert.strictEqual(addForm.style.display, "block");
  toggleBtn.click();
  assert.strictEqual(addForm.style.display, "none");
  toggleBtn.click();
  assert.strictEqual(addForm.style.display, "block");
  cancelBtn.click();
  assert.strictEqual(addForm.style.display, "none");

  // Test Add Dynamic Field - Validation error
  const submitBtn = doc.getElementById('btn-submit-add-df');
  doc.getElementById('df-new-label').value = "";
  doc.getElementById('df-new-value').value = "";
  submitBtn.click();
  assert.strictEqual(env.alerts[env.alerts.length - 1], "Please provide at least a concept name / label and primary answer value.");

  // Test Add Dynamic Field - Success with aliases
  doc.getElementById('df-new-label').value = "Preferred IDE";
  doc.getElementById('df-new-category').value = "Custom / Learned";
  doc.getElementById('df-new-value').value = "VS Code / Cursor";
  doc.getElementById('df-new-aliases').value = "code editor, development environment";
  await submitBtn.click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(addForm.style.display, "none");
  assert.strictEqual(doc.getElementById('dynamic-fields-count').textContent, "3 Fields");

  // Test Add Dynamic Field - Success without aliases (defaults to label)
  doc.getElementById('df-new-label').value = "Citizenship";
  doc.getElementById('df-new-category').value = "General Application";
  doc.getElementById('df-new-value').value = "Nepalese";
  doc.getElementById('df-new-aliases').value = "";
  await submitBtn.click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(doc.getElementById('dynamic-fields-count').textContent, "4 Fields");

  // Test Delete Dynamic Field (Confirm Cancel)
  env.setConfirmReturn(false);
  const delDfBtns = doc.querySelectorAll('.ap-del-df-btn');
  assert.ok(delDfBtns.length > 0);
  await delDfBtns[0].click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(doc.getElementById('dynamic-fields-count').textContent, "4 Fields");

  // Test Delete Dynamic Field (Confirm OK)
  env.setConfirmReturn(true);
  await delDfBtns[0].click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(doc.getElementById('dynamic-fields-count').textContent, "3 Fields");
});

test('Popup UI: In-Page Autofill, AI Assist, and Page Learning Actions', async (t) => {
  const doc = buildPopupDOM();
  const env = setupMockEnv(doc);

  let autofillCalled = false;
  env.setTabHandler('AUTOFILL', (msg, cb) => {
    autofillCalled = true;
    cb({ filledCount: 9 });
  });

  let suggestCalled = false;
  env.setTabHandler('SUGGEST_UNMATCHED', (msg, cb) => {
    suggestCalled = true;
  });

  let captureCalled = false;
  env.setTabHandler('CAPTURE_PAGE_FIELDS', (msg, cb) => {
    captureCalled = true;
    cb({ capturedCount: 4 });
  });

  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await doc.dispatchDomContentLoaded();

  // Test Autofill application button
  await doc.getElementById('btn-autofill-page').click();
  assert.strictEqual(autofillCalled, true);
  assert.ok(env.alerts[env.alerts.length - 1].includes("Successfully filled 9 fields"));

  // Test Autofill with 0 / empty response
  env.setTabHandler('AUTOFILL', (msg, cb) => { cb({}); });
  await doc.getElementById('btn-autofill-page').click();
  assert.ok(env.alerts[env.alerts.length - 1].includes("No standard inputs detected"));

  // Test Scan Unmatched with AI button
  doc.getElementById('btn-scan-unmatched').click();
  assert.strictEqual(suggestCalled, true);
  assert.strictEqual(global.window._closed, true);

  // Test Capture & Remember Page Details
  await doc.getElementById('btn-capture-page').click();
  assert.strictEqual(captureCalled, true);
  assert.ok(env.alerts[env.alerts.length - 1].includes("Successfully captured & saved 4 fields"));

  // Test Capture when already recorded
  env.setTabHandler('CAPTURE_PAGE_FIELDS', (msg, cb) => { cb({}); });
  await doc.getElementById('btn-capture-page').click();
  assert.ok(env.alerts[env.alerts.length - 1].includes("already recorded"));
});

test('Popup UI: Resume Ingestion (PDF Text, Scanned/Image, Raw Text Paste)', async (t) => {
  const doc = buildPopupDOM();
  const env = setupMockEnv(doc);

  let parsedResponse = {
    parsed: {
      personal: { firstName: "Pritam", lastName: "Rauniyar", email: "p@example.com" },
      links: { linkedin: "https://linkedin.com/in/pritam" },
      experience: {
        items: [
          { title: "Staff Engineer", company: "NextGen AI", startDate: "2023", endDate: "Present" }
        ]
      },
      education: {
        items: [
          { degree: "B.Tech", school: "MNNIT" }
        ]
      },
      suggestedCustomFields: [
        { label: "Cloud Platforms", value: "AWS, GCP", keywords: ["cloud", "infra"] },
        { label: "Design Patterns", value: "Microservices, Event-Driven" }
      ]
    }
  };

  env.setRuntimeHandler('PARSE_RESUME_TEXT', (msg, cb) => {
    assert.ok(msg.resumeText.length > 0);
    cb(parsedResponse);
  });

  env.setRuntimeHandler('PARSE_RESUME_FILE', (msg, cb) => {
    assert.strictEqual(msg.mimeType, "image/png");
    assert.ok(msg.base64Data.length > 0);
    cb(parsedResponse);
  });

  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await doc.dispatchDomContentLoaded();

  // Test 1: Dropzone click triggers file input click
  let fileInputClicked = false;
  doc.getElementById('resume-file-input').addEventListener('click', () => { fileInputClicked = true; });
  doc.getElementById('resume-dropzone').click();
  assert.strictEqual(fileInputClicked, true);

  // Test 2: Drag & drop visual events
  const dropzone = doc.getElementById('resume-dropzone');
  dropzone.dispatchEvent(new MockEvent('dragover'));
  assert.strictEqual(dropzone.style.borderColor, "var(--primary)");
  dropzone.dispatchEvent(new MockEvent('dragleave'));
  assert.strictEqual(dropzone.style.borderColor, "#cbd5e1");

  // Test 3: Dropzone file drop event with PDF text extraction
  const mockPdfFile = {
    name: "Pritam_Resume.pdf",
    type: "application/pdf",
    _mockText: "Pritam Rauniyar - Senior Staff Engineer with extensive background in distributed systems."
  };
  dropzone.dispatchEvent(new MockEvent('drop', {
    dataTransfer: { files: [mockPdfFile] }
  }));
  // Wait microtask for extraction callback
  await new Promise(r => setTimeout(r, 20));
  const statusEl = doc.getElementById('resume-file-status');
  assert.ok(statusEl.textContent.includes("Successfully parsed Pritam_Resume.pdf"));

  // Test 4: Image resume parsing via FileReader
  const mockImageFile = {
    name: "Resume_Screenshot.png",
    type: "image/png",
    _mockText: "" // No text detected -> triggers FileReader OCR path
  };
  const fileInput = doc.getElementById('resume-file-input');
  fileInput.dispatchEvent(new MockEvent('change', {
    target: { files: [mockImageFile] }
  }));
  await new Promise(r => setTimeout(r, 40));
  assert.ok(statusEl.textContent.includes("Successfully extracted profile from Resume_Screenshot.png"));

  // Test 5: Scanned PDF without text or image mimeType
  const mockScannedPdf = {
    name: "Scanned_Resume.pdf",
    type: "application/pdf",
    _mockText: ""
  };
  fileInput.dispatchEvent(new MockEvent('change', {
    target: { files: [mockScannedPdf] }
  }));
  await new Promise(r => setTimeout(r, 20));
  assert.ok(statusEl.textContent.includes("No readable text detected in this PDF"));

  // Test 6: Parse raw pasted text - empty error
  doc.getElementById('resume-text-input').value = "   ";
  doc.getElementById('btn-parse-resume-text').click();
  assert.strictEqual(env.alerts[env.alerts.length - 1], "Please paste your resume text first.");

  // Test 7: Parse raw pasted text - success
  doc.getElementById('resume-text-input').value = "Pritam Rauniyar\nExperienced Architect & Engineer\nSkills: AI, Distributed Systems";
  await doc.getElementById('btn-parse-resume-text').click();
  assert.ok(env.alerts[env.alerts.length - 1].includes("Successfully parsed resume text"));

  // Test 8: Parse raw pasted text - error from Gemini
  env.setRuntimeHandler('PARSE_RESUME_TEXT', (msg, cb) => {
    cb({ error: "Gemini quota exceeded" });
  });
  doc.getElementById('resume-text-input').value = "Pritam Rauniyar - Resume Text";
  await doc.getElementById('btn-parse-resume-text').click();
  assert.strictEqual(env.alerts[env.alerts.length - 1], "Gemini quota exceeded");
});

test('Popup UI: Activity Logs Feed, Telemetry Metrics, Ignored Fields and Exporting', async (t) => {
  const doc = buildPopupDOM();
  const env = setupMockEnv(doc);

  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await doc.dispatchDomContentLoaded();

  // Switch to logs tab to render telemetry
  doc.querySelector('.ap-tab[data-tab="tab-logs"]').click();
  await new Promise(r => setTimeout(r, 20));

  // Verify telemetry counts
  assert.strictEqual(String(doc.getElementById('log-stat-autofills').textContent), "15");
  assert.strictEqual(String(doc.getElementById('log-stat-captures').textContent), "3");
  assert.strictEqual(String(doc.getElementById('log-stat-errors').textContent), "1");
  assert.strictEqual(doc.getElementById('log-stat-success-rate').textContent, "93.3% Success");
  assert.strictEqual(doc.getElementById('log-stat-compulsory').textContent, "8 Filled");
  assert.strictEqual(doc.getElementById('log-stat-compulsory-unfilled').textContent, "1 Unfilled");
  assert.strictEqual(doc.getElementById('log-stat-optional').textContent, "4 Filled");
  assert.strictEqual(doc.getElementById('log-stat-optional-unfilled').textContent, "2 Skipped");

  // Test Activity Log Feed rendering and filtering
  const feed = doc.getElementById('audit-log-feed');
  assert.ok(feed.innerHTML.includes("Email Address"));
  assert.ok(feed.innerHTML.includes("Phone Number"));

  const filterInput = doc.getElementById('log-filter-input');
  filterInput.value = "Phone";
  filterInput.dispatchEvent(new MockEvent('input'));
  await new Promise(r => setTimeout(r, 20));
  assert.ok(feed.innerHTML.includes("Phone Number"));
  assert.ok(!feed.innerHTML.includes("Salary Expectation"));

  filterInput.value = "nonexistent_term";
  filterInput.dispatchEvent(new MockEvent('input'));
  await new Promise(r => setTimeout(r, 20));
  assert.ok(feed.innerHTML.includes("No matching activity logged"));

  filterInput.value = "";
  filterInput.dispatchEvent(new MockEvent('input'));
  await new Promise(r => setTimeout(r, 20));

  // Test Ignored Fields list and un-ignoring
  assert.strictEqual(doc.getElementById('ignored-fields-count').textContent, "1");
  const unignoreBtn = doc.querySelector('.ap-btn-unignore');
  assert.ok(unignoreBtn);
  await unignoreBtn.click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(String(doc.getElementById('ignored-fields-count').textContent), "0");
  assert.ok(doc.getElementById('ignored-fields-list').innerHTML.includes("No ignored optional fields yet"));

  // Test Export JSON button
  doc.getElementById('btn-export-logs-json').click();

  // Test Export CSV button
  doc.getElementById('btn-export-logs-csv').click();

  // Test Clear Logs button (Confirm Cancel)
  env.setConfirmReturn(false);
  doc.getElementById('btn-clear-logs').click();
  assert.strictEqual(env.getLogs().length, 5);

  // Test Clear Logs button (Confirm OK)
  env.setConfirmReturn(true);
  await doc.getElementById('btn-clear-logs').click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(env.getLogs().length, 0);
  assert.ok(feed.innerHTML.includes("No matching activity logged"));

  // Test Background AI Sync Now button
  env.setRuntimeHandler('TRIGGER_BACKGROUND_SYNC_NOW', (msg, cb) => {
    cb({ success: true, processedCount: 3 });
  });
  await doc.getElementById('btn-sync-ai-memory').click();
  await new Promise(r => setTimeout(r, 20));
  assert.ok(doc.getElementById('btn-sync-ai-memory').innerHTML.includes("Synced & Refined (3 items)"));
});

// ==========================================
// TEST SUITE: SIDEPANEL (sidepanel/sidepanel.js)
// ==========================================
test('Sidepanel Companion: Initialization, Form Controls, Rescan and Quick Copy Drawer', async (t) => {
  const doc = buildSidepanelDOM();
  const env = setupMockEnv(doc);

  let autofillCalled = false;
  env.setTabHandler('AUTOFILL', (msg, cb) => {
    autofillCalled = true;
    cb({ filledCount: 5 });
  });

  let scanAiCalled = false;
  env.setTabHandler('SUGGEST_UNMATCHED', (msg, cb) => {
    scanAiCalled = true;
  });

  let captureCalled = false;
  env.setTabHandler('CAPTURE_PAGE_FIELDS', (msg, cb) => {
    captureCalled = true;
    cb({ capturedCount: 3 });
  });

  env.setTabHandler('SCAN_FIELDS', (msg, cb) => {
    cb({ total: 12, matchedCount: 10, unmatchedCount: 2 });
  });

  delete require.cache[require.resolve('../sidepanel/sidepanel.js')];
  require('../sidepanel/sidepanel.js');
  await doc.dispatchDomContentLoaded();

  // Verify form status badge and counts on load
  assert.strictEqual(String(doc.getElementById('sp-stat-total').textContent), "12");
  assert.strictEqual(String(doc.getElementById('sp-stat-matched').textContent), "10");
  assert.strictEqual(String(doc.getElementById('sp-stat-unmatched').textContent), "2");

  // Test Save API key in side panel - empty error
  doc.getElementById('sp-api-key-input').value = "  ";
  doc.getElementById('sp-btn-save-key').click();
  assert.strictEqual(env.alerts[env.alerts.length - 1], "Please paste your Gemini API key.");

  // Test Save API key in side panel - success
  doc.getElementById('sp-api-key-input').value = "AIzaSySidepanelSavedKey";
  await doc.getElementById('sp-btn-save-key').click();
  assert.strictEqual(env.alerts[env.alerts.length - 1], "Gemini API key saved successfully!");
  assert.strictEqual(doc.getElementById('sp-api-banner').style.display, "none");

  // Test Rescan button
  doc.getElementById('sp-btn-refresh').click();

  // Test Export logs button in side panel
  doc.getElementById('sp-btn-export-logs').click();

  // Test Autofill button in side panel
  await doc.getElementById('sp-autofill-btn').click();
  assert.strictEqual(autofillCalled, true);

  // Test Learn Page (Capture) button in side panel
  await doc.getElementById('sp-capture-btn').click();
  assert.strictEqual(captureCalled, true);

  // Test AI Unmatched button in side panel
  await doc.getElementById('sp-scan-ai-btn').click();
  assert.strictEqual(scanAiCalled, true);

  // Test Quick Copy Drawer items and clipboard click
  const drawerList = doc.getElementById('sp-drawer-list');
  const chips = drawerList.querySelectorAll('.sp-copy-chip');
  assert.ok(chips.length > 5);

  // Click on the first chip (Full Name: Pritam Rauniyar)
  await chips[0].click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(env.getCopied(), "Pritam Rauniyar");
  assert.ok(chips[0].innerHTML.includes("Copied!"));

  // Test AI Essay Scratchpad - empty prompt error
  doc.getElementById('sp-ai-prompt').value = "   ";
  doc.getElementById('sp-btn-generate-essay').click();
  assert.strictEqual(env.alerts[env.alerts.length - 1], "Please enter a question or prompt first.");

  // Test AI Essay Scratchpad - successful answer generation
  env.setRuntimeHandler('GENERATE_AI_ANSWER', (msg, cb) => {
    assert.strictEqual(msg.question, "Why do you want to join our company?");
    cb({ answer: "I am passionate about scaling resilient systems and contributing to high-impact products." });
  });
  doc.getElementById('sp-ai-prompt').value = "Why do you want to join our company?";
  await doc.getElementById('sp-btn-generate-essay').click();
  assert.strictEqual(doc.getElementById('sp-ai-result-box').style.display, "block");
  assert.strictEqual(doc.getElementById('sp-ai-result').value, "I am passionate about scaling resilient systems and contributing to high-impact products.");

  // Test Copy Drafted Essay button
  await doc.getElementById('sp-btn-copy-essay').click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(env.getCopied(), "I am passionate about scaling resilient systems and contributing to high-impact products.");
  assert.ok(doc.getElementById('sp-btn-copy-essay').textContent.includes("Copied to Clipboard"));

  // Test AI Essay Scratchpad - API error response
  env.setRuntimeHandler('GENERATE_AI_ANSWER', (msg, cb) => {
    cb({ error: "Gemini Rate Limit Exceeded" });
  });
  doc.getElementById('sp-ai-prompt').value = "What is your leadership style?";
  await doc.getElementById('sp-btn-generate-essay').click();
  assert.strictEqual(env.alerts[env.alerts.length - 1], "Gemini Rate Limit Exceeded");

  // Test Sidepanel active tab with runtime error
  global.chrome.runtime.lastError = { message: "Cannot connect to tab" };
  env.setTabHandler('SCAN_FIELDS', (msg, cb) => {
    cb(null);
  });
  doc.getElementById('sp-btn-refresh').click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(doc.getElementById('sp-status-badge').textContent, "Open a job portal tab");
  assert.strictEqual(String(doc.getElementById('sp-stat-total').textContent), "0");
  global.chrome.runtime.lastError = null;
});

test('Popup UI: Edge Cases, Error States, Fallbacks and Model Upgrades', async (t) => {
  const doc = buildPopupDOM();
  const env = setupMockEnv(doc);

  // Configure profile with legacy model, empty experience items, and no API key
  const profile = env.getProfile();
  profile.settings.model = "gemini-2.5-flash";
  profile.settings.geminiApiKey = "";
  profile.experience.items = [];
  env.setProfile(profile);

  // Set tab handler to simulate error on tab inspection
  global.chrome.runtime.lastError = { message: "Port closed" };
  env.setTabHandler('SCAN_FIELDS', (msg, cb) => {
    cb(null);
  });

  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await doc.dispatchDomContentLoaded();

  // 1. Verify legacy model was automatically upgraded
  assert.strictEqual(doc.getElementById('setting-model').value, "gemini-3.6-flash");
  assert.strictEqual(env.getProfile().settings.model, "gemini-3.6-flash");

  // 2. Verify API key banner is displayed when key is empty
  assert.strictEqual(doc.getElementById('api-key-banner').style.display, "block");

  // 3. Verify empty experience list message is rendered
  assert.ok(doc.getElementById('experience-list').innerHTML.includes("No experience roles added yet"));

  // 4. Verify tab inspection error branch sets '-'
  assert.strictEqual(doc.getElementById('stat-detected').textContent, "-");
  assert.strictEqual(doc.getElementById('stat-matched').textContent, "-");
  assert.strictEqual(doc.getElementById('stat-unmatched').textContent, "-");
  global.chrome.runtime.lastError = null;

  // 5. Test Resume parse text error response from runtime
  env.setRuntimeHandler('PARSE_RESUME_TEXT', (msg, cb) => {
    cb({ error: "Failed to parse text resume." });
  });
  const mockPdfFile = {
    name: "Corrupt_Resume.pdf",
    type: "application/pdf",
    _mockText: "Pritam Rauniyar - Valid text length greater than 20 characters for extraction test."
  };
  const fileInput = doc.getElementById('resume-file-input');
  fileInput.dispatchEvent(new MockEvent('change', {
    target: { files: [mockPdfFile] }
  }));
  await new Promise(r => setTimeout(r, 20));
  const statusEl = doc.getElementById('resume-file-status');
  assert.ok(statusEl.textContent.includes("Failed to parse text resume"));

  // 6. Test Client-side extractor exception with image fallback error response
  global.window.PdfExtractor.extractText = async () => {
    throw new Error("Extractor library crashed");
  };
  env.setRuntimeHandler('PARSE_RESUME_FILE', (msg, cb) => {
    cb({ error: "Image OCR failed." });
  });
  const mockImageFile = {
    name: "OCR_Failure.png",
    type: "image/png"
  };
  fileInput.dispatchEvent(new MockEvent('change', {
    target: { files: [mockImageFile] }
  }));
  await new Promise(r => setTimeout(r, 40));
  assert.ok(statusEl.textContent.includes("Image OCR failed"));

  // 7. Test Telemetry metrics fallback when syncQueue has no telemetry metrics
  env.setSyncQueue([]);
  doc.querySelector('.ap-tab[data-tab="tab-logs"]').click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(String(doc.getElementById('log-stat-compulsory').textContent), "15 Filled");
  assert.strictEqual(String(doc.getElementById('log-stat-compulsory-unfilled').textContent), "1 Unfilled");

  // 8. Test Background Sync Now button with failure / empty queue response
  env.setRuntimeHandler('TRIGGER_BACKGROUND_SYNC_NOW', (msg, cb) => {
    cb({ success: false, message: "Queue is empty or API key missing" });
  });
  await doc.getElementById('btn-sync-ai-memory').click();
  await new Promise(r => setTimeout(r, 20));
  assert.ok(doc.getElementById('btn-sync-ai-memory').innerHTML.includes("Queue is empty or API key missing"));

  // 9. Test inspectActiveTab with exception during sendMessage
  const origSendMessage = global.chrome.tabs.sendMessage;
  global.chrome.tabs.sendMessage = (tabId, msg, cb) => {
    if (msg.action === "SCAN_FIELDS") {
      throw new Error("Sync send message failed on tab inspection");
    }
    if (cb) cb({ filledCount: 1 });
  };
  await doc.getElementById('btn-autofill-page').click();
  await new Promise(r => setTimeout(r, 20));
  global.chrome.tabs.sendMessage = origSendMessage;

  // 10. Test with no active tab
  const origQuery = global.chrome.tabs.query;
  global.chrome.tabs.query = async () => [];
  await doc.getElementById('btn-autofill-page').click();
  await doc.getElementById('btn-scan-unmatched').click();
  await doc.getElementById('btn-capture-page').click();
  global.chrome.tabs.query = origQuery;
});
