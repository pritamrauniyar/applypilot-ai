const test = require('node:test');
const assert = require('node:assert');

// 1. Setup global DOM & Chrome environment
class MockEvent {
  constructor(type, opts = {}) {
    this.type = type;
    this.bubbles = !!opts.bubbles;
    this.cancelable = !!opts.cancelable;
    this.defaultPrevented = false;
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
    this.selectedIndex = 0;
    this.options = [];
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
    this.isContentEditable = false;
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
    if (key === 'name' && this.name) return this.name;
    if (key === 'type' && this.type) return this.type;
    if (key === 'placeholder' && this.placeholder) return this.placeholder;
    return this.attributes[key] || null;
  }

  setAttribute(k, v) {
    const key = k.toLowerCase();
    this.attributes[key] = String(v);
    if (key === 'id') this.id = String(v);
    if (key === 'name') this.name = String(v);
    if (key === 'type') this.type = String(v);
    if (key === 'placeholder') this.placeholder = String(v);
  }

  removeAttribute(k) { delete this.attributes[k.toLowerCase()]; }
  hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k.toLowerCase()); }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
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
    if (typeof this['on' + evt.type] === 'function') {
      this['on' + evt.type](evt);
    }
    const list = this._listeners[evt.type] || [];
    for (const fn of list) {
      fn.call(this, evt);
    }
    return !evt.defaultPrevented;
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
      if (s.includes(':not(')) {
        if (s.startsWith('input') && this.tagName !== 'INPUT') return false;
        if (this.type === 'hidden' || this.type === 'submit' || this.type === 'button' || this.type === 'reset' || this.type === 'file') return false;
        return true;
      }
      const tagMatch = s.match(/^([a-zA-Z0-9]+)/);
      if (tagMatch) {
        if (this.tagName !== tagMatch[1].toUpperCase()) return false;
      }

      if (s.includes('[type="checkbox"]') && this.type !== 'checkbox') return false;
      if (s.includes('[type="radio"]') && this.type !== 'radio') return false;

      if (s.includes('[id*="')) {
        const target = s.split('[id*="')[1].split('"')[0].toLowerCase();
        if (!this.id || !this.id.toLowerCase().includes(target)) return false;
      }
      if (s.includes('[name*="')) {
        const target = s.split('[name*="')[1].split('"')[0].toLowerCase();
        const nameAttr = this.getAttribute('name');
        if (!nameAttr || !nameAttr.toLowerCase().includes(target)) return false;
      }
      if (s.includes('[data-automation-id*="')) {
        const target = s.split('[data-automation-id*="')[1].split('"')[0].toLowerCase();
        const autoAttr = this.getAttribute('data-automation-id');
        if (!autoAttr || !autoAttr.toLowerCase().includes(target)) return false;
      }

      if (s.startsWith('#') && this.id !== s.slice(1)) return false;
      if (s.startsWith('.')) {
        const className = s.split(/[\s,>+~[]/)[0].slice(1);
        if (!this.classList.contains(className)) return false;
      }
      if (s.includes('label[for="')) {
        const target = s.split('label[for="')[1].split('"')[0];
        if (this.tagName !== 'LABEL' || this.getAttribute('for') !== target) return false;
      }

      return true;
    });
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    if (!html || typeof html !== 'string') return;

    // Tokenize HTML elements
    const tagRegex = /<([a-zA-Z0-9]+)([^>]*?)>(.*?)(?:<\/\1>|$)|<([a-zA-Z0-9]+)([^>]*?)\/>/gs;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const tag = match[1] || match[4];
      const attrsStr = match[2] || match[5] || '';
      const inner = match[3] || '';
      const child = new MockElement(tag);

      const idMatch = attrsStr.match(/id=["']([^"']+)["']/);
      if (idMatch) child.id = idMatch[1];
      const classMatch = attrsStr.match(/class=["']([^"']+)["']/);
      if (classMatch) {
        classMatch[1].split(/\s+/).forEach(c => c && child.classList.add(c));
      }
      const typeMatch = attrsStr.match(/type=["']([^"']+)["']/);
      if (typeMatch) child.type = typeMatch[1];

      if (inner) {
        child.innerHTML = inner;
        child.textContent = inner.replace(/<[^>]+>/g, '').trim();
        if (child.tagName === 'TEXTAREA') {
          child.value = child.textContent;
        }
      }

      this.appendChild(child);
    }
  }

  get innerHTML() {
    return this._innerHTML || '';
  }

  querySelector(sel) {
    const res = this.querySelectorAll(sel);
    return res.length > 0 ? res[0] : null;
  }

  querySelectorAll(sel) {
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
    this.title = 'Senior Software Engineer | TechCorp Careers';
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
    return this.body.querySelector(sel);
  }

  querySelectorAll(sel) {
    return this.body.querySelectorAll(sel);
  }

  addEventListener(type, fn) {
    this._docListeners[type] = this._docListeners[type] || [];
    this._docListeners[type].push(fn);
  }

  dispatchEvent(evt) {
    const list = this._docListeners[evt.type] || [];
    for (const fn of list) {
      fn(evt);
    }
  }
}

