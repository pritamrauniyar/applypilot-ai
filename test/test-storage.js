const test = require('node:test');
const assert = require('node:assert');

// Mock window to cover browser environment export
global.window = {};

const {
  StorageService,
  DEFAULT_PROFILE,
  calculateStringSimilarity,
  is90PercentMatch,
  isNinetyPercentMatch
} = require('../lib/storage.js');

test('Storage: DEFAULT_PROFILE integrity and creator branding', () => {
  assert.ok(DEFAULT_PROFILE, 'DEFAULT_PROFILE exists');
  assert.strictEqual(DEFAULT_PROFILE.creator.name, 'Pritam Rauniyar');
  assert.strictEqual(DEFAULT_PROFILE.creator.portfolio, 'https://pritamrauniyar.com.np/');
  assert.ok(DEFAULT_PROFILE.personal.firstName);
  assert.ok(DEFAULT_PROFILE.experience.items.length > 0);
  assert.ok(DEFAULT_PROFILE.education.items.length > 0);
  assert.ok(DEFAULT_PROFILE.dynamicFields.length > 0);
  assert.ok(DEFAULT_PROFILE.customFields.length > 0);
});

test('Storage: calculateStringSimilarity & is90PercentMatch edge cases', () => {
  // Empty or falsy strings
  assert.strictEqual(calculateStringSimilarity('', 'test'), 0);
  assert.strictEqual(calculateStringSimilarity('test', ''), 0);
  assert.strictEqual(calculateStringSimilarity(null, undefined), 0);

  // Exact match
  assert.strictEqual(calculateStringSimilarity('Uber', 'uber'), 1.0);
  assert.strictEqual(calculateStringSimilarity('Software Engineer', 'Software Engineer!'), 1.0);

  // Substring inclusion
  const sub1 = calculateStringSimilarity('Software Engineer', 'Senior Software Engineer');
  assert.ok(sub1 >= 0.90, `Sub1 similarity should be >= 0.90, got ${sub1}`);

  const sub2 = calculateStringSimilarity('Uber', 'Uber Technologies Inc');
  assert.ok(sub2 >= 0.90, `Sub2 similarity should be >= 0.90, got ${sub2}`);

  // Token Jaccard similarity (order independent)
  const jaccard = calculateStringSimilarity('Distributed Systems Go Kafka', 'Kafka Go Systems Distributed');
  assert.ok(jaccard >= 0.90, `Jaccard similarity should be >= 0.90, got ${jaccard}`);

  // One empty token set vs non-empty after stripping
  assert.strictEqual(calculateStringSimilarity('!!!', 'hello'), 0);

  // Levenshtein typo distance
  const typo = calculateStringSimilarity('Kubernetes', 'Kubernets');
  assert.ok(typo >= 0.85, `Typo similarity should be >= 0.85, got ${typo}`);

  // Length difference > 3 with low jaccard
  const diffLen = calculateStringSimilarity('React', 'Completely Different Framework');
  assert.ok(diffLen < 0.5, `Different string similarity should be low, got ${diffLen}`);

  // is90PercentMatch and isNinetyPercentMatch aliases
  assert.strictEqual(is90PercentMatch('Uber', 'Uber Technologies'), true);
  assert.strictEqual(isNinetyPercentMatch('Microsoft Corp', 'Microsoft'), true);
  assert.strictEqual(is90PercentMatch('Apple', 'Banana'), false);
});

