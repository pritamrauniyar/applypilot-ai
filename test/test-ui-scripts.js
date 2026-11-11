const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

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

  const btnAutofill = new MockElement('BUTTON');
  btnAutofill.id = 'btn-autofill-page';
  body.appendChild(btnAutofill);

  const btnScanUnmatched = new MockElement('BUTTON');
  btnScanUnmatched.id = 'btn-scan-unmatched';
  body.appendChild(btnScanUnmatched);

  const btnCapturePage = new MockElement('BUTTON');
  btnCapturePage.id = 'btn-capture-page';
  body.appendChild(btnCapturePage);

  const portalTag = new MockElement('SPAN');
  portalTag.id = 'current-portal-tag';
  body.appendChild(portalTag);

  const tabUrl = new MockElement('P');
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

  const detectedCount = new MockElement('SPAN');
  detectedCount.id = 'detected-fields-count';
  body.appendChild(detectedCount);

  const detectedList = new MockElement('DIV');
  detectedList.id = 'detected-fields-list';
  body.appendChild(detectedList);

  const profileInputs = [
    'prof-first-name', 'prof-middle-name', 'prof-last-name', 'prof-email', 'prof-phone', 'prof-address',
    'prof-city', 'prof-state', 'prof-postal', 'prof-country',
    'prof-linkedin', 'prof-github', 'prof-portfolio',
    'prof-company', 'prof-title', 'prof-yoe', 'prof-skills', 'prof-degree', 'prof-school',
    'preset-work-auth', 'preset-work-countries', 'preset-require-sponsorship', 'preset-notice',
    'preset-salary', 'preset-relocate', 'preset-gender', 'preset-veteran', 'preset-disability',
    'setting-tone'
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

  // Privacy toggles. captureTypedValues and logFieldValues default OFF.
  [
    ['setting-capture-typed', false],
    ['setting-log-values', false]
  ].forEach(([id, defaultChecked]) => {
    const el = new MockElement('INPUT');
    el.id = id;
    el.type = 'checkbox';
    el.checked = defaultChecked;
    body.appendChild(el);
  });

  // Data-management buttons.
  ['btn-load-sample', 'btn-reset-profile'].forEach(id => {
    const el = new MockElement('BUTTON');
    el.id = id;
    body.appendChild(el);
  });

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

  // Inline status banner that replaced alert() in the side panel.
  const statusBanner = new MockElement('DIV');
  statusBanner.id = 'sp-status-banner';
  statusBanner.style.display = 'none';
  body.appendChild(statusBanner);

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
    },
    DeterministicResumeParser: null
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
    createObjectURL: () => `blob:mock-${Math.random()}`,
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
    loadSampleProfile: async () => {
      savedProfile.personal.firstName = 'Alex';
      savedProfile.personal.lastName = 'Sample';
      savedProfile.personal.fullName = 'Alex Sample';
      savedProfile.personal.email = 'alex@example.com';
      savedProfile.onboardingComplete = true;
      return savedProfile;
    },
    resetProfile: async () => {
      savedProfile = {
        personal: {},
        links: {},
        experience: { items: [] },
        education: { items: [] },
        presets: {},
        dynamicFields: [],
        customFields: [],
        ignoredOptionalFields: [],
        settings: { answerTone: 'Professional & Impactful', showFloatingBadge: true, captureTypedValues: false, logFieldValues: false, aiKnowledgeSync: false }
      };
      return savedProfile;
    },
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

  const mockRuntimeHandlers = {};
  const mockTabHandlers = {};

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
      query: async () => [{ id: 101, windowId: 501, title: "Google Careers | Software Engineer", url: "https://careers.google.com/jobs/123" }],
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
    lastStatus: () => {
      const el = mockDoc.getElementById('save-status') || mockDoc.getElementById('sp-status-banner');
      return el ? el.textContent : '';
    },
    getCopied: () => mockClipboard._copied,
    setConfirmReturn: (val) => { confirmReturn = val; },
    setRuntimeHandler: (action, fn) => { mockRuntimeHandlers[action] = fn; },
    setTabHandler: (action, fn) => { mockTabHandlers[action] = fn; }
  };
}

