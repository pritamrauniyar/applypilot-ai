const test = require('node:test');
const assert = require('node:assert');

// 1. Setup Global Mocks for Service Worker (100% Offline Engine)
const { StorageService } = require('../lib/storage.js');
const { DeterministicResumeParser } = require('../lib/deterministic-resume-parser.js');
const { AuditLogger } = require('../lib/audit-logger.js');
const { PdfExtractor } = require('../lib/pdf-extractor.js');

global.StorageService = StorageService;
global.DeterministicResumeParser = DeterministicResumeParser;
global.AuditLogger = AuditLogger;
global.PdfExtractor = PdfExtractor;

let onInstalledHandler = null;
let contextMenuClickHandler = null;
let onMessageHandler = null;
let createdContextMenus = [];
let sentMessages = [];
let openedSidePanels = [];
let notificationsCreated = [];

global.chrome = {
  runtime: {
    onInstalled: {
      addListener: (fn) => { onInstalledHandler = fn; }
    },
    onMessage: {
      addListener: (fn) => { onMessageHandler = fn; }
    }
  },
  contextMenus: {
    removeAll: (cb) => {
      createdContextMenus = [];
      if (cb) cb();
    },
    create: (menuItem) => {
      createdContextMenus.push(menuItem);
    },
    onClicked: {
      addListener: (fn) => { contextMenuClickHandler = fn; }
    }
  },
  tabs: {
    sendMessage: async (tabId, msg) => {
      sentMessages.push({ tabId, msg });
      return { success: true };
    }
  },
  sidePanel: {
    open: async (opts) => {
      openedSidePanels.push(opts);
    }
  },
  notifications: {
    create: (opts) => {
      notificationsCreated.push(opts);
    }
  }
};

// Require Service Worker
const {
  scheduleBackgroundRefinement,
  processBackgroundSyncQueue,
  buildOfflineDraftAnswer,
  buildOfflineFieldSuggestion
} = require('../background/service-worker.js');

test('ServiceWorker: Installation and Context Menu Registration', async () => {
  assert.ok(typeof onInstalledHandler === 'function');
  await onInstalledHandler();
  assert.strictEqual(createdContextMenus.length, 3);
  assert.ok(createdContextMenus.some(m => m.id === 'applypilot-autofill'));
  assert.ok(createdContextMenus.some(m => m.id === 'applypilot-ai-answer'));
  assert.ok(createdContextMenus.some(m => m.id === 'applypilot-open-sidepanel'));
});

test('ServiceWorker: Context Menu Click Handling Works Without API Key', async () => {
  assert.ok(typeof contextMenuClickHandler === 'function');
  sentMessages = [];
  notificationsCreated = [];
  openedSidePanels = [];

  // 1. Tab without ID ignored
  await contextMenuClickHandler({ menuItemId: 'applypilot-autofill' }, null);
  assert.strictEqual(sentMessages.length, 0);

  // 2. Autofill click
  await contextMenuClickHandler({ menuItemId: 'applypilot-autofill' }, { id: 101 });
  assert.strictEqual(sentMessages.length, 1);
  assert.strictEqual(sentMessages[0].msg.action, 'AUTOFILL');

  // 3. Smart Draft / Review Unmatched works directly with NO API key
  const prof = await StorageService.getProfile();
  prof.settings.geminiApiKey = '';
  await StorageService.saveProfile(prof);

  await contextMenuClickHandler({ menuItemId: 'applypilot-ai-answer' }, { id: 101 });
  assert.strictEqual(sentMessages.length, 2);
  assert.strictEqual(sentMessages[1].msg.action, 'SUGGEST_UNMATCHED');
  assert.strictEqual(notificationsCreated.length, 0);

  // 3b. When tab has no content script attached, surface fallback toast/notification cleanly
  const origSend = global.chrome.tabs.sendMessage;
  global.chrome.tabs.sendMessage = async () => { throw new Error('Receiving end does not exist'); };
  try {
    await contextMenuClickHandler({ menuItemId: 'applypilot-ai-answer' }, { id: 101 });
    assert.strictEqual(notificationsCreated.length, 1);
    assert.strictEqual(notificationsCreated[0].title, 'ApplyPilot');
  } finally {
    global.chrome.tabs.sendMessage = origSend;
  }

  // 4. Open Sidepanel click
  await contextMenuClickHandler({ menuItemId: 'applypilot-open-sidepanel' }, { id: 101, windowId: 999 });
  assert.strictEqual(openedSidePanels.length, 1);
  assert.strictEqual(openedSidePanels[0].windowId, 999);
});

