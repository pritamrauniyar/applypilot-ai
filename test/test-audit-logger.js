const test = require('node:test');
const assert = require('node:assert');

// Mock window to cover browser environment export
global.window = {
  location: {
    href: 'https://boards.greenhouse.io/uber/jobs/12345',
    hostname: 'boards.greenhouse.io'
  }
};

const { AuditLogger, MAX_AUDIT_LOG_ENTRIES, AUDIT_STORAGE_KEY } = require('../lib/audit-logger.js');

test('AuditLogger: Constants & Integrity', () => {
  assert.strictEqual(MAX_AUDIT_LOG_ENTRIES, 1000);
  assert.strictEqual(AUDIT_STORAGE_KEY, 'applypilot_audit_logs');
  assert.ok(AuditLogger);
});

test('AuditLogger: Memory Fallback Operations', async () => {
  await AuditLogger.clearLogs();
  assert.strictEqual((await AuditLogger.getLogs()).length, 0);

  // 1. Log with window defaults and value masking
  const maskedEntry = await AuditLogger.log({
    fieldLabel: 'Password / SSN',
    valueSet: 'sensitive-secret',
    maskValue: true
  });
  assert.strictEqual(maskedEntry.valueSet, '••••••••');
  assert.strictEqual(maskedEntry.domain, 'boards.greenhouse.io');
  assert.strictEqual(maskedEntry.portalType, 'generic');

  // 2. Log with explicit overrides
  const explicitEntry = await AuditLogger.log({
    url: 'https://lever.co/company/job',
    domain: 'lever.co',
    portalType: 'lever',
    actionType: 'autofill',
    fieldLabel: 'Full Name',
    fieldNameOrId: 'name',
    matchedKey: 'fullName',
    valueSet: 'Pritam Rauniyar',
    status: 'success',
    details: 'Matched via Lever standard profile'
  });
  assert.strictEqual(explicitEntry.domain, 'lever.co');
  assert.strictEqual(explicitEntry.portalType, 'lever');

  // 3. Log different action types and statuses
  await AuditLogger.log({ actionType: 'manual_entry', status: 'success' });
  await AuditLogger.log({ actionType: 'page_learned', status: 'success' });
  await AuditLogger.log({ actionType: 'skipped', status: 'skipped' });
  await AuditLogger.log({ actionType: 'error', status: 'error', details: 'Field not found' });
  await AuditLogger.log({ actionType: 'autofill', status: 'error' });

  // 4. Test Filtering
  const allLogs = await AuditLogger.getLogs();
  assert.strictEqual(allLogs.length, 7);

  const leverLogs = await AuditLogger.getLogs({ portalType: 'lever' });
  assert.strictEqual(leverLogs.length, 1);
  assert.strictEqual(leverLogs[0].portalType, 'lever');

  const autofillLogs = await AuditLogger.getLogs({ actionType: 'autofill' });
  assert.strictEqual(autofillLogs.length, 3);

  const errorLogs = await AuditLogger.getLogs({ status: 'error' });
  assert.strictEqual(errorLogs.length, 2);

  const limitedLogs = await AuditLogger.getLogs({ limit: 3 });
  assert.strictEqual(limitedLogs.length, 3);

  // 5. Test Statistics calculation
  const stats = await AuditLogger.getStats();
  assert.strictEqual(stats.totalEntries, 7);
  assert.strictEqual(stats.totalAutofills, 3);
  assert.strictEqual(stats.totalManualCaptures, 2);
  assert.strictEqual(stats.totalErrors, 2);
  assert.strictEqual(stats.totalSkipped, 1);
  assert.ok(stats.portals['lever.co']);
  // totalOps = 3 (autofill) + 2 (errors) = 5; successRate = (3/5)*100 = 60%
  assert.strictEqual(stats.successRate, '60%');

  // 6. Test JSON and CSV Exports
  const jsonExport = await AuditLogger.exportJSON();
  const parsedJson = JSON.parse(jsonExport);
  assert.strictEqual(parsedJson.app, 'ApplyPilot AI');
  assert.strictEqual(parsedJson.logs.length, 7);

  const csvExport = await AuditLogger.exportCSV();
  assert.ok(csvExport.startsWith('Timestamp,Action,Status'));
  assert.ok(csvExport.includes('"lever.co"'));
  assert.ok(csvExport.includes('••••••••'));

  // 7. Clear Logs
  await AuditLogger.clearLogs();
  const afterClear = await AuditLogger.getLogs();
  assert.strictEqual(afterClear.length, 0);

  // Stats when 0 totalOps
  const emptyStats = await AuditLogger.getStats();
  assert.strictEqual(emptyStats.successRate, '100%');
});

test('AuditLogger: Memory Fallback FIFO Cap > 1000', async () => {
  await AuditLogger.clearLogs();
  // Fill memory logs to overflow MAX_AUDIT_LOG_ENTRIES
  for (let i = 0; i < 1005; i++) {
    await AuditLogger.log({ actionType: 'autofill', valueSet: `item-${i}` });
  }
  const logs = await AuditLogger.getLogs();
  assert.strictEqual(logs.length, 1000);
  assert.strictEqual(logs[0].valueSet, 'item-1004'); // Most recent first
});

test('AuditLogger: chrome.storage.local environment paths', async () => {
  let mockStorage = {};

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
    // 1. Initial log into chrome storage
    const entry1 = await AuditLogger.log({ actionType: 'autofill', portalType: 'workday' });
    assert.ok(entry1.id);
    assert.strictEqual(mockStorage[AUDIT_STORAGE_KEY].length, 1);

    // 2. Log when storage has non-array value
    mockStorage[AUDIT_STORAGE_KEY] = "not-an-array";
    await AuditLogger.log({ actionType: 'autofill', portalType: 'workday' });
    assert.strictEqual(Array.isArray(mockStorage[AUDIT_STORAGE_KEY]), true);

    // 3. Test filtering in chrome storage path
    await AuditLogger.log({ actionType: 'manual_entry', portalType: 'greenhouse', status: 'warning' });
    await AuditLogger.log({ actionType: 'error', portalType: 'lever', status: 'error' });

    const filteredPortal = await AuditLogger.getLogs({ portalType: 'workday' });
    assert.strictEqual(filteredPortal.length, 1);

    const filteredAction = await AuditLogger.getLogs({ actionType: 'manual_entry' });
    assert.strictEqual(filteredAction.length, 1);

    const filteredStatus = await AuditLogger.getLogs({ status: 'error' });
    assert.strictEqual(filteredStatus.length, 1);

    const filteredLimit = await AuditLogger.getLogs({ limit: 2 });
    assert.strictEqual(filteredLimit.length, 2);

    // 4. Test FIFO capping in chrome storage path
    mockStorage[AUDIT_STORAGE_KEY] = Array.from({ length: 1002 }, (_, i) => ({
      id: `log-${i}`,
      timestamp: new Date().toISOString()
    }));
    await AuditLogger.log({ actionType: 'autofill', valueSet: 'overflow' });
    assert.strictEqual(mockStorage[AUDIT_STORAGE_KEY].length, 1000);

    // 5. Test clearLogs in chrome storage
    await AuditLogger.clearLogs();
    assert.deepStrictEqual(mockStorage[AUDIT_STORAGE_KEY], []);
  } finally {
    delete global.chrome;
  }
});