test('Storage: Memory Fallback CRUD Operations', async () => {
  // 1. getProfile & saveProfile
  const profile = await StorageService.getProfile();
  assert.ok(profile.personal.firstName);

  profile.personal.firstName = 'TestName';
  await StorageService.saveProfile(profile);
  const updated = await StorageService.getProfile();
  assert.strictEqual(updated.personal.firstName, 'TestName');

  // 2. saveApiKey
  await StorageService.saveApiKey('  test-api-key-123  ');
  const profWithKey = await StorageService.getProfile();
  assert.strictEqual(profWithKey.settings.geminiApiKey, 'test-api-key-123');

  // 3. saveLearnedField (create, update, cap > 200)
  const mem1 = await StorageService.saveLearnedField({
    fieldLabel: 'Years of Experience with Go',
    keywords: ['years', 'go', 'golang'],
    answer: '4 years',
    fieldType: 'text'
  });
  assert.ok(mem1.id);
  assert.strictEqual(mem1.answer, '4 years');

  // Update same field
  const mem1Updated = await StorageService.saveLearnedField({
    fieldLabel: 'Years of Experience with Go',
    answer: '5 years'
  });
  assert.strictEqual(mem1Updated.answer, '5 years');

  // Cap > 200
  const p = await StorageService.getProfile();
  p.learnedMemory = Array.from({ length: 205 }, (_, i) => ({
    id: `mem-${i}`,
    fieldLabel: `Question ${i}`,
    answer: `Answer ${i}`
  }));
  await StorageService.saveProfile(p);
  await StorageService.saveLearnedField({
    fieldLabel: 'New Question After Overflow',
    answer: 'New Answer'
  });
  const pCapped = await StorageService.getProfile();
  assert.ok(pCapped.learnedMemory.length <= 200);

  // 4. addCustomField & deleteCustomField
  const cfs = await StorageService.addCustomField({
    label: 'Preferred Work Style',
    value: 'Asynchronous',
    keywords: 'work style, preference, async'
  });
  const addedCf = cfs.find(f => f.label === 'Preferred Work Style');
  assert.ok(addedCf);
  assert.deepStrictEqual(addedCf.keywords, ['work style', 'preference', 'async']);

  // Add without keywords
  const cfsNoKw = await StorageService.addCustomField({
    label: 'Hobbies',
    value: 'Open Source'
  });
  const addedNoKw = cfsNoKw.find(f => f.label === 'Hobbies');
  assert.deepStrictEqual(addedNoKw.keywords, ['hobbies']);

  // Delete custom field
  const afterDelete = await StorageService.deleteCustomField(addedCf.id);
  assert.ok(!afterDelete.some(f => f.id === addedCf.id));

  // 5. addIgnoredOptionalField, removeIgnoredOptionalField, clearIgnoredOptionalFields
  await StorageService.addIgnoredOptionalField('Gender Identity');
  await StorageService.addIgnoredOptionalField({ fieldLabel: 'Veteran Status' });
  await StorageService.addIgnoredOptionalField({ key: 'Pronouns', keywords: ['pronouns'] });
  await StorageService.addIgnoredOptionalField(''); // Empty string ignored

  let ignoredList = (await StorageService.getProfile()).ignoredOptionalFields;
  assert.ok(ignoredList.some(f => f.label === 'Gender Identity'));
  assert.ok(ignoredList.some(f => f.label === 'Veteran Status'));

  // Duplicate add should not duplicate
  await StorageService.addIgnoredOptionalField('Gender Identity');
  const countGender = (await StorageService.getProfile()).ignoredOptionalFields.filter(f => f.label === 'Gender Identity').length;
  assert.strictEqual(countGender, 1);

  // Remove by pattern/label
  await StorageService.removeIgnoredOptionalField('Gender Identity');
  ignoredList = (await StorageService.getProfile()).ignoredOptionalFields;
  assert.ok(!ignoredList.some(f => f.label === 'Gender Identity'));

  // Clear all ignored
  await StorageService.clearIgnoredOptionalFields();
  const clearedList = (await StorageService.getProfile()).ignoredOptionalFields;
  assert.strictEqual(clearedList.length, 0);

  // 6. Dynamic Fields CRUD
  const newDf = await StorageService.addDynamicField({
    category: 'Work Authorization',
    canonicalKey: 'auth.h1b',
    label: 'H1B Status',
    aliases: 'h1b, visa sponsorship, work visa',
    value: 'Not required',
    nestedDetails: { country: 'USA' }
  });
  assert.ok(newDf.id);
  assert.strictEqual(newDf.value, 'Not required');
  assert.deepStrictEqual(newDf.aliases, ['h1b', 'visa sponsorship', 'work visa']);

  // Add dynamic field with array aliases and default values
  const defaultDf = await StorageService.addDynamicField({
    label: 'Notice Period'
  });
  assert.strictEqual(defaultDf.category, 'Custom / Learned');

  // Update dynamic field
  const updatedDf = await StorageService.updateDynamicField(newDf.id, {
    value: 'Authorized'
  });
  assert.strictEqual(updatedDf.value, 'Authorized');

  // Update non-existent dynamic field
  const notFoundDf = await StorageService.updateDynamicField('non-existent-id', { value: 'none' });
  assert.strictEqual(notFoundDf, null);

  // Delete dynamic field
  const afterDeleteDf = await StorageService.deleteDynamicField(newDf.id);
  assert.ok(!afterDeleteDf.some(f => f.id === newDf.id));

  // 7. recordFieldInteraction (fill tracking & predictive ignore)
  await StorageService.recordFieldInteraction(''); // empty label
  await StorageService.recordFieldInteraction('Phone Extension', { filled: false, isRequired: false });
  let statsProf = await StorageService.getProfile();
  assert.strictEqual(statsProf.fieldInteractionStats['phone_extension'].skippedCount, 1);
  assert.strictEqual(statsProf.fieldInteractionStats['phone_extension'].predictedIgnored, false);

  // Skip 2nd time -> predictedIgnored should become true
  await StorageService.recordFieldInteraction('Phone Extension', { filled: false, isRequired: false });
  statsProf = await StorageService.getProfile();
  assert.strictEqual(statsProf.fieldInteractionStats['phone_extension'].skippedCount, 2);
  assert.strictEqual(statsProf.fieldInteractionStats['phone_extension'].predictedIgnored, true);

  // Filling it later resets predictedIgnored to false
  await StorageService.recordFieldInteraction('Phone Extension', { filled: true, value: 'x123', isRequired: false });
  statsProf = await StorageService.getProfile();
  assert.strictEqual(statsProf.fieldInteractionStats['phone_extension'].predictedIgnored, false);
  assert.strictEqual(statsProf.fieldInteractionStats['phone_extension'].lastValue, 'x123');

  // Required field skipped does NOT predict ignore
  await StorageService.recordFieldInteraction('Last Name', { filled: false, isRequired: true });
  await StorageService.recordFieldInteraction('Last Name', { filled: false, isRequired: true });
  statsProf = await StorageService.getProfile();
  assert.strictEqual(statsProf.fieldInteractionStats['last_name'].predictedIgnored, false);

  // 8. Pending Sync Queue
  await StorageService.clearPendingSyncQueue();
  const emptyQueue = await StorageService.getPendingSyncQueue();
  assert.strictEqual(emptyQueue.length, 0);

  const queued = await StorageService.queuePendingSync({ action: 'correction', field: 'Current Company' });
  assert.ok(queued.id);
  assert.strictEqual(queued.status, 'pending');

  const currentQueue = await StorageService.getPendingSyncQueue();
  assert.strictEqual(currentQueue.length, 1);

  // Test capping pending sync queue at 50
  const profQueue = await StorageService.getProfile();
  profQueue.pendingSyncQueue = Array.from({ length: 55 }, (_, i) => ({ id: `q-${i}` }));
  await StorageService.saveProfile(profQueue);
  await StorageService.queuePendingSync({ action: 'overflow_test' });
  const cappedQueue = await StorageService.getPendingSyncQueue();
  assert.ok(cappedQueue.length <= 50);

  await StorageService.clearPendingSyncQueue();
  assert.strictEqual((await StorageService.getPendingSyncQueue()).length, 0);
});