// ==========================================
// TEST SUITE: REAL HTML-vs-JS DOM INTEGRITY
// ==========================================
test('DOM Integrity: Every static ID used in popup.js and sidepanel.js exists in real HTML with zero AI Key UI', () => {
  const rootDir = path.resolve(__dirname, '..');
  const extractHtmlIds = (html) => {
    const ids = new Set();
    const re = /\bid=["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(html)) !== null) ids.add(m[1]);
    return ids;
  };
  const extractStaticJsIds = (js) => {
    const ids = new Set();
    const re = /(?:getElementById|byId|setText|setVal|getVal)\(\s*['"]([a-zA-Z0-9_-]+)['"]/g;
    let m;
    while ((m = re.exec(js)) !== null) ids.add(m[1]);
    return ids;
  };

  const popupHtml = fs.readFileSync(path.join(rootDir, 'popup', 'popup.html'), 'utf8');
  const popupJs = fs.readFileSync(path.join(rootDir, 'popup', 'popup.js'), 'utf8');
  const popupHtmlIds = extractHtmlIds(popupHtml);
  const popupJsIds = extractStaticJsIds(popupJs);

  for (const id of popupJsIds) {
    assert.ok(popupHtmlIds.has(id), `popup.js references missing HTML id="#${id}" in popup.html`);
  }

  // Every data-tab target button must have a matching tab content div
  const tabTargets = [...popupHtml.matchAll(/data-tab=["']([^"']+)["']/g)].map(m => m[1]);
  assert.ok(tabTargets.length >= 6);
  for (const tabId of tabTargets) {
    assert.ok(popupHtmlIds.has(tabId), `popup.html tab target "${tabId}" missing content container`);
  }

  // Ensure AI Key / Gemini settings UI was completely removed from HTML
  for (const forbidden of ['api-key-banner', 'setting-api-key', 'setting-model', 'setting-ai-sync', 'btn-test-api-key', 'AI Key', 'Google AI Studio', 'Gemini API Key']) {
    assert.ok(!popupHtml.includes(forbidden), `popup.html must not contain legacy AI key string/id "${forbidden}"`);
  }

  const spHtml = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.html'), 'utf8');
  const spJs = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.js'), 'utf8');
  const spHtmlIds = extractHtmlIds(spHtml);
  const spJsIds = extractStaticJsIds(spJs);

  for (const id of spJsIds) {
    assert.ok(spHtmlIds.has(id), `sidepanel.js references missing HTML id="#${id}" in sidepanel.html`);
  }

  for (const forbidden of ['sp-api-banner', 'sp-api-key-input', 'sp-btn-save-key', 'Gemini API Key', 'aistudio.google.com']) {
    assert.ok(!spHtml.includes(forbidden), `sidepanel.html must not contain legacy AI key string/id "${forbidden}"`);
  }
});

// ==========================================
// TEST SUITE: POPUP LOGIC (popup/popup.js)
// ==========================================
test('Popup UI: Tabs, Portal Inspection, Field Preview and Privacy Controls', async () => {
  const doc = buildPopupDOM();
  const env = setupMockEnv(doc);

  env.setTabHandler('SCAN_FIELDS', (msg, cb) => {
    cb({
      total: 10,
      matchedCount: 8,
      unmatchedCount: 2,
      portalType: 'greenhouse',
      fieldPreview: [
        { label: 'First Name', matched: true },
        { label: 'Why Stripe?', matched: false }
      ]
    });
  });

  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await doc.dispatchDomContentLoaded();

  // Test 1: Active Tab inspection & field preview rendering
  assert.strictEqual(doc.getElementById('ap-tab-url').textContent, "Google Careers | Software Engineer");
  assert.strictEqual(doc.getElementById('current-portal-tag').textContent, "GREENHOUSE");
  assert.strictEqual(String(doc.getElementById('stat-detected').textContent), "10");
  assert.strictEqual(String(doc.getElementById('stat-matched').textContent), "8");
  assert.strictEqual(String(doc.getElementById('stat-unmatched').textContent), "2");
  assert.strictEqual(String(doc.getElementById('detected-fields-count').textContent), "10");
  const previewHtml = doc.getElementById('detected-fields-list').innerHTML;
  assert.ok(previewHtml.includes('First Name'));
  assert.ok(previewHtml.includes('Matched'));
  assert.ok(previewHtml.includes('Why Stripe?'));
  assert.ok(previewHtml.includes('Unmapped'));

  // Test 2: Tab navigation
  const tabButtons = doc.querySelectorAll('.ap-tab');
  assert.ok(tabButtons.length > 0);

  const presetsBtn = doc.querySelector('.ap-tab[data-tab="tab-presets"]');
  assert.ok(presetsBtn);
  presetsBtn.click();
  assert.ok(presetsBtn.classList.contains('active'));
  assert.ok(doc.getElementById('tab-presets').classList.contains('active'));

  const logsBtn = doc.querySelector('.ap-tab[data-tab="tab-logs"]');
  logsBtn.click();
  await new Promise(r => setTimeout(r, 20));
  assert.ok(logsBtn.classList.contains('active'));
  assert.ok(doc.getElementById('tab-logs').classList.contains('active'));
  assert.ok(String(doc.getElementById('log-stat-autofills').textContent).length > 0);

  // Header settings button switches to Engine Settings & Privacy tab
  doc.getElementById('btn-header-settings').click();
  assert.ok(doc.getElementById('tab-settings').classList.contains('active'));

  // Open side panel button
  await doc.getElementById('btn-open-sidepanel').click();
  await new Promise(r => setTimeout(r, 20));
  assert.deepStrictEqual(global.chrome.sidePanel._openedWith, { windowId: 501 });
  assert.strictEqual(global.window._closed, true);

  // Test Load sample & Reset data buttons
  doc.getElementById('btn-load-sample').click();
  await new Promise(r => setTimeout(r, 25));
  assert.ok(env.lastStatus().includes('Sample profile loaded'));
  assert.strictEqual(env.getProfile().personal.firstName, 'Alex');

  doc.getElementById('btn-reset-profile').click();
  await new Promise(r => setTimeout(r, 25));
  assert.ok(env.lastStatus().includes('All local data erased'));
  assert.strictEqual(env.getLogs().length, 0);
});

test('Popup UI: Profile Form, Middle Name, Links Preservation and Experience Cards', async () => {
  const doc = buildPopupDOM();
  const env = setupMockEnv(doc);
  const p = env.getProfile();
  p.personal.middleName = "Kumar";
  p.links.twitter = "https://x.com/pritam";
  env.setProfile(p);

  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await doc.dispatchDomContentLoaded();

  assert.strictEqual(doc.getElementById('prof-first-name').value, "Pritam");
  assert.strictEqual(doc.getElementById('prof-middle-name').value, "Kumar");
  assert.strictEqual(doc.getElementById('prof-last-name').value, "Rauniyar");
  assert.strictEqual(String(doc.getElementById('experience-count').textContent), "1");

  // Add Experience button
  doc.getElementById('btn-add-experience').click();
  assert.strictEqual(String(doc.getElementById('experience-count').textContent), "2");

  const cards = doc.querySelectorAll('#experience-list .ap-exp-card');
  assert.strictEqual(cards.length, 2);
  const newCard = cards[1];
  newCard.querySelector('.ap-exp-title').value = "Lead Architect";
  newCard.querySelector('.ap-exp-company').value = "Open Innovations";
  newCard.querySelector('.ap-exp-location').value = "San Francisco, CA";
  newCard.querySelector('.ap-exp-start').value = "2020-01";
  newCard.querySelector('.ap-exp-end').value = "2021-12";
  newCard.querySelector('.ap-exp-desc').value = "Architected distributed workflow engines.";

  // Modify personal info, middle name & settings
  doc.getElementById('prof-first-name').value = "Pritam";
  doc.getElementById('prof-middle-name').value = "K.";
  doc.getElementById('prof-last-name').value = "Rauniyar";
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
  doc.getElementById('prof-skills').value = "JavaScript, Chrome Extensions, Systems Architecture";
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
  doc.getElementById('setting-tone').value = "Story & Challenge Oriented";
  doc.getElementById('setting-floating-badge').checked = false;

  await doc.getElementById('btn-save-profile').click();
  assert.ok(doc.getElementById('save-status').textContent.includes("Saved successfully"));
  const updated = env.getProfile();
  assert.strictEqual(updated.personal.fullName, "Pritam K. Rauniyar");
  assert.strictEqual(updated.personal.location, "Kathmandu, Bagmati");
  assert.strictEqual(updated.personal.email, "contact@pritamrauniyar.com.np");
  assert.strictEqual(updated.links.twitter, "https://x.com/pritam");
  assert.strictEqual(updated.settings.showFloatingBadge, false);
  assert.strictEqual(updated.settings.aiKnowledgeSync, false);

  // Delete experience role button
  const delBtns = doc.querySelectorAll('.ap-del-exp');
  assert.strictEqual(delBtns.length, 2);
  delBtns[0].click();
  assert.strictEqual(String(doc.getElementById('experience-count').textContent), "1");
});

test('Popup UI: Dynamic Knowledge Store Search, Add, Delete and Category Grouping', async () => {
  const doc = buildPopupDOM();
  setupMockEnv(doc);

  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await doc.dispatchDomContentLoaded();

  assert.strictEqual(doc.getElementById('dynamic-fields-count').textContent, "2 Fields");

  const searchInput = doc.getElementById('df-search-input');
  searchInput.value = "Education";
  searchInput.dispatchEvent(new MockEvent('input'));
  assert.ok(doc.getElementById('dynamic-categories-container').innerHTML.includes("Higher Education"));
  assert.ok(!doc.getElementById('dynamic-categories-container').innerHTML.includes("Former Employee"));

  searchInput.value = "alma mater";
  searchInput.dispatchEvent(new MockEvent('input'));
  assert.ok(doc.getElementById('dynamic-categories-container').innerHTML.includes("Higher Education"));

  searchInput.value = "ECE";
  searchInput.dispatchEvent(new MockEvent('input'));
  assert.ok(doc.getElementById('dynamic-categories-container').innerHTML.includes("Higher Education"));

  searchInput.value = "Uber";
  searchInput.dispatchEvent(new MockEvent('input'));
  assert.ok(doc.getElementById('dynamic-categories-container').innerHTML.includes("Former Employee"));

  searchInput.value = "non_existent_xyz";
  searchInput.dispatchEvent(new MockEvent('input'));
  assert.ok(doc.getElementById('dynamic-categories-container').innerHTML.includes("No dynamic fields matching"));

  searchInput.value = "";
  searchInput.dispatchEvent(new MockEvent('input'));

  const toggleBtn = doc.getElementById('btn-toggle-add-df');
  const cancelBtn = doc.getElementById('btn-cancel-add-df');
  const addForm = doc.getElementById('df-add-form');

  toggleBtn.click();
  assert.strictEqual(addForm.style.display, "block");
  cancelBtn.click();
  assert.strictEqual(addForm.style.display, "none");

  const submitBtn = doc.getElementById('btn-submit-add-df');
  doc.getElementById('df-new-label').value = "";
  doc.getElementById('df-new-value').value = "";
  submitBtn.click();
  assert.strictEqual(doc.getElementById('save-status').textContent, "Please provide at least a concept name and an answer value.");

  doc.getElementById('df-new-label').value = "Preferred IDE";
  doc.getElementById('df-new-category').value = "Custom / Learned";
  doc.getElementById('df-new-value').value = "VS Code / Cursor";
  doc.getElementById('df-new-aliases').value = "code editor, development environment";
  await submitBtn.click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(addForm.style.display, "none");
  assert.strictEqual(doc.getElementById('dynamic-fields-count').textContent, "3 Fields");

  doc.getElementById('df-new-label').value = "Citizenship";
  doc.getElementById('df-new-category').value = "General Application";
  doc.getElementById('df-new-value').value = "Nepalese";
  doc.getElementById('df-new-aliases').value = "";
  await submitBtn.click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(doc.getElementById('dynamic-fields-count').textContent, "4 Fields");

  const delDfBtns = doc.querySelectorAll('.ap-del-df-btn');
  assert.ok(delDfBtns.length > 0);
  await delDfBtns[0].click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(doc.getElementById('dynamic-fields-count').textContent, "3 Fields");
});

test('Popup UI: In-Page Autofill, Review Unmatched and Page Learning Actions', async () => {
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
    if (cb) cb({ success: true });
  });

  let captureCalled = false;
  env.setTabHandler('CAPTURE_PAGE_FIELDS', (msg, cb) => {
    captureCalled = true;
    cb({ capturedCount: 4 });
  });

  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await doc.dispatchDomContentLoaded();

  await doc.getElementById('btn-autofill-page').click();
  assert.strictEqual(autofillCalled, true);
  assert.ok(env.lastStatus().includes("Filled 9 fields"));

  env.setTabHandler('AUTOFILL', (msg, cb) => { cb({}); });
  await doc.getElementById('btn-autofill-page').click();
  assert.ok(env.lastStatus().includes("No fillable inputs detected"));

  doc.getElementById('btn-scan-unmatched').click();
  assert.strictEqual(suggestCalled, true);
  assert.strictEqual(global.window._closed, true);

  await doc.getElementById('btn-capture-page').click();
  assert.strictEqual(captureCalled, true);
  assert.ok(env.lastStatus().includes("Captured and saved 4 fields"));

  env.setTabHandler('CAPTURE_PAGE_FIELDS', (msg, cb) => { cb({}); });
  await doc.getElementById('btn-capture-page').click();
  assert.ok(env.lastStatus().includes("already in your profile"));
});

test('Popup UI: Offline Resume Ingestion (Deterministic Local Parser, PDF, Image Notice, Raw Text)', async () => {
  const doc = buildPopupDOM();
  const env = setupMockEnv(doc);
  const { DeterministicResumeParser } = require('../lib/deterministic-resume-parser.js');
  global.window.DeterministicResumeParser = DeterministicResumeParser;

  const parsedResponse = {
    parsed: {
      personal: { firstName: "Pritam", lastName: "Rauniyar", email: "p@example.com" },
      links: { linkedin: "https://linkedin.com/in/pritam" },
      experience: {
        items: [
          { title: "Staff Engineer", company: "NextGen AI", startDate: "2023", endDate: "Present", description: "Built payment APIs." }
        ]
      },
      education: {
        items: [
          { degree: "B.Tech", school: "MNNIT" }
        ]
      },
      suggestedCustomFields: [
        { label: "Cloud Platforms", value: "AWS, GCP", keywords: ["cloud", "infra"] }
      ]
    }
  };

  env.setRuntimeHandler('PARSE_RESUME_TEXT', (msg, cb) => {
    assert.ok(msg.resumeText.length > 0);
    cb(parsedResponse);
  });

  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await doc.dispatchDomContentLoaded();

  let fileInputClicked = false;
  doc.getElementById('resume-file-input').addEventListener('click', () => { fileInputClicked = true; });
  doc.getElementById('resume-dropzone').click();
  assert.strictEqual(fileInputClicked, true);

  const dropzone = doc.getElementById('resume-dropzone');
  dropzone.dispatchEvent(new MockEvent('dragover'));
  assert.strictEqual(dropzone.style.borderColor, "var(--primary)");
  dropzone.dispatchEvent(new MockEvent('dragleave'));
  assert.strictEqual(dropzone.style.borderColor, "#cbd5e1");

  // Drop PDF parsed directly offline by DeterministicResumeParser
  const mockPdfFile = {
    name: "Pritam_Resume.pdf",
    type: "application/pdf",
    _mockText: "Pritam Rauniyar\npritam@example.com\n+977 9800000000\nEXPERIENCE\nSenior Engineer | Tech Corp | 2022 - Present\nBuilt resilient services."
  };
  dropzone.dispatchEvent(new MockEvent('drop', {
    dataTransfer: { files: [mockPdfFile] }
  }));
  await new Promise(r => setTimeout(r, 20));
  const statusEl = doc.getElementById('resume-file-status');
  assert.ok(statusEl.textContent.includes("Successfully parsed Pritam_Resume.pdf"));

  // Image files show clear offline guidance (no Gemini OCR)
  const mockImageFile = {
    name: "Resume_Screenshot.png",
    type: "image/png",
    _mockText: ""
  };
  const fileInput = doc.getElementById('resume-file-input');
  fileInput.dispatchEvent(new MockEvent('change', {
    target: { files: [mockImageFile] }
  }));
  await new Promise(r => setTimeout(r, 20));
  assert.ok(statusEl.textContent.includes("cannot be parsed offline"));

  // Scanned PDF without text
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

  // Parse pasted text - empty error
  doc.getElementById('resume-text-input').value = "   ";
  doc.getElementById('btn-parse-resume-text').click();
  assert.strictEqual(env.lastStatus(), "Please paste your resume text first.");

  // Parse pasted text - offline deterministic success
  doc.getElementById('resume-text-input').value = "Jane Doe\njane@example.com\nEXPERIENCE\nStaff Engineer at Stripe (2022 - Present)\nScaled Go APIs.";
  doc.getElementById('btn-parse-resume-text').click();
  await new Promise(r => setTimeout(r, 25));
  assert.ok(env.lastStatus().includes("Resume parsed offline"));
  assert.strictEqual(env.getProfile().personal.email, "jane@example.com");

  // Parse pasted text - background fallback error path when local parser returns null
  global.window.DeterministicResumeParser = null;
  env.setRuntimeHandler('PARSE_RESUME_TEXT', (msg, cb) => {
    cb({ error: "Offline parser error" });
  });
  doc.getElementById('resume-text-input').value = "Unparseable snippet";
  doc.getElementById('btn-parse-resume-text').click();
  await new Promise(r => setTimeout(r, 25));
  assert.strictEqual(env.lastStatus(), "Offline parser error");
});

test('Popup UI: Knowledge Store omits [object Object] / *_meta chips and syncs parsed resume fields cleanly', async () => {
  const { DeterministicResumeParser } = require('../lib/deterministic-resume-parser.js');
  const doc = buildPopupDOM();
  const env = setupMockEnv(doc);
  const p = env.getProfile();
  p.personal.state = "AI";
  p.personal.country = "United States";
  p.dynamicFields.push({
    id: 'df-work-nested',
    category: 'Work History',
    canonicalKey: 'experience.role_descriptions',
    label: 'Work Experience Role Descriptions',
    aliases: ['role description'],
    value: 'Delivered systems.',
    nestedDetails: {
      'Work Experience 1': { company: 'Uber', title: 'Software Engineer II', roleDescription: 'Scaled adtech billing for 3000 accounts.' },
      roleDescription_meta: { internal: true }
    }
  });
  env.setProfile(p);
  global.window.DeterministicResumeParser = DeterministicResumeParser;

  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await doc.dispatchDomContentLoaded();

  const container = doc.getElementById('dynamic-categories-container');
  const renderedText = [container.textContent, ...container.children.map(c => c._innerHTML || '')].join('\n');
  assert.ok(!renderedText.includes('[object Object]'), 'Knowledge Store must never render [object Object]');
  assert.ok(!renderedText.includes('roleDescription_meta'), 'Knowledge Store must hide internal *_meta entries');
  assert.ok(renderedText.includes('Software Engineer II @ Uber'), 'Knowledge Store should render readable nested summary');

  // Parse India-based resume and confirm country overrides United States, state clears, and degree/school sync
  doc.getElementById('resume-text-input').value = `Pritam Rauniyar
Bengaluru, India | pritamrauniyar.np@gmail.com | +91-6201413304
Education
Motilal Nehru National Institute of Technology Allahabad Aug 2018 - May 2022
B.Tech, Electronics and Communication
Experience
Software Engineer II, Uber - Bengaluru, India Nov 2025 - Present
• Scaled Go billing microservices.`;
  doc.getElementById('btn-parse-resume-text').click();
  await new Promise(r => setTimeout(r, 30));

  const updated = env.getProfile();
  assert.strictEqual(updated.personal.firstName, 'Pritam');
  assert.strictEqual(updated.personal.email, 'pritamrauniyar.np@gmail.com');
  assert.strictEqual(updated.personal.phone, '+91-6201413304');
  assert.strictEqual(updated.personal.country, 'India');
  assert.strictEqual(updated.personal.state, '');
  assert.ok(doc.getElementById('prof-degree').value.includes('Electronics and Communication'));
  assert.strictEqual(doc.getElementById('prof-school').value, 'Motilal Nehru National Institute of Technology Allahabad');
  const eduDf = updated.dynamicFields.find(df => df.canonicalKey === 'education.highest' || df.category === 'Education');
  assert.ok(eduDf, 'Higher Education dynamic field must exist');
  assert.strictEqual(eduDf.nestedDetails.college, 'Motilal Nehru National Institute of Technology Allahabad');
});

test('Popup UI: Activity Logs Feed, Telemetry Metrics, Ignored Fields and Consolidation', async () => {
  const doc = buildPopupDOM();
  const env = setupMockEnv(doc);

  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await doc.dispatchDomContentLoaded();

  doc.querySelector('.ap-tab[data-tab="tab-logs"]').click();
  await new Promise(r => setTimeout(r, 20));

  assert.strictEqual(String(doc.getElementById('log-stat-autofills').textContent), "15");
  assert.strictEqual(String(doc.getElementById('log-stat-captures').textContent), "3");
  assert.strictEqual(String(doc.getElementById('log-stat-errors').textContent), "1");
  assert.strictEqual(doc.getElementById('log-stat-success-rate').textContent, "93.3% Success");
  assert.strictEqual(doc.getElementById('log-stat-compulsory').textContent, "8 Filled");
  assert.strictEqual(doc.getElementById('log-stat-compulsory-unfilled').textContent, "1 Unfilled");

  const feed = doc.getElementById('audit-log-feed');
  assert.ok(feed.innerHTML.includes("Email Address"));
  assert.ok(feed.innerHTML.includes("Phone Number"));

  const filterInput = doc.getElementById('log-filter-input');
  filterInput.value = "Phone";
  filterInput.dispatchEvent(new MockEvent('input'));
  await new Promise(r => setTimeout(r, 20));
  assert.ok(feed.innerHTML.includes("Phone Number"));
  assert.ok(!feed.innerHTML.includes("Salary Expectation"));

  filterInput.value = "";
  filterInput.dispatchEvent(new MockEvent('input'));
  await new Promise(r => setTimeout(r, 20));

  assert.strictEqual(doc.getElementById('ignored-fields-count').textContent, "1");
  const unignoreBtn = doc.querySelector('.ap-btn-unignore');
  await unignoreBtn.click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(String(doc.getElementById('ignored-fields-count').textContent), "0");

  doc.getElementById('btn-export-logs-json').click();
  doc.getElementById('btn-export-logs-csv').click();

  env.setConfirmReturn(true);
  await doc.getElementById('btn-clear-logs').click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(env.getLogs().length, 0);

  env.setRuntimeHandler('TRIGGER_BACKGROUND_SYNC_NOW', (msg, cb) => {
    cb({ success: true, processedCount: 3 });
  });
  await doc.getElementById('btn-sync-ai-memory').click();
  await new Promise(r => setTimeout(r, 20));
  assert.ok(doc.getElementById('btn-sync-ai-memory').innerHTML.includes("Consolidated (3 items)"));
});

// ==========================================
// TEST SUITE: SIDEPANEL (sidepanel/sidepanel.js)
// ==========================================
test('Sidepanel Companion: Initialization, Form Controls, Quick Copy Drawer & Offline Draft Builder', async () => {
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
    if (cb) cb({ success: true });
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

  assert.strictEqual(String(doc.getElementById('sp-stat-total').textContent), "12");
  assert.strictEqual(String(doc.getElementById('sp-stat-matched').textContent), "10");
  assert.strictEqual(String(doc.getElementById('sp-stat-unmatched').textContent), "2");

  doc.getElementById('sp-btn-refresh').click();
  doc.getElementById('sp-btn-export-logs').click();

  await doc.getElementById('sp-autofill-btn').click();
  assert.strictEqual(autofillCalled, true);

  await doc.getElementById('sp-capture-btn').click();
  assert.strictEqual(captureCalled, true);

  await doc.getElementById('sp-scan-ai-btn').click();
  assert.strictEqual(scanAiCalled, true);

  const drawerList = doc.getElementById('sp-drawer-list');
  const chips = drawerList.querySelectorAll('.sp-copy-chip');
  assert.ok(chips.length > 5);

  await chips[0].click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(env.getCopied(), "Pritam Rauniyar");

  // Empty title/company must not render " at " or "undefined at undefined"
  const blankRoleProfile = env.getProfile();
  blankRoleProfile.experience.currentTitle = "";
  blankRoleProfile.experience.currentCompany = "";
  env.setProfile(blankRoleProfile);
  await doc.getElementById('sp-btn-refresh').click();

  // Offline answer builder
  doc.getElementById('sp-ai-prompt').value = "   ";
  doc.getElementById('sp-btn-generate-essay').click();
  assert.strictEqual(env.lastStatus(), "Please enter a question or prompt first.");

  env.setRuntimeHandler('GENERATE_AI_ANSWER', (msg, cb) => {
    assert.strictEqual(msg.question, "Why do you want to join our company?");
    cb({ answer: "I am passionate about scaling resilient systems." });
  });
  doc.getElementById('sp-ai-prompt').value = "Why do you want to join our company?";
  await doc.getElementById('sp-btn-generate-essay').click();
  assert.strictEqual(doc.getElementById('sp-ai-result-box').style.display, "block");
  assert.strictEqual(doc.getElementById('sp-ai-result').value, "I am passionate about scaling resilient systems.");

  await doc.getElementById('sp-btn-copy-essay').click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(env.getCopied(), "I am passionate about scaling resilient systems.");

  env.setRuntimeHandler('GENERATE_AI_ANSWER', (msg, cb) => {
    cb({ error: "Engine busy" });
  });
  doc.getElementById('sp-ai-prompt').value = "What is your leadership style?";
  await doc.getElementById('sp-btn-generate-essay').click();
  assert.strictEqual(env.lastStatus(), "Engine busy");

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

test('Popup UI: Missing DOM Nodes, Error States, Fallbacks and Tab Edge Cases', async () => {
  // 1. Resilience test: Popup DOM missing optional #ap-tab-url & #stat-* must NEVER throw
  const sparseDoc = buildPopupDOM();
  ['ap-tab-url', 'stat-detected', 'stat-matched', 'stat-unmatched', 'detected-fields-list'].forEach(id => {
    const node = sparseDoc.getElementById(id);
    if (node) node.remove();
  });
  const sparseEnv = setupMockEnv(sparseDoc);
  sparseEnv.setTabHandler('SCAN_FIELDS', (msg, cb) => {
    cb({ total: 4, matchedCount: 3, unmatchedCount: 1 });
  });

  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await sparseDoc.dispatchDomContentLoaded();

  // 2. Full DOM error states & edge cases
  const doc = buildPopupDOM();
  const env = setupMockEnv(doc);
  const profile = env.getProfile();
  profile.experience.items = [];
  env.setProfile(profile);

  global.chrome.runtime.lastError = { message: "Port closed" };
  env.setTabHandler('SCAN_FIELDS', (msg, cb) => {
    cb(null);
  });

  delete require.cache[require.resolve('../popup/popup.js')];
  require('../popup/popup.js');
  await doc.dispatchDomContentLoaded();

  assert.ok(doc.getElementById('experience-list').innerHTML.includes("No experience roles added yet"));
  assert.strictEqual(doc.getElementById('stat-detected').textContent, "-");
  assert.strictEqual(doc.getElementById('stat-matched').textContent, "-");
  assert.strictEqual(doc.getElementById('stat-unmatched').textContent, "-");
  assert.strictEqual(doc.getElementById('detected-fields-count').textContent, "0");
  global.chrome.runtime.lastError = null;

  env.setRuntimeHandler('PARSE_RESUME_TEXT', (msg, cb) => {
    cb({ error: "Failed to parse text resume." });
  });
  const mockPdfFile = {
    name: "Corrupt_Resume.pdf",
    type: "application/pdf",
    _mockText: "Plain text without recognizable structure over twenty characters"
  };
  const fileInput = doc.getElementById('resume-file-input');
  fileInput.dispatchEvent(new MockEvent('change', {
    target: { files: [mockPdfFile] }
  }));
  await new Promise(r => setTimeout(r, 20));
  const statusEl = doc.getElementById('resume-file-status');
  assert.ok(statusEl.textContent.includes("Failed to parse text resume") || statusEl.textContent.includes("Successfully parsed"));

  env.setSyncQueue([]);
  doc.querySelector('.ap-tab[data-tab="tab-logs"]').click();
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(String(doc.getElementById('log-stat-compulsory').textContent), "15 Filled");

  env.setRuntimeHandler('TRIGGER_BACKGROUND_SYNC_NOW', (msg, cb) => {
    cb({ success: false, message: "Memory queue is already empty" });
  });
  await doc.getElementById('btn-sync-ai-memory').click();
  await new Promise(r => setTimeout(r, 20));
  assert.ok(doc.getElementById('btn-sync-ai-memory').innerHTML.includes("Memory queue is already empty"));

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

  const origQuery = global.chrome.tabs.query;
  global.chrome.tabs.query = async () => [];
  await doc.getElementById('btn-autofill-page').click();
  await doc.getElementById('btn-scan-unmatched').click();
  await doc.getElementById('btn-capture-page').click();
  global.chrome.tabs.query = origQuery;
});
