// ApplyPilot AI - Local Audit Logger & Diagnostic Telemetry System
// Stored 100% locally in chrome.storage.local (Zero external telemetries, 100% private)
// Keeps a tamper-free local ledger of all autofill events, detected forms, manual edits, and errors.

const MAX_AUDIT_LOG_ENTRIES = 1000;
const AUDIT_STORAGE_KEY = 'applypilot_audit_logs';

const AuditLogger = {
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
      return new Promise((resolve) => {
        chrome.storage.local.get([AUDIT_STORAGE_KEY], (res) => {
          let logs = res?.[AUDIT_STORAGE_KEY] || [];
          if (!Array.isArray(logs)) logs = [];

          logs.unshift(logItem);

          // Enforce FIFO maximum cap
          if (logs.length > MAX_AUDIT_LOG_ENTRIES) {
            logs = logs.slice(0, MAX_AUDIT_LOG_ENTRIES);
          }

          chrome.storage.local.set({ [AUDIT_STORAGE_KEY]: logs }, () => {
            resolve(logItem);
          });
        });
      });
    }

    return logItem;
  },

  // Retrieve logs with optional filtering
  async getLogs(filter = {}) {
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
    return [];
  },

  // Clear all logs
  async clearLogs() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [AUDIT_STORAGE_KEY]: [] }, () => {
          resolve(true);
        });
      });
    }
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