test('Storage: chrome.storage.local environment paths and migrations', async () => {
  let mockStorage = {};

  // Mock global.chrome
  global.chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          const res = {};
          keys.forEach(k => { if (mockStorage[k] !== undefined) res[k] = mockStorage[k]; });
          cb(res);
        },
        set: (items, cb) => {
          Object.assign(mockStorage, items);
          if (cb) cb();
        }
      }
    }
  };

  try {
    // 1. getProfile when nothing is stored -> returns DEFAULT_PROFILE
    const p1 = await StorageService.getProfile();
    assert.strictEqual(p1.creator.name, 'Pritam Rauniyar');

    // 2. saveProfile into chrome.storage.local
    p1.personal.city = 'New York';
    await StorageService.saveProfile(p1);
    assert.ok(mockStorage.applypilot_profile);
    assert.strictEqual(mockStorage.applypilot_profile.personal.city, 'New York');

    // 3. Schema migration tests:
    // a. Outdated portfolio link ("https://pritam.dev" -> "https://pritamrauniyar.com.np/")
    // b. Deprecated Gemini model ("gemini-1.5-pro" -> "gemini-3.6-flash")
    // c. Sequential experience items fallback from single currentCompany / currentTitle
    // d. Sequential education items fallback from school / degree
    mockStorage.applypilot_profile = {
      personal: { firstName: 'Migrated' },
      links: { portfolio: 'https://pritam.dev' },
      settings: { model: 'gemini-1.5-pro' },
      experience: {
        currentCompany: 'Legacy Corp',
        currentTitle: 'Lead Dev'
      },
      education: {
        school: 'State University',
        degree: 'BS CS'
      }
    };

    const migrated = await StorageService.getProfile();
    assert.strictEqual(migrated.links.portfolio, 'https://pritamrauniyar.com.np/');
    assert.strictEqual(migrated.settings.model, 'gemini-3.6-flash');
    assert.ok(Array.isArray(migrated.experience.items) && migrated.experience.items.length === 1);
    assert.strictEqual(migrated.experience.items[0].company, 'Legacy Corp');
    assert.strictEqual(migrated.experience.items[0].title, 'Lead Dev');
    assert.ok(Array.isArray(migrated.education.items) && migrated.education.items.length === 1);
    assert.strictEqual(migrated.education.items[0].school, 'State University');

    // Test model with 2.0 and 2.5
    mockStorage.applypilot_profile.settings.model = 'gemini-2.0-flash';
    const migrated2 = await StorageService.getProfile();
    assert.strictEqual(migrated2.settings.model, 'gemini-3.6-flash');

    mockStorage.applypilot_profile.settings.model = 'gemini-2.5-flash';
    const migrated25 = await StorageService.getProfile();
    assert.strictEqual(migrated25.settings.model, 'gemini-3.6-flash');

    // Test with pre-existing sequential experience and education items
    mockStorage.applypilot_profile.experience = {
      items: [
        { id: 'exp-a', title: 'A', company: 'Company A' },
        { id: 'exp-b', title: 'B', company: 'Company B' }
      ]
    };
    mockStorage.applypilot_profile.education = {
      items: [
        { id: 'edu-a', school: 'School A', degree: 'Degree A' }
      ]
    };
    const seqProfile = await StorageService.getProfile();
    assert.strictEqual(seqProfile.experience.items.length, 2);
    assert.strictEqual(seqProfile.education.items.length, 1);

  } finally {
    delete global.chrome;
  }
});