test('ServiceWorker: Offline Background Memory Consolidation Queue Processing', async () => {
  await StorageService.clearPendingSyncQueue();
  await StorageService.queuePendingSync({
    type: 'user_correction',
    fieldLabel: 'Current Job Title',
    correctedValue: 'Senior Staff Engineer'
  });
  await StorageService.queuePendingSync({
    type: 'user_cleared_field',
    fieldLabel: 'Middle Name',
    fieldNameOrId: 'middle_name'
  });

  const summary = await processBackgroundSyncQueue();
  assert.strictEqual(summary.processedCount, 2);
  assert.strictEqual(summary.learnedCount, 1);
  assert.strictEqual(summary.ignoredCount, 1);

  const currentQueue = await StorageService.getPendingSyncQueue();
  assert.strictEqual(currentQueue.length, 0, 'Queue should be cleared after offline consolidation');

  const updatedProfile = await StorageService.getProfile();
  assert.ok(updatedProfile.learnedMemory.some(m => m.fieldLabel === 'Current Job Title' && m.answer === 'Senior Staff Engineer'));

  // Empty queue returns zeros cleanly
  const emptySummary = await processBackgroundSyncQueue();
  assert.strictEqual(emptySummary.processedCount, 0);

  // Scheduler handles environments without alarms or with alarms gracefully
  scheduleBackgroundRefinement();
});

test('ServiceWorker: Offline Answer Drafting & Unmatched Field Suggestion Heuristics', async () => {
  const sampleProfile = {
    personal: { fullName: 'Jane Doe', city: 'Austin', state: 'TX', country: 'United States' },
    links: { linkedin: 'https://linkedin.com/in/janedoe', github: 'https://github.com/janedoe' },
    experience: {
      currentTitle: 'Staff Software Engineer',
      currentCompany: 'Acme Corp',
      yearsOfExperience: '6',
      skills: 'TypeScript, Node.js, Distributed Systems',
      items: [{ title: 'Staff Software Engineer', company: 'Acme Corp', description: 'Scaled payment APIs to 50k RPS.' }]
    },
    education: { degree: 'B.S.', fieldOfStudy: 'Computer Science', school: 'UT Austin' },
    presets: { workAuthorization: 'Yes', requireSponsorship: 'No', noticePeriod: '2 weeks', salaryExpectations: '$180,000' }
  };

  const whyAns = buildOfflineDraftAnswer({ question: 'Why do you want to work at Stripe?', companyName: 'Stripe' }, sampleProfile);
  assert.ok(whyAns.includes('Stripe'));
  assert.ok(whyAns.includes('Staff Software Engineer'));

  const bioAns = buildOfflineDraftAnswer({ question: 'Tell me about yourself' }, sampleProfile);
  assert.ok(bioAns.includes('Jane Doe'));
  assert.ok(bioAns.includes('UT Austin'));

  assert.strictEqual(buildOfflineFieldSuggestion({ fieldLabel: 'Are you legally authorized to work?' }, sampleProfile), 'Yes');
  assert.strictEqual(buildOfflineFieldSuggestion({ fieldLabel: 'Will you require visa sponsorship?' }, sampleProfile), 'No');
  assert.strictEqual(buildOfflineFieldSuggestion({ fieldLabel: 'Notice period' }, sampleProfile), '2 weeks');
  assert.strictEqual(buildOfflineFieldSuggestion({ fieldLabel: 'LinkedIn Profile' }, sampleProfile), 'https://linkedin.com/in/janedoe');
  assert.strictEqual(buildOfflineFieldSuggestion({ fieldLabel: 'Favorite food', options: ['Pizza', 'Sushi'] }, sampleProfile), '');
});