// Attach globals
global.window = {
  __applypilot_testing: true,
  location: {
    href: 'https://techcorp.wd1.myworkdayjobs.com/Careers/job/R10294-Engineer',
    hostname: 'techcorp.wd1.myworkdayjobs.com'
  }
};
global.document = new MockDocument();
global.Event = MockEvent;
global.alert = (msg) => {};
global.CSS = { escape: (s) => String(s).replace(/([ #;&,.+*~':"!^$[\]()=>|/@])/g, '\\$1') };
global.getComputedStyle = () => ({ position: 'static' });
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;

global.MutationObserver = class MockMutationObserver {
  constructor(cb) { this.cb = cb; }
  observe() {}
  disconnect() {}
};

// Mock chrome
let lastSentMessage = null;
let allSentMessages = [];
let messageResponses = {};

global.chrome = {
  runtime: {
    id: 'applypilot-mock-extension-id',
    lastError: null,
    sendMessage: (msg, cb) => {
      lastSentMessage = msg;
      allSentMessages.push(msg);
      if (chrome.runtime.lastError) {
        if (cb) cb(undefined);
        return;
      }
      const resp = messageResponses[msg.action] || { success: true };
      if (cb) cb(resp);
    },
    onMessage: {
      addListener: (fn) => { global._contentOnMessage = fn; }
    }
  },
  storage: {
    local: {
      get: async (keys) => ({})
    }
  }
};

// Load dependencies
const { AtsAdapters } = require('../content/ats-adapters.js');
global.AtsAdapters = AtsAdapters;

const ContentEngine = require('../content/content.js');
const { DEFAULT_PROFILE } = require('../lib/storage.js');

test('ContentEngine: isExtensionValid & safeSendMessage', async () => {
  assert.strictEqual(ContentEngine.isExtensionValid(), true);

  // safeSendMessage with success
  let sentRes = null;
  ContentEngine.safeSendMessage({ action: 'TEST_ACT' }, (res) => {
    sentRes = res;
  });
  assert.strictEqual(lastSentMessage.action, 'TEST_ACT');
  assert.strictEqual(sentRes.success, true);

  // safeSendMessage with chrome.runtime.lastError
  chrome.runtime.lastError = { message: 'Extension context invalidated' };
  ContentEngine.safeSendMessage({ action: 'TEST_ERR' }, (res) => {
    assert.strictEqual(res.error, 'Extension context invalidated');
  });
  chrome.runtime.lastError = null;

  // Extension context invalidated check
  const origId = chrome.runtime.id;
  delete chrome.runtime.id;
  assert.strictEqual(ContentEngine.isExtensionValid(), false);
  ContentEngine.safeSendMessage({ action: 'AFTER_INVALID' }, (res) => {
    assert.strictEqual(res.error, 'Extension context invalidated');
  });
  chrome.runtime.id = origId;
});

test('ContentEngine: logAuditAction', () => {
  lastSentMessage = null;
  ContentEngine.logAuditAction({
    actionType: 'autofill',
    fieldLabel: 'First Name',
    status: 'success'
  });

  assert.ok(lastSentMessage);
  assert.strictEqual(lastSentMessage.action, 'LOG_AUDIT_ENTRY');
  assert.strictEqual(lastSentMessage.logData.portalType, 'workday');
  assert.strictEqual(lastSentMessage.logData.fieldLabel, 'First Name');

  // Test different hostnames
  const hosts = [
    { host: 'boards.greenhouse.io', expected: 'greenhouse' },
    { host: 'jobs.lever.co', expected: 'lever' },
    { host: 'jobs.ashbyhq.com', expected: 'ashby' },
    { host: 'taleo.net', expected: 'enterprise' },
    { host: 'randomjobs.org', expected: 'generic' }
  ];

  for (const h of hosts) {
    window.location.hostname = h.host;
    ContentEngine.logAuditAction({ actionType: 'test' });
    assert.strictEqual(lastSentMessage.logData.portalType, h.expected);
  }
  window.location.hostname = 'techcorp.wd1.myworkdayjobs.com';
});

test('ContentEngine: loadProfile', async () => {
  messageResponses['GET_PROFILE'] = {
    success: true,
    profile: JSON.parse(JSON.stringify(DEFAULT_PROFILE))
  };

  const prof = await ContentEngine.loadProfile();
  assert.strictEqual(prof.personal.fullName, 'Pritam Rauniyar');

  // Load from chrome.storage.local
  chrome.storage.local.get = async () => ({ applypilot_profile: { personal: { fullName: 'Cached User' } } });
  const cached = await ContentEngine.loadProfile();
  assert.strictEqual(cached.personal.fullName, 'Cached User');

  // Restore
  chrome.storage.local.get = async () => ({});
  await ContentEngine.loadProfile();
});

test('ContentEngine: setNativeValue for all form element types', () => {
  // 1. Text input
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.id = 'first_name';
  ContentEngine.setNativeValue(textInput, 'Pritam');
  assert.strictEqual(textInput.value, 'Pritam');

  // 2. Select input
  const select = document.createElement('select');
  select.options = [
    { text: 'Please Select', value: '' },
    { text: 'Yes, Authorized', value: 'yes' },
    { text: 'No', value: 'no' }
  ];
  ContentEngine.setNativeValue(select, 'yes');
  assert.strictEqual(select.selectedIndex, 1);

  // 3. Checkbox input (boolean and string 'yes')
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  ContentEngine.setNativeValue(chk, true);
  assert.strictEqual(chk.checked, true);
  ContentEngine.setNativeValue(chk, 'no');
  assert.strictEqual(chk.checked, false);

  // 4. Radio input
  const radio = document.createElement('input');
  radio.type = 'radio';
  ContentEngine.setNativeValue(radio, 'yes');
  assert.strictEqual(radio.checked, true);

  // 5. Date input (ISO, MM/YYYY, and Ongoing "Present")
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  ContentEngine.setNativeValue(dateInput, '2023-05-15');
  assert.strictEqual(dateInput.value, '2023-05-15');

  ContentEngine.setNativeValue(dateInput, '2023-06');
  assert.strictEqual(dateInput.value, '2023-06-01');

  ContentEngine.setNativeValue(dateInput, '08/2021');
  assert.strictEqual(dateInput.value, '2021-08-01');

  // Date with "Present" and adjacent checkbox
  const container = document.createElement('div');
  const currBox = document.createElement('input');
  currBox.type = 'checkbox';
  currBox.id = 'current-job';
  container.appendChild(currBox);
  container.appendChild(dateInput);
  ContentEngine.setNativeValue(dateInput, 'Present');
  assert.strictEqual(currBox.checked, true);

  // 6. Month input
  const monthInput = document.createElement('input');
  monthInput.type = 'month';
  ContentEngine.setNativeValue(monthInput, '2022-09-10');
  assert.strictEqual(monthInput.value, '2022-09');

  // 7. Number input
  const numInput = document.createElement('input');
  numInput.type = 'number';
  ContentEngine.setNativeValue(numInput, '5+ years');
  assert.strictEqual(numInput.value, '5');

  // 8. Guards (disabled, readonly, file input)
  const disInput = document.createElement('input');
  disInput.disabled = true;
  ContentEngine.setNativeValue(disInput, 'ignored');
  assert.strictEqual(disInput.value, '');

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  ContentEngine.setNativeValue(fileInput, 'ignored.pdf');
  assert.strictEqual(fileInput.value, '');
});

test('ContentEngine: scanFormFields and autofillForm', async () => {
  // Clear body
  document.body.children = [];

  // Create mock form
  const fnInput = document.createElement('input');
  fnInput.id = 'first_name';
  fnInput.setAttribute('name', 'first_name');
  fnInput.setAttribute('placeholder', 'First Name');

  const lnInput = document.createElement('input');
  lnInput.id = 'last_name';
  lnInput.setAttribute('name', 'last_name');

  const emailInput = document.createElement('input');
  emailInput.id = 'email';
  emailInput.setAttribute('name', 'email');
  emailInput.setAttribute('placeholder', 'Email Address');
  emailInput.setAttribute('type', 'email');

  const unkInput = document.createElement('input');
  unkInput.id = 'unrecognized_custom_field_xyz';

  document.body.appendChild(fnInput);
  document.body.appendChild(lnInput);
  document.body.appendChild(emailInput);
  document.body.appendChild(unkInput);

  messageResponses['GET_PROFILE'] = {
    success: true,
    profile: JSON.parse(JSON.stringify(DEFAULT_PROFILE))
  };
  await ContentEngine.loadProfile();

  const scan = ContentEngine.scanFormFields();
  assert.ok(scan.total >= 4);
  assert.ok(scan.matched.length >= 3);
  assert.ok(scan.unmatched.length >= 1);

  // Run autofill
  const autofillRes = await ContentEngine.autofillForm();
  assert.ok(autofillRes.filledCount >= 3);
  assert.strictEqual(fnInput.value, 'Pritam');
  assert.strictEqual(lnInput.value, 'Rauniyar');
  assert.strictEqual(emailInput.value, DEFAULT_PROFILE.personal.email);
  assert.strictEqual(fnInput.dataset.apAutofilled, 'true');
});

test('ContentEngine: In-field AI Assist, Review Card & Suggestions', async () => {
  const ta = document.createElement('textarea');
  ta.id = 'cover_letter';
  ta.setAttribute('name', 'cover_letter');
  document.body.appendChild(ta);

  ContentEngine.attachInFieldAiButtons();
  assert.strictEqual(ta.dataset.apAiAttached, 'true');

  // Trigger button click
  const btn = ta.parentElement.querySelector('.ap-infield-ai-btn');
  assert.ok(btn);

  messageResponses['GENERATE_AI_ANSWER'] = {
    success: true,
    answer: 'I am a passionate software engineer excited about this role.'
  };

  btn.dispatchEvent(new MockEvent('click'));
  // Wait for async handler
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(ta.value, 'I am a passionate software engineer excited about this role.');

  // Test Review Card
  let approvedValue = null;
  ContentEngine.showReviewCard({
    descriptor: { combinedLabels: 'Years of Experience in Distributed Systems', name: 'exp_years' },
    element: ta,
    suggestedAnswer: '4+ years',
    onApprove: (val) => { approvedValue = val; },
    onDismiss: () => {}
  });

  const card = document.getElementById('applypilot-review-card');
  assert.ok(card);
  const approveBtn = card.querySelector('#ap-review-approve');
  approveBtn.dispatchEvent(new MockEvent('click'));
  assert.strictEqual(approvedValue, '4+ years');

  // Test suggestNextUnrecognizedField
  messageResponses['SUGGEST_FIELD_ANSWER'] = {
    success: true,
    suggestion: 'Distributed Systems Expert'
  };
  await ContentEngine.suggestNextUnrecognizedField();
  const newCard = document.getElementById('applypilot-review-card');
  assert.ok(newCard);
  newCard.querySelector('#ap-review-close').dispatchEvent(new MockEvent('click'));
  assert.strictEqual(document.getElementById('applypilot-review-card'), null);
});

test('ContentEngine: Floating Hub & Toasts', () => {
  ContentEngine.createFloatingHub();
  const hub = document.getElementById('applypilot-floating-hub');
  assert.ok(hub);

  const menu = hub.querySelector('#ap-hub-menu');
  const trigger = hub.querySelector('#ap-hub-trigger');
  trigger.dispatchEvent(new MockEvent('click'));
  assert.strictEqual(menu.classList.contains('ap-visible'), true);

  const closeBtn = hub.querySelector('#ap-menu-close');
  closeBtn.dispatchEvent(new MockEvent('click'));
  assert.strictEqual(menu.classList.contains('ap-visible'), false);

  ContentEngine.updateFloatingBadge(7);
  assert.strictEqual(document.getElementById('ap-badge-count').textContent, '7 Filled');

  ContentEngine.showToast('Test Toast Notification');
  const toast = document.getElementById('applypilot-toast');
  assert.ok(toast);
  assert.strictEqual(toast.textContent, 'Test Toast Notification');
  assert.strictEqual(toast.classList.contains('ap-toast-visible'), true);

  assert.strictEqual(ContentEngine.escapeHtml('<b>"Pritam" & \'Engineer\'</b>'), '&lt;b&gt;&quot;Pritam&quot; &amp; &#039;Engineer&#039;&lt;/b&gt;');
});

test('ContentEngine: capturePageValues & Field Capture Listeners', async () => {
  document.body.children = [];

  const roleInput = document.createElement('input');
  roleInput.id = 'job_title_0';
  roleInput.setAttribute('placeholder', 'Job Title');
  roleInput.value = 'Lead AI Architect';

  const companyInput = document.createElement('input');
  companyInput.id = 'company_0';
  companyInput.setAttribute('placeholder', 'Company Name');
  companyInput.value = 'Google DeepMind';

  const schoolInput = document.createElement('input');
  schoolInput.id = 'school_0';
  schoolInput.setAttribute('placeholder', 'University or College');
  schoolInput.value = 'Motilal Nehru National Institute of Technology';

  document.body.appendChild(roleInput);
  document.body.appendChild(companyInput);
  document.body.appendChild(schoolInput);

  const captureRes = await ContentEngine.capturePageValues();
  assert.ok(captureRes.capturedCount >= 3);

  // Field capture listeners
  ContentEngine.attachFieldCaptureListeners();

  // Test correction listener
  roleInput.dataset.apAutofilled = 'true';
  roleInput.dataset.apAutofillVal = 'Old Architect';
  roleInput.dataset.apAutofillLabel = 'Job Title';
  roleInput.value = 'Distinguished Engineer';

  const changeEvt = new MockEvent('change', { bubbles: true });
  changeEvt.target = roleInput;
  document.dispatchEvent(changeEvt);
  // Wait for debounce timer
  await new Promise(r => setTimeout(r, 650));

  assert.ok(lastSentMessage);

  // Normal field change (not correction)
  const normInput = document.createElement('input');
  normInput.id = 'target_city';
  normInput.setAttribute('placeholder', 'Target City');
  normInput.value = 'San Francisco';
  document.body.appendChild(normInput);

  messageResponses['SAVE_LEARNED_FIELD'] = {
    success: true,
    item: { id: 'mem-99', fieldLabel: 'Target City', answer: 'San Francisco' }
  };

  const normEvt = new MockEvent('change', { bubbles: true });
  normEvt.target = normInput;
  document.dispatchEvent(normEvt);
  await new Promise(r => setTimeout(r, 650));

  // Test focus event listener setting apHadValue and apAutofillVal
  const focusInput = document.createElement('input');
  focusInput.id = 'focus_test_input';
  focusInput.setAttribute('placeholder', 'Focus Test');
  focusInput.value = 'Existing Initial Text';
  document.body.appendChild(focusInput);

  const focusEvt = new MockEvent('focus', { bubbles: true });
  focusEvt.target = focusInput;
  document.dispatchEvent(focusEvt);
  assert.strictEqual(focusInput.dataset.apHadValue, 'true');
  assert.strictEqual(focusInput.dataset.apAutofillVal, 'Existing Initial Text');

  // Test clearing an autofilled or previously filled field
  allSentMessages = [];
  focusInput.value = '';
  const clearEvt = new MockEvent('change', { bubbles: true });
  clearEvt.target = focusInput;
  document.dispatchEvent(clearEvt);
  await new Promise(r => setTimeout(r, 650));

  const clearMsg = allSentMessages.find(m => m.action === 'USER_CLEARED_FIELD');
  assert.ok(clearMsg, 'USER_CLEARED_FIELD was dispatched');
  assert.ok(clearMsg.parentScope);
  assert.ok(clearMsg.childKey);
  assert.strictEqual(focusInput.dataset.apUserCleared, 'true');

  // Test entering a middle name input
  allSentMessages = [];
  const midInput = document.createElement('input');
  midInput.id = 'middle_name_field';
  midInput.setAttribute('placeholder', 'Middle Name (Optional)');
  midInput.value = 'Kumar';
  document.body.appendChild(midInput);

  const midEvt = new MockEvent('change', { bubbles: true });
  midEvt.target = midInput;
  document.dispatchEvent(midEvt);
  await new Promise(r => setTimeout(r, 650));

  const saveMidMsg = allSentMessages.find(m => m.action === 'SAVE_NESTED_FIELD' && m.childKey === 'middleName');
  assert.ok(saveMidMsg, 'SAVE_NESTED_FIELD for middleName was dispatched');
  assert.strictEqual(saveMidMsg.value, 'Kumar');

  // Test entering education field in education container
  allSentMessages = [];
  const eduContainer = document.createElement('fieldset');
  eduContainer.setAttribute('data-automation-id', 'educationSection');
  const degreeInput = document.createElement('input');
  degreeInput.id = 'degree_field';
  degreeInput.setAttribute('placeholder', 'Degree');
  degreeInput.value = 'Bachelor of Science';
  eduContainer.appendChild(degreeInput);
  document.body.appendChild(eduContainer);

  const degEvt = new MockEvent('change', { bubbles: true });
  degEvt.target = degreeInput;
  document.dispatchEvent(degEvt);
  await new Promise(r => setTimeout(r, 650));

  const saveEduMsg = allSentMessages.find(m => m.action === 'SAVE_NESTED_FIELD' && m.category === 'education');
  assert.ok(saveEduMsg, 'SAVE_NESTED_FIELD for education was dispatched');
  assert.strictEqual(saveEduMsg.childKey, 'degree');
  assert.strictEqual(saveEduMsg.value, 'Bachelor of Science');

  // Test form submit listener
  document.dispatchEvent(new MockEvent('submit', { bubbles: true }));

  // Dynamic forms observer
  ContentEngine.observeDynamicForms();
});

test('ContentEngine: Runtime Message Listener Actions', async () => {
  assert.ok(typeof global._contentOnMessage === 'function');

  const dispatchMsg = (req) => {
    return new Promise((resolve) => {
      global._contentOnMessage(req, {}, (res) => resolve(res));
    });
  };

  const autoRes = await dispatchMsg({ action: 'AUTOFILL' });
  assert.strictEqual(autoRes.success, true);

  const captureRes = await dispatchMsg({ action: 'CAPTURE_PAGE_FIELDS' });
  assert.strictEqual(captureRes.success, true);

  const scanRes = await dispatchMsg({ action: 'SCAN_FIELDS' });
  assert.ok(scanRes.total >= 0);

  const suggestRes = await dispatchMsg({ action: 'SUGGEST_UNMATCHED' });
  assert.strictEqual(suggestRes.success, true);
});

test('ContentEngine: Extensive Edge Cases & Complex Components', async () => {
  // 1. Hub button clicks
  ContentEngine.createFloatingHub();
  const hub = document.getElementById('applypilot-floating-hub');
  assert.ok(hub);

  hub.querySelector('#ap-btn-autofill').dispatchEvent(new MockEvent('click'));
  hub.querySelector('#ap-btn-capture-fields').dispatchEvent(new MockEvent('click'));
  hub.querySelector('#ap-btn-ai-scan').dispatchEvent(new MockEvent('click'));
  hub.querySelector('#ap-btn-sidepanel').dispatchEvent(new MockEvent('click'));
  assert.strictEqual(lastSentMessage.action, 'OPEN_SIDEPANEL');

  // 2. Review Card: Skip & Ignore
  let dismissed = false;
  ContentEngine.showReviewCard({
    descriptor: { combinedLabels: 'Veteran Status', name: 'veteran' },
    element: document.createElement('input'),
    suggestedAnswer: 'No',
    onDismiss: () => { dismissed = true; }
  });

  const card = document.getElementById('applypilot-review-card');
  assert.ok(card);

  card.querySelector('#ap-review-skip').dispatchEvent(new MockEvent('click'));
  assert.strictEqual(dismissed, true);

  // Test Ignore button
  dismissed = false;
  ContentEngine.showReviewCard({
    descriptor: { combinedLabels: 'Disability Status', name: 'disability' },
    element: document.createElement('input'),
    suggestedAnswer: 'Decline to state',
    onDismiss: () => { dismissed = true; }
  });

  const card2 = document.getElementById('applypilot-review-card');
  assert.ok(card2);
  card2.querySelector('#ap-review-ignore').dispatchEvent(new MockEvent('click'));
  assert.ok(lastSentMessage.action === 'ADD_IGNORED_FIELD' || lastSentMessage.action === 'LOG_AUDIT_ENTRY');

  // 3. In-field AI error notice
  const taContainer = document.createElement('div');
  const errTa = document.createElement('textarea');
  taContainer.appendChild(errTa);
  document.body.appendChild(taContainer);
  ContentEngine.attachInFieldAiButtons();

  const errBtn = taContainer.querySelector('.ap-infield-ai-btn');
  assert.ok(errBtn);
  messageResponses['GENERATE_AI_ANSWER'] = { error: 'Quota Exceeded' };
  errBtn.dispatchEvent(new MockEvent('click'));
  await new Promise(r => setTimeout(r, 20));

  // 4. setNativeValue edge cases
  // ContentEditable
  const editable = document.createElement('div');
  editable.isContentEditable = true;
  ContentEngine.setNativeValue(editable, '<p>Rich Content</p>');

  // Invalid date & month
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  ContentEngine.setNativeValue(dateInput, 'invalid-date-xyz');
  assert.strictEqual(dateInput.value, '');

  const monthInput = document.createElement('input');
  monthInput.type = 'month';
  ContentEngine.setNativeValue(monthInput, 'Present');
  ContentEngine.setNativeValue(monthInput, 'invalid-month');
  ContentEngine.setNativeValue(monthInput, '2024-08');
  assert.strictEqual(monthInput.value, '2024-08');

  // Number input without digits
  const numInput = document.createElement('input');
  numInput.type = 'number';
  ContentEngine.setNativeValue(numInput, 'no-digits-here');
  assert.strictEqual(numInput.value, '');

  // 5. Ignored field in scanFormFields
  const ignInput = document.createElement('input');
  ignInput.id = 'veteran_status_optional';
  ignInput.setAttribute('placeholder', 'veteran status');
  document.body.appendChild(ignInput);

  const profileWithIgnored = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  profileWithIgnored.ignoredOptionalFields = [{ label: 'veteran status', pattern: 'veteran status' }];
  messageResponses['GET_PROFILE'] = { success: true, profile: profileWithIgnored };
  await ContentEngine.loadProfile();

  const ignScan = ContentEngine.scanFormFields();
  assert.ok(ignScan.total >= 1);

  // 6. Complex components in autofill
  const origDetect = AtsAdapters.detectComplexElement;
  const complexTypes = [
    'rich_text', 'custom_combobox', 'multi_tag_input',
    'segmented_radiogroup', 'custom_switch', 'split_date',
    'split_phone', 'split_salary', 'slider_rating'
  ];

  for (const cType of complexTypes) {
    AtsAdapters.detectComplexElement = () => ({
      type: cType,
      monthEl: document.createElement('select'),
      yearEl: document.createElement('select'),
      countryCodeEl: document.createElement('select'),
      numberEl: document.createElement('input'),
      currencyEl: document.createElement('select'),
      amountEl: document.createElement('input'),
      frequencyEl: document.createElement('select')
    });

    const compInput = document.createElement('input');
    compInput.id = 'first_name';
    compInput.setAttribute('name', 'first_name');
    document.body.appendChild(compInput);

    await ContentEngine.autofillForm();
  }
  AtsAdapters.detectComplexElement = origDetect;

  // 7. suggestNextUnrecognizedField with SELECT element and options
  document.body.children = [];
  const sel = document.createElement('select');
  sel.id = 'unrecognized_select_field';
  sel.options = [{ text: 'Option A' }, { text: 'Option B' }];
  document.body.appendChild(sel);

  messageResponses['SUGGEST_FIELD_ANSWER'] = { success: true, suggestion: 'Option A' };
  messageResponses['SAVE_LEARNED_FIELD'] = { success: true, item: { id: 'item-1', fieldLabel: 'unrecognized_select_field' } };
  await ContentEngine.suggestNextUnrecognizedField();

  const appCard = document.getElementById('applypilot-review-card');
  assert.ok(appCard);
  appCard.querySelector('#ap-review-approve').dispatchEvent(new MockEvent('click'));
  await new Promise(r => setTimeout(r, 20));

  // suggestNextUnrecognizedField error branch
  messageResponses['SUGGEST_FIELD_ANSWER'] = { error: 'Gemini busy' };
  await ContentEngine.suggestNextUnrecognizedField();

  // 8. Capture Page Values with graduation year and GPA
  document.body.children = [];
  const gradInput = document.createElement('input');
  gradInput.id = 'grad_year';
  gradInput.setAttribute('placeholder', 'Graduation Year');
  gradInput.value = '2023';

  const gpaInput = document.createElement('input');
  gpaInput.id = 'gpa_field';
  gpaInput.setAttribute('placeholder', 'GPA');
  gpaInput.value = '3.9';

  document.body.appendChild(gradInput);
  document.body.appendChild(gpaInput);
  await ContentEngine.capturePageValues();

  // 9. Dynamic Forms Mutation Observer Trigger
  let observerCallback = null;
  const origMO = global.MutationObserver;
  global.MutationObserver = class MockMO {
    constructor(cb) { observerCallback = cb; }
    observe() {}
    disconnect() {}
  };
  ContentEngine.observeDynamicForms();
  if (observerCallback) {
    observerCallback();
    await new Promise(r => setTimeout(r, 450));
  }
  global.MutationObserver = origMO;
});

