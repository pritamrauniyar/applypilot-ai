// ApplyPilot AI - Local Audit Logger & Diagnostic Telemetry System
// Stored 100% locally in chrome.storage.local (Zero external telemetries, 100% private)
// Keeps a tamper-free local ledger of all autofill events, detected forms, manual edits, and errors.

const MAX_AUDIT_LOG_ENTRIES = 1000;
const AUDIT_STORAGE_KEY = 'applypilot_audit_logs';

let _memoryLogs = [];

// ---------------------------------------------------------------------------
// Write batching.
//
// A single autofill pass logs one entry per field. Writing each one straight
// through meant a full get + unshift + set of the entire (up to 1000-entry)
// array per field - 40 rewrites for a 40-field form, with concurrent writers
// dropping each other's entries. Entries are now buffered and flushed as one
// read-modify-write, and the flush itself is serialized.
// ---------------------------------------------------------------------------
const FLUSH_DELAY_MS = 250;

let _pendingEntries = [];
let _flushTimer = null;
let _flushChain = Promise.resolve();

function readStoredLogs() {
  return new Promise((resolve) => {
    chrome.storage.local.get([AUDIT_STORAGE_KEY], (res) => {
      const logs = res?.[AUDIT_STORAGE_KEY];
      resolve(Array.isArray(logs) ? logs : []);
    });
  });
}

function writeStoredLogs(logs) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [AUDIT_STORAGE_KEY]: logs }, () => resolve(true));
  });
}

function flushPendingEntries() {
  const batch = _pendingEntries;
  _pendingEntries = [];
  if (batch.length === 0) return _flushChain;

  _flushChain = _flushChain.then(async () => {
    const logs = await readStoredLogs();
    // batch is oldest-first. Unshifting in that order leaves the newest entry at
    // index 0, matching the unbatched write path.
    for (const item of batch) {
      logs.unshift(item);
    }
    await writeStoredLogs(logs.length > MAX_AUDIT_LOG_ENTRIES ? logs.slice(0, MAX_AUDIT_LOG_ENTRIES) : logs);
  }).catch((e) => {
    console.warn("[ApplyPilot] Audit log flush failed:", e);
  });

  return _flushChain;
}

function scheduleFlush() {
  if (_flushTimer) return _flushChain;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    flushPendingEntries();
  }, FLUSH_DELAY_MS);
  return _flushChain;
}