test('ServiceWorker: onMessage Offline Message Routing & Actions', async () => {
  assert.ok(typeof onMessageHandler === 'function');

  const sendMessage = (request, sender = {}) => {
    return new Promise((resolve) => {
      onMessageHandler(request, sender, (res) => resolve(res));
    });
  };

  // 1. GET_PROFILE & SAVE_PROFILE
  const getProfRes = await sendMessage({ action: 'GET_PROFILE' });
  assert.strictEqual(getProfRes.success, true);
  assert.ok(getProfRes.profile);

  const saveProfRes = await sendMessage({ action: 'SAVE_PROFILE', profile: getProfRes.profile });
  assert.strictEqual(saveProfRes.success, true);

  // 2. QUEUE_BACKGROUND_SYNC & GET_PENDING_SYNC_QUEUE
  const queueRes = await sendMessage({ action: 'QUEUE_BACKGROUND_SYNC', item: { test: 1 } });
  assert.strictEqual(queueRes.success, true);

  const getQueueRes = await sendMessage({ action: 'GET_PENDING_SYNC_QUEUE' });
  assert.strictEqual(getQueueRes.success, true);
  assert.ok(getQueueRes.queue.length > 0);

  // 3. TRIGGER_BACKGROUND_SYNC_NOW
  const triggerRes = await sendMessage({ action: 'TRIGGER_BACKGROUND_SYNC_NOW' });
  assert.strictEqual(triggerRes.success, true);
  assert.ok(triggerRes.processedCount >= 1);

  // 4. Dynamic Fields CRUD
  const addDfRes = await sendMessage({
    action: 'ADD_DYNAMIC_FIELD',
    field: { label: 'Security Clearance', value: 'None' }
  });
  assert.strictEqual(addDfRes.success, true);
  assert.ok(addDfRes.field.id);

  const updateDfRes = await sendMessage({
    action: 'UPDATE_DYNAMIC_FIELD',
    id: addDfRes.field.id,
    updates: { value: 'Secret' }
  });
  assert.strictEqual(updateDfRes.success, true);
  assert.strictEqual(updateDfRes.field.value, 'Secret');

  const getDfRes = await sendMessage({ action: 'GET_DYNAMIC_FIELDS' });
  assert.strictEqual(getDfRes.success, true);
  assert.ok(getDfRes.dynamicFields.some(f => f.id === addDfRes.field.id));

  const deleteDfRes = await sendMessage({
    action: 'DELETE_DYNAMIC_FIELD',
    id: addDfRes.field.id
  });
  assert.strictEqual(deleteDfRes.success, true);

  // 5. RECORD_FIELD_INTERACTION & SAVE_LEARNED_FIELD
  const recordRes = await sendMessage({
    action: 'RECORD_FIELD_INTERACTION',
    fieldLabel: 'Years of Experience',
    filled: true,
    value: '5',
    isRequired: true
  });
  assert.strictEqual(recordRes.success, true);

  const saveLearnedRes = await sendMessage({
    action: 'SAVE_LEARNED_FIELD',
    fieldData: { label: 'Favorite Language', value: 'JavaScript' }
  });
  assert.strictEqual(saveLearnedRes.success, true);

  // 6. Custom Fields CRUD
  const addCfRes = await sendMessage({
    action: 'ADD_CUSTOM_FIELD',
    field: { label: 'Notice Period', value: 'Immediate' }
  });
  assert.strictEqual(addCfRes.success, true);

  const deleteCfRes = await sendMessage({
    action: 'DELETE_CUSTOM_FIELD',
    id: addCfRes.fields[addCfRes.fields.length - 1].id
  });
  assert.strictEqual(deleteCfRes.success, true);

  // 7. Audit Logging Messages
  const logRes = await sendMessage({
    action: 'LOG_AUDIT_ENTRY',
    logData: { actionType: 'test_action', status: 'success' }
  });
  assert.strictEqual(logRes.success, true);

  const getLogsRes = await sendMessage({ action: 'GET_AUDIT_LOGS', filter: {} });
  assert.strictEqual(getLogsRes.success, true);
  assert.ok(Array.isArray(getLogsRes.logs));

  const clearLogsRes = await sendMessage({ action: 'CLEAR_AUDIT_LOGS' });
  assert.strictEqual(clearLogsRes.success, true);

  // 8. Ignored Fields CRUD
  const addIgnRes = await sendMessage({
    action: 'ADD_IGNORED_FIELD',
    fieldInfo: { label: 'veteran status' }
  });
  assert.strictEqual(addIgnRes.success, true);

  const remIgnRes = await sendMessage({
    action: 'REMOVE_IGNORED_FIELD',
    idOrPattern: 'veteran status'
  });
  assert.strictEqual(remIgnRes.success, true);

  const clearIgnRes = await sendMessage({ action: 'CLEAR_IGNORED_FIELDS' });
  assert.strictEqual(clearIgnRes.success, true);

  // 9. OPEN_SIDEPANEL
  const openSpRes = await sendMessage({ action: 'OPEN_SIDEPANEL' }, { tab: { windowId: 555 } });
  assert.strictEqual(openSpRes.success, true);

  // 10. GENERATE_AI_ANSWER & SUGGEST_FIELD_ANSWER work 100% offline with NO API key
  const prof = await StorageService.getProfile();
  prof.settings.geminiApiKey = '';
  prof.experience = { ...prof.experience, currentTitle: 'Backend Engineer', currentCompany: 'Stripe', yearsOfExperience: '5', skills: 'Go, Node.js' };
  prof.presets = { ...prof.presets, workAuthorization: 'Yes' };
  await StorageService.saveProfile(prof);

  const genRes = await sendMessage({ action: 'GENERATE_AI_ANSWER', question: 'Tell me about yourself' });
  assert.strictEqual(genRes.success, true);
  assert.strictEqual(genRes.offline, true);
  assert.ok(genRes.answer.length > 10);

  const suggestRes = await sendMessage({ action: 'SUGGEST_FIELD_ANSWER', fieldLabel: 'Work Authorization' });
  assert.strictEqual(suggestRes.success, true);
  assert.strictEqual(suggestRes.offline, true);
  assert.strictEqual(suggestRes.suggestion, 'Yes');

  // 11. PARSE_RESUME_TEXT (100% offline deterministic)
  const emptyTextRes = await sendMessage({ action: 'PARSE_RESUME_TEXT', resumeText: '   ' });
  assert.ok(emptyTextRes.error);

  const parseTextRes = await sendMessage({
    action: 'PARSE_RESUME_TEXT',
    resumeText: 'Pritam Rauniyar\npritam@example.com\nEXPERIENCE\nSoftware Engineer | Tech Corp | 2022 - Present\nBuilt services.'
  });
  assert.strictEqual(parseTextRes.success, true);
  assert.strictEqual(parseTextRes.offline, true);
  assert.strictEqual(parseTextRes.parsed.personal.email, 'pritam@example.com');

  // 12. PARSE_RESUME_FILE (rejects images offline, parses text-based files offline)
  const imageFileRes = await sendMessage({
    action: 'PARSE_RESUME_FILE',
    base64Data: 'YWJj',
    mimeType: 'image/png'
  });
  assert.ok(imageFileRes.error.includes('cannot be parsed offline'));

  const textBase64 = Buffer.from('Pritam Rauniyar\npritam@example.com\nEXPERIENCE\nBackend Engineer | Stripe | 2021 - Present\nBuilt payment APIs.', 'utf8').toString('base64');
  const textFileRes = await sendMessage({
    action: 'PARSE_RESUME_FILE',
    base64Data: textBase64,
    mimeType: 'text/plain',
    fileName: 'resume.txt'
  });
  assert.strictEqual(textFileRes.success, true);
  assert.strictEqual(textFileRes.offline, true);
  assert.strictEqual(textFileRes.parsed.personal.email, 'pritam@example.com');

  // 13. SAVE_NESTED_FIELD, SAVE_WORK_EXPERIENCE_FIELD & USER_CLEARED_FIELD
  const saveNestedRes = await sendMessage({
    action: 'SAVE_NESTED_FIELD',
    parentScope: 'Education 1',
    childKey: 'degree',
    value: 'Master of Science',
    category: 'education',
    sectionIndex: 0
  });
  assert.strictEqual(saveNestedRes.success, true);

  const saveWorkRes = await sendMessage({
    action: 'SAVE_WORK_EXPERIENCE_FIELD',
    sectionIndex: 0,
    roleDescription: 'Developed low latency pipelines'
  });
  assert.strictEqual(saveWorkRes.success, true);

  const clearFieldRes = await sendMessage({
    action: 'USER_CLEARED_FIELD',
    parentScope: 'Education 1',
    childKey: 'degree',
    sectionIndex: 0
  });
  assert.strictEqual(clearFieldRes.success, true);

  // 14. Unknown action & Error in handler
  const unknownRes = await sendMessage({ action: 'UNKNOWN_ACTION_XYZ' });
  assert.strictEqual(unknownRes.error, 'Unknown action');

  const origSave = StorageService.saveProfile;
  StorageService.saveProfile = async () => { throw new Error('Forced Save Failure'); };
  try {
    const errRes = await sendMessage({ action: 'SAVE_PROFILE', profile: {} });
    assert.strictEqual(errRes.error, 'Forced Save Failure');
  } finally {
    StorageService.saveProfile = origSave;
  }
});
