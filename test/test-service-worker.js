const test = require('node:test');
const assert = require('node:assert');

// 1. Setup Global Mocks for Service Worker
const { StorageService, DEFAULT_PROFILE } = require('../lib/storage.js');
const { GeminiService } = require('../lib/gemini-service.js');
const { AuditLogger } = require('../lib/audit-logger.js');
const { PdfExtractor } = require('../lib/pdf-extractor.js');

global.StorageService = StorageService;
global.GeminiService = GeminiService;
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
const { scheduleBackgroundRefinement, processBackgroundSyncQueue } = require('../background/service-worker.js');

test('ServiceWorker: Installation and Context Menu Registration', async () => {
  assert.ok(typeof onInstalledHandler === 'function');
  await onInstalledHandler();
  assert.strictEqual(createdContextMenus.length, 3);
  assert.ok(createdContextMenus.some(m => m.id === 'applypilot-autofill'));
  assert.ok(createdContextMenus.some(m => m.id === 'applypilot-ai-answer'));
  assert.ok(createdContextMenus.some(m => m.id === 'applypilot-open-sidepanel'));
});

test('ServiceWorker: Context Menu Click Handling', async () => {
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

  // 3. AI Answer click without API key
  const prof = await StorageService.getProfile();
  prof.settings.geminiApiKey = '';
  await StorageService.saveProfile(prof);

  await contextMenuClickHandler({ menuItemId: 'applypilot-ai-answer' }, { id: 101 });
  assert.strictEqual(notificationsCreated.length, 1);
  assert.ok(notificationsCreated[0].message.includes('Please set your free Gemini API key'));

  // 4. AI Answer click with API key
  prof.settings.geminiApiKey = 'test-key';
  await StorageService.saveProfile(prof);

  await contextMenuClickHandler({ menuItemId: 'applypilot-ai-answer' }, { id: 101 });
  assert.strictEqual(sentMessages.length, 2);
  assert.strictEqual(sentMessages[1].msg.action, 'SUGGEST_UNMATCHED');

  // 5. Open Sidepanel click
  await contextMenuClickHandler({ menuItemId: 'applypilot-open-sidepanel' }, { id: 101, windowId: 999 });
  assert.strictEqual(openedSidePanels.length, 1);
  assert.strictEqual(openedSidePanels[0].windowId, 999);
});

test('ServiceWorker: Background Intelligence Queue Processing', async () => {
  await StorageService.clearPendingSyncQueue();
  await StorageService.queuePendingSync({
    type: 'user_correction',
    field: 'Current Company',
    value: 'Uber'
  });

  // Mock GeminiService.refineKnowledgeBase
  const origRefine = GeminiService.refineKnowledgeBase;
  GeminiService.refineKnowledgeBase = async () => ({
    updatedFields: [
      {
        id: 'df-exp-title',
        canonicalKey: 'experience.currentTitle',
        label: 'Current Job Title',
        value: 'Senior Staff Engineer'
      },
      {
        canonicalKey: 'custom.newBrandField',
        label: 'Newly Discovered Field',
        value: 'Brand Value'
      }
    ],
    recommendedIgnored: ['unwanted_optional']
  });

  try {
    await processBackgroundSyncQueue();
    const currentQueue = await StorageService.getPendingSyncQueue();
    assert.strictEqual(currentQueue.length, 0, 'Queue should be cleared after synthesis');

    const updatedProfile = await StorageService.getProfile();
    const updatedField = updatedProfile.dynamicFields.find(f => f.id === 'df-exp-title');
    assert.strictEqual(updatedField.value, 'Senior Staff Engineer');
    assert.ok(updatedProfile.ignoredOptionalFields.some(f => f.label === 'unwanted_optional'));
    assert.ok(updatedProfile.dynamicFields.some(f => f.label === 'Newly Discovered Field'));

    // Test empty queue return
    await processBackgroundSyncQueue();

    // Test without API key
    const savedKey = updatedProfile.settings.geminiApiKey;
    updatedProfile.settings.geminiApiKey = '';
    await StorageService.saveProfile(updatedProfile);
    await StorageService.queuePendingSync({ type: 'test_item' });
    await processBackgroundSyncQueue();

    // Restore API key
    updatedProfile.settings.geminiApiKey = savedKey;
    await StorageService.saveProfile(updatedProfile);

    // Test error in processBackgroundSyncQueue
    GeminiService.refineKnowledgeBase = async () => { throw new Error('Refine failure'); };
    await StorageService.queuePendingSync({ type: 'error_item' });
    await processBackgroundSyncQueue();

    // Test timer scheduler
    GeminiService.refineKnowledgeBase = async () => ({ updatedFields: [], recommendedIgnored: [] });
    scheduleBackgroundRefinement(10);
    await new Promise(r => setTimeout(r, 60));
  } finally {
    GeminiService.refineKnowledgeBase = origRefine;
  }
});