const AuditLogger = {
  // Force any buffered entries to disk. Callers that must read immediately
  // after writing (and the test suite) await this.
  async flush() {
    if (_flushTimer) {
      clearTimeout(_flushTimer);
      _flushTimer = null;
    }
    await flushPendingEntries();
    await _flushChain;
    return true;
  },

  // Append a new event to the audit log
  async log(entry) {
    const timestamp = new Date().toISOString();
    const logItem = {
      id: "log-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      timestamp,
      url: entry.url || (typeof window !== 'undefined' ? window.location.href : ""),
      domain: entry.domain || (typeof window !== 'undefined' ? window.location.hostname : ""),
      portalType: entry.portalType || "generic",
      actionType: entry.actionType || "autofill", // "autofill" | "manual_entry" | "page_learned" | "ai_suggest" | "skipped" | "error"
      fieldLabel: entry.fieldLabel || "",
      fieldNameOrId: entry.fieldNameOrId || "",
      matchedKey: entry.matchedKey || "",
      valueSet: entry.maskValue ? "••••••••" : (entry.valueSet !== undefined ? String(entry.valueSet).slice(0, 200) : ""),
      status: entry.status || "success", // "success" | "warning" | "error" | "skipped"
      details: entry.details || ""
    };

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      _pendingEntries.push(logItem);
      scheduleFlush();
      return logItem;
    }

    _memoryLogs.unshift(logItem);
    if (_memoryLogs.length > MAX_AUDIT_LOG_ENTRIES) {
      _memoryLogs = _memoryLogs.slice(0, MAX_AUDIT_LOG_ENTRIES);
    }
    return logItem;
  },

  // Retrieve logs with optional filtering
  async getLogs(filter = {}) {
    // Drain the buffer first so a read never misses a just-written entry.
    if (typeof chrome !== 'undefined' && chrome.storage?.local) await this.flush();
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get([AUDIT_STORAGE_KEY], (res) => {
          let logs = res?.[AUDIT_STORAGE_KEY] || [];
          if (!Array.isArray(logs)) logs = [];

          if (filter.portalType) {
            logs = logs.filter(l => l.portalType === filter.portalType);
          }
          if (filter.actionType) {
            logs = logs.filter(l => l.actionType === filter.actionType);
          }
          if (filter.status) {
            logs = logs.filter(l => l.status === filter.status);
          }
          if (filter.limit && filter.limit > 0) {
            logs = logs.slice(0, filter.limit);
          }

          resolve(logs);
        });
      });
    }

    let logs = [..._memoryLogs];
    if (filter.portalType) {
      logs = logs.filter(l => l.portalType === filter.portalType);
    }
    if (filter.actionType) {
      logs = logs.filter(l => l.actionType === filter.actionType);
    }
    if (filter.status) {
      logs = logs.filter(l => l.status === filter.status);
    }
    if (filter.limit && filter.limit > 0) {
      logs = logs.slice(0, filter.limit);
    }
    return logs;
  },

  // Clear all logs
  async clearLogs() {
    // Drop anything still buffered, otherwise it would land after the wipe.
    if (_flushTimer) {
      clearTimeout(_flushTimer);
      _flushTimer = null;
    }
    _pendingEntries = [];
    await _flushChain;

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [AUDIT_STORAGE_KEY]: [] }, () => {
          resolve(true);
        });
      });
    }
    _memoryLogs = [];
    return true;
  },

  // Calculate statistics across audit entries
  async getStats() {
    const logs = await this.getLogs();
    const stats = {
      totalEntries: logs.length,
      totalAutofills: 0,
      totalManualCaptures: 0,
      totalErrors: 0,
      totalSkipped: 0,
      portals: {},
      successRate: "100%"
    };

    for (const item of logs) {
      if (item.actionType === 'autofill') stats.totalAutofills++;
      if (item.actionType === 'manual_entry' || item.actionType === 'page_learned') stats.totalManualCaptures++;
      if (item.status === 'error' || item.actionType === 'error') stats.totalErrors++;
      if (item.status === 'skipped' || item.actionType === 'skipped') stats.totalSkipped++;

      if (item.domain) {
        stats.portals[item.domain] = (stats.portals[item.domain] || 0) + 1;
      }
    }

    const totalOps = stats.totalAutofills + stats.totalErrors;
    if (totalOps > 0) {
      stats.successRate = `${Math.round((stats.totalAutofills / totalOps) * 100)}%`;
    }

    return stats;
  },

  // Export audit logs as formatted JSON
  async exportJSON() {
    const logs = await this.getLogs();
    const stats = await this.getStats();
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      app: "ApplyPilot AI",
      stats,
      logs
    }, null, 2);
  },

  // Export audit logs as formatted CSV
  async exportCSV() {
    const logs = await this.getLogs();
    const headers = ["Timestamp", "Action", "Status", "Domain", "Portal", "Field Label", "Matched Key", "Value Set", "Details"];
    const rows = logs.map(l => [
      `"${l.timestamp}"`,
      `"${l.actionType}"`,
      `"${l.status}"`,
      `"${(l.domain || '').replace(/"/g, '""')}"`,
      `"${(l.portalType || '').replace(/"/g, '""')}"`,
      `"${(l.fieldLabel || '').replace(/"/g, '""')}"`,
      `"${(l.matchedKey || '').replace(/"/g, '""')}"`,
      `"${(l.valueSet || '').replace(/"/g, '""')}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
};

if (typeof window !== 'undefined') {
  window.AuditLogger = AuditLogger;
}
if (typeof globalThis !== 'undefined') {
  globalThis.AuditLogger = AuditLogger;
}
if (typeof module !== 'undefined') {
  module.exports = { AuditLogger, MAX_AUDIT_LOG_ENTRIES, AUDIT_STORAGE_KEY };
}

