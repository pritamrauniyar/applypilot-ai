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
        const parts = s.split(':not(');
        const base = parts[0].trim();
        if (base && !this.matches(base)) return false;
        for (let i = 1; i < parts.length; i++) {
          const notSel = parts[i].split(')')[0].trim();
          if (this.matches(notSel)) return false;
        }
        return true;
      }

      const tagMatch = s.match(/^([a-zA-Z0-9]+)/);
      if (tagMatch) {
        if (this.tagName !== tagMatch[1].toUpperCase()) return false;
      }

      const idMatch = s.match(/#([a-zA-Z0-9_-]+)/);
      if (idMatch) {
        if (this.id !== idMatch[1]) return false;
      }

      const classMatches = s.match(/\.([a-zA-Z0-9_-]+)/g);
      if (classMatches) {
        for (const c of classMatches) {
          if (!this.classList.contains(c.slice(1))) return false;
        }
      }

      const attrRegex = /\[([a-zA-Z0-9_-]+)(?:([*^$]?=)(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*[iIsS]?\]/g;
      let attrMatch;
      let hasAttr = false;
      while ((attrMatch = attrRegex.exec(s)) !== null) {
        hasAttr = true;
        const attrKey = attrMatch[1];
        const op = attrMatch[2];
        let val = attrMatch[3] !== undefined ? attrMatch[3] : (attrMatch[4] !== undefined ? attrMatch[4] : attrMatch[5]);
        if (typeof val === 'string') val = val.replace(/^["']|["']$/g, '');

        const actualVal = this.getAttribute ? (this.getAttribute(attrKey) || (attrKey === 'class' ? this.className : (attrKey === 'type' ? this.type : null))) : null;

        if (!op) {
          if (this.hasAttribute && !this.hasAttribute(attrKey) && actualVal == null) return false;
        } else if (op === '=') {
          if (actualVal !== val) return false;
        } else if (op === '*=') {
          if (!actualVal || !actualVal.toLowerCase().includes(val.toLowerCase())) return false;
        } else if (op === '^=') {
          if (!actualVal || !actualVal.toLowerCase().startsWith(val.toLowerCase())) return false;
        } else if (op === '$=') {
          if (!actualVal || !actualVal.toLowerCase().endsWith(val.toLowerCase())) return false;
        }
      }

      if (!tagMatch && !idMatch && !classMatches && !hasAttr) {
        return false;
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
const messageResponses = {};

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
const { SAMPLE_PROFILE } = require('../lib/storage.js');

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
    profile: JSON.parse(JSON.stringify(SAMPLE_PROFILE))
  };

  const prof = await ContentEngine.loadProfile();
  assert.strictEqual(prof.personal.fullName, 'Alex Candidate');

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
    profile: JSON.parse(JSON.stringify(SAMPLE_PROFILE))
  };
  await ContentEngine.loadProfile();

  const scan = ContentEngine.scanFormFields();
  assert.ok(scan.total >= 4);
  assert.ok(scan.matched.length >= 3);
  assert.ok(scan.unmatched.length >= 1);

  // Run autofill
  const autofillRes = await ContentEngine.autofillForm();
  assert.ok(autofillRes.filledCount >= 3);
  assert.strictEqual(fnInput.value, 'Alex');
  assert.strictEqual(lnInput.value, 'Candidate');
  assert.strictEqual(emailInput.value, SAMPLE_PROFILE.personal.email);
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

  // Test Work Experience 2 In-field AI Draft
  const card2 = document.createElement('div');
  card2.setAttribute('data-automation-id', 'workExperienceSection-1');
  const h3 = document.createElement('h3');
  h3.innerText = 'Work Experience 2 (Previous Role)';
  card2.appendChild(h3);

  const comp2 = document.createElement('input');
  comp2.setAttribute('data-automation-id', 'company-1');
  comp2.value = 'Stripe';
  card2.appendChild(comp2);

  const title2 = document.createElement('input');
  title2.setAttribute('data-automation-id', 'jobTitle-1');
  title2.value = 'Backend Engineer';
  card2.appendChild(title2);

  const desc2 = document.createElement('textarea');
  desc2.setAttribute('data-automation-id', 'description-1');
  desc2.setAttribute('name', 'experience[1].description');
  card2.appendChild(desc2);
  document.body.appendChild(card2);

  ContentEngine.attachInFieldAiButtons();
  const btn2 = desc2.parentElement.querySelector('.ap-infield-ai-btn');
  assert.ok(btn2);

  messageResponses['GENERATE_AI_ANSWER'] = {
    success: true,
    answer: 'Architected Stripe payment orchestration pipelines.'
  };

  btn2.dispatchEvent(new MockEvent('click'));
  await new Promise(r => setTimeout(r, 40));

  const lastGenMsg = allSentMessages.find(m => m.action === 'GENERATE_AI_ANSWER' && m.parentScope === 'Work Experience 2');
  assert.ok(lastGenMsg, 'GENERATE_AI_ANSWER was sent with parentScope Work Experience 2');
  assert.strictEqual(lastGenMsg.sectionIndex, 1);
  assert.strictEqual(lastGenMsg.targetCompany, 'Stripe');
  assert.strictEqual(lastGenMsg.targetTitle, 'Backend Engineer');

  const lastSaveMsg = allSentMessages.find(m => m.action === 'SAVE_NESTED_FIELD' && m.parentScope === 'Work Experience 2');
  assert.ok(lastSaveMsg, 'SAVE_NESTED_FIELD was sent for Work Experience 2');
  assert.strictEqual(lastSaveMsg.sectionIndex, 1);
  assert.strictEqual(lastSaveMsg.childKey, 'roleDescription');

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

  // Test dismiss button removes hub
  const hideBtn = hub.querySelector('#ap-btn-hide-hub');
  assert.ok(hideBtn);
  hideBtn.dispatchEvent(new MockEvent('click'));
  assert.strictEqual(document.getElementById('applypilot-floating-hub'), null);

  // Non-job site suppression test (e.g. YouTube)
  global.window.__applypilot_testing = false;
  const origHref = global.window.location.href;
  global.window.location.href = 'https://www.youtube.com/watch?v=12345';
  const suppressedHub = ContentEngine.createFloatingHub();
  assert.strictEqual(suppressedHub, null);
  assert.strictEqual(document.getElementById('applypilot-floating-hub'), null);

  // Restore testing environment
  global.window.location.href = origHref;
  global.window.__applypilot_testing = true;
  ContentEngine.createFloatingHub();

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

  const profileWithIgnored = JSON.parse(JSON.stringify(SAMPLE_PROFILE));
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


// ==========================================================================
// Privacy guards
// ==========================================================================

// Minimal element stand-in for the denylist checks.
function fakeField({ type = 'text', name = '', id = '', autocomplete = '', ariaLabel = '', placeholder = '' } = {}) {
  return {
    type,
    name,
    id,
    placeholder,
    getAttribute: (attr) => {
      if (attr === 'autocomplete') return autocomplete;
      if (attr === 'aria-label') return ariaLabel;
      return null;
    }
  };
}

test('Privacy: sensitive fields are never eligible for capture', () => {
  // Credentials and non-user-editable inputs.
  assert.ok(ContentEngine.isSensitiveField(fakeField({ type: 'password' })));
  assert.ok(ContentEngine.isSensitiveField(fakeField({ type: 'hidden' })));
  assert.ok(ContentEngine.isSensitiveField(fakeField({ type: 'file' })));

  // Payment autocomplete tokens.
  assert.ok(ContentEngine.isSensitiveField(fakeField({ autocomplete: 'cc-number' })));
  assert.ok(ContentEngine.isSensitiveField(fakeField({ autocomplete: 'cc-csc' })));
  assert.ok(ContentEngine.isSensitiveField(fakeField({ autocomplete: 'new-password' })));
  assert.ok(ContentEngine.isSensitiveField(fakeField({ autocomplete: 'one-time-code' })));

  // Government and financial identifiers, however they are labelled. These
  // routinely appear on background-check and payroll steps of a real
  // application flow, which is exactly where the capture loop was running.
  const sensitiveLabels = [
    'Social Security Number',
    'SSN',
    'National Insurance Number',
    'Aadhaar Number',
    'PAN Card',
    'Tax Identification Number',
    'Passport Number',
    "Driver's License",
    'Date of Birth',
    'DOB',
    'Credit Card Number',
    'CVV',
    'Bank Account Number',
    'Routing Number',
    'IBAN',
    'Current Salary',
    'Salary History',
    "Mother's Maiden Name",
    'Security Question'
  ];

  for (const label of sensitiveLabels) {
    const el = fakeField({ ariaLabel: label });
    assert.ok(
      ContentEngine.isSensitiveField(el, { combinedLabels: label }),
      `"${label}" must be treated as sensitive`
    );
  }
});

test('Privacy: ordinary application fields remain capturable', () => {
  const ordinary = [
    'First Name',
    'Last Name',
    'Email Address',
    'Phone Number',
    'LinkedIn Profile',
    'Current Company',
    'Job Title',
    'Years of Experience',
    'Expected Salary',
    'Notice Period',
    'Why do you want to work here?',
    'School or University',
    'Postal Code',
    'Pin Code'
  ];

  for (const label of ordinary) {
    const el = fakeField({ ariaLabel: label });
    assert.ok(
      !ContentEngine.isSensitiveField(el, { combinedLabels: label }),
      `"${label}" must stay capturable`
    );
  }
});

test('Privacy: capture and autofill are gated on explicit opt-in and onboarding', () => {
  // Value capture is off unless the user turns it on.
  assert.strictEqual(ContentEngine.isCaptureEnabled(null), false);
  assert.strictEqual(ContentEngine.isCaptureEnabled({}), false);
  assert.strictEqual(ContentEngine.isCaptureEnabled({ settings: {} }), false);
  assert.strictEqual(ContentEngine.isCaptureEnabled({ settings: { captureTypedValues: true } }), true);

  // Autofill stays inert until the profile actually holds the user's details.
  assert.strictEqual(ContentEngine.isProfileReady(null), false);
  assert.strictEqual(ContentEngine.isProfileReady({ personal: {} }), false);
  assert.strictEqual(ContentEngine.isProfileReady({ personal: { firstName: 'A' } }), false, 'a name alone is not enough');
  assert.strictEqual(ContentEngine.isProfileReady({ onboardingComplete: true }), true);
  assert.strictEqual(
    ContentEngine.isProfileReady({ personal: { firstName: 'A', email: 'a@example.com' } }),
    true,
    'an existing filled-in profile counts as onboarded'
  );
});

test('Capture merge preserves history the page did not show', () => {
  const stored = [
    { id: 'exp-1', title: 'Engineer', company: 'Acme Corp', description: 'Built things' },
    { id: 'exp-2', title: 'Intern', company: 'Beta Inc', description: 'Learned things' },
    { id: 'exp-3', title: 'Analyst', company: 'Gamma Ltd', description: 'Analysed things' }
  ];

  // The page shows only two roles, and leaves the description blank.
  const scraped = [
    { id: 'page-1', title: 'Senior Engineer', company: 'Acme Corp', description: '' },
    { id: 'page-2', title: 'Intern', company: 'Beta Inc', description: '' }
  ];

  const merged = ContentEngine.mergeSequentialItems(stored, scraped);

  assert.strictEqual(merged.length, 3, 'roles absent from the page must not be deleted');
  assert.strictEqual(merged[2].company, 'Gamma Ltd');
  // A non-empty scraped value wins...
  assert.strictEqual(merged[0].title, 'Senior Engineer');
  // ...but an empty one must not blank what is already on file.
  assert.strictEqual(merged[0].description, 'Built things');
  assert.strictEqual(merged[1].description, 'Learned things');
  // Stored ids are stable across a capture.
  assert.strictEqual(merged[0].id, 'exp-1');

  // Scraped rows beyond what is stored are appended.
  const grown = ContentEngine.mergeSequentialItems([], scraped);
  assert.strictEqual(grown.length, 2);
  assert.strictEqual(grown[0].title, 'Senior Engineer');
});

test('Audit logging masks values unless the user opts in', () => {
  const original = lastSentMessage;

  // Default profile: no logFieldValues flag.
  ContentEngine.logAuditAction({ actionType: 'autofill', fieldLabel: 'Email', valueSet: 'secret@example.com' });
  assert.strictEqual(lastSentMessage.action, 'LOG_AUDIT_ENTRY');
  assert.strictEqual(lastSentMessage.logData.maskValue, true, 'values must be masked by default');

  assert.ok(original !== undefined || original === null);
});

test('ContentEngine: scanFormFields skips search and non-application fields', async () => {
  document.body.children = [];

  // Search input in header/page (like Phenom / Mastercard search inputs)
  const searchJobTitle = document.createElement('input');
  searchJobTitle.id = 'search_keyword';
  searchJobTitle.setAttribute('name', 'keyword');
  searchJobTitle.setAttribute('placeholder', 'Search Job Title');
  searchJobTitle.setAttribute('aria-label', 'Search Job Title');

  const searchLocation = document.createElement('input');
  searchLocation.id = 'search_location';
  searchLocation.setAttribute('name', 'location');
  searchLocation.setAttribute('placeholder', 'Search Location');
  searchLocation.setAttribute('aria-label', 'Search Location');

  // Genuine application form fields
  const jobTitleInput = document.createElement('input');
  jobTitleInput.id = 'workExperience_0_jobTitle';
  jobTitleInput.setAttribute('name', 'jobTitle');
  jobTitleInput.setAttribute('placeholder', 'Job Title');

  const companyInput = document.createElement('input');
  companyInput.id = 'workExperience_0_company';
  companyInput.setAttribute('name', 'company');
  companyInput.setAttribute('placeholder', 'Company');

  document.body.appendChild(searchJobTitle);
  document.body.appendChild(searchLocation);
  document.body.appendChild(jobTitleInput);
  document.body.appendChild(companyInput);

  messageResponses['GET_PROFILE'] = {
    success: true,
    profile: JSON.parse(JSON.stringify(SAMPLE_PROFILE))
  };
  await ContentEngine.loadProfile();

  const scan = ContentEngine.scanFormFields();
  // Search inputs should be completely omitted from matched and unmatched
  const matchedIds = scan.matched.map(m => m.element.id);
  assert.ok(!matchedIds.includes('search_keyword'), 'Search Job Title must not be matched');
  assert.ok(!matchedIds.includes('search_location'), 'Search Location must not be matched');
  assert.ok(matchedIds.includes('workExperience_0_jobTitle'), 'Real Job Title must be matched');
  assert.ok(matchedIds.includes('workExperience_0_company'), 'Real Company must be matched');

  // Autofill form
  await ContentEngine.autofillForm();
  assert.strictEqual(searchJobTitle.value, '', 'Search input must remain empty');
  assert.strictEqual(searchLocation.value, '', 'Search input must remain empty');
  assert.strictEqual(jobTitleInput.value, SAMPLE_PROFILE.experience.items[0].title);
  assert.strictEqual(companyInput.value, SAMPLE_PROFILE.experience.items[0].company);
});