test('ServiceWorker: onMessage Message Routing & Actions', async () => {
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

  // 5. TEST_API_KEY & DISCOVER_MODELS
  const origTest = GeminiService.testApiKey;
  GeminiService.testApiKey = async () => ({ success: true, models: ['gemini-3.6-flash'] });

  try {
    const testKeyRes = await sendMessage({ action: 'TEST_API_KEY', apiKey: 'valid-key' });
    assert.strictEqual(testKeyRes.success, true);

    const discoverRes = await sendMessage({ action: 'DISCOVER_MODELS', apiKey: 'valid-key' });
    assert.strictEqual(discoverRes.success, true);
  } finally {
    GeminiService.testApiKey = origTest;
  }

  // 6. RECORD_FIELD_INTERACTION & SAVE_LEARNED_FIELD
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

  // 7. Custom Fields CRUD
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

  // 8. Audit Logging Messages
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

  // 9. Ignored Fields CRUD
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

  // 10. OPEN_SIDEPANEL
  const openSpRes = await sendMessage({ action: 'OPEN_SIDEPANEL' }, { tab: { windowId: 555 } });
  assert.strictEqual(openSpRes.success, true);

  // 11. GENERATE_AI_ANSWER (with and without key)
  const prof = await StorageService.getProfile();
  prof.settings.geminiApiKey = '';
  await StorageService.saveProfile(prof);

  const genNoKey = await sendMessage({ action: 'GENERATE_AI_ANSWER', question: 'Tell me about yourself' });
  assert.ok(genNoKey.error.includes('Missing Gemini API Key'));

  prof.settings.geminiApiKey = 'valid-key';
  await StorageService.saveProfile(prof);

  const origAnswer = GeminiService.answerOpenEndedQuestion;
  GeminiService.answerOpenEndedQuestion = async () => 'Answered by AI';
  try {
    const genRes = await sendMessage({ action: 'GENERATE_AI_ANSWER', question: 'Tell me about yourself' });
    assert.strictEqual(genRes.success, true);
    assert.strictEqual(genRes.answer, 'Answered by AI');
  } finally {
    GeminiService.answerOpenEndedQuestion = origAnswer;
  }

  // 12. SUGGEST_FIELD_ANSWER (with and without key)
  prof.settings.geminiApiKey = '';
  await StorageService.saveProfile(prof);

  const suggestNoKey = await sendMessage({ action: 'SUGGEST_FIELD_ANSWER' });
  assert.ok(suggestNoKey.error.includes('Missing Gemini API Key'));

  prof.settings.geminiApiKey = 'test-key';
  await StorageService.saveProfile(prof);

  const origSuggest = GeminiService.suggestFieldAnswer;
  GeminiService.suggestFieldAnswer = async () => 'Suggested Response';
  try {
    const suggestRes = await sendMessage({ action: 'SUGGEST_FIELD_ANSWER', fieldLabel: 'Work Auth' });
    assert.strictEqual(suggestRes.success, true);
    assert.strictEqual(suggestRes.suggestion, 'Suggested Response');
  } finally {
    GeminiService.suggestFieldAnswer = origSuggest;
  }

  // 13. PARSE_RESUME_TEXT (with and without key)
  prof.settings.geminiApiKey = '';
  await StorageService.saveProfile(prof);
  const parseTextNoKey = await sendMessage({ action: 'PARSE_RESUME_TEXT' });
  assert.ok(parseTextNoKey.error.includes('Missing Gemini API Key'));

  prof.settings.geminiApiKey = 'test-key';
  await StorageService.saveProfile(prof);

  const origParseText = GeminiService.parseResumeText;
  GeminiService.parseResumeText = async () => ({ personal: { fullName: 'Pritam Rauniyar' } });
  try {
    const parseTextRes = await sendMessage({ action: 'PARSE_RESUME_TEXT', resumeText: 'Pritam resume' });
    assert.strictEqual(parseTextRes.success, true);
    assert.strictEqual(parseTextRes.parsed.personal.fullName, 'Pritam Rauniyar');
  } finally {
    GeminiService.parseResumeText = origParseText;
  }

  // 14. PARSE_RESUME_FILE (with and without key)
  prof.settings.geminiApiKey = '';
  await StorageService.saveProfile(prof);
  const parseFileNoKey = await sendMessage({ action: 'PARSE_RESUME_FILE' });
  assert.ok(parseFileNoKey.error.includes('Missing Gemini API Key'));

  prof.settings.geminiApiKey = 'test-key';
  await StorageService.saveProfile(prof);

  const origParseFile = GeminiService.parseResumeFile;
  GeminiService.parseResumeFile = async () => ({ personal: { fullName: 'Pritam Rauniyar' } });
  try {
    const parseFileRes = await sendMessage({ action: 'PARSE_RESUME_FILE', base64Data: 'abc', mimeType: 'application/pdf' });
    assert.strictEqual(parseFileRes.success, true);
    assert.strictEqual(parseFileRes.parsed.personal.fullName, 'Pritam Rauniyar');
  } finally {
    GeminiService.parseResumeFile = origParseFile;
  }

  // 15. SAVE_NESTED_FIELD, SAVE_WORK_EXPERIENCE_FIELD & USER_CLEARED_FIELD
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

  // 16. Unknown action & Error in handler
  const unknownRes = await sendMessage({ action: 'UNKNOWN_ACTION_XYZ' });
  assert.strictEqual(unknownRes.error, 'Unknown action');

  // Trigger error inside handler
  const origSave = StorageService.saveProfile;
  StorageService.saveProfile = async () => { throw new Error('Forced Save Failure'); };
  try {
    const errRes = await sendMessage({ action: 'SAVE_PROFILE', profile: {} });
    assert.strictEqual(errRes.error, 'Forced Save Failure');
  } finally {
    StorageService.saveProfile = origSave;
  }
});
