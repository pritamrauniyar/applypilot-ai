// ApplyPilot AI - Background Service Worker (Manifest V3)
// Ephemeral, Stateless, Secure API Proxy for Gemini Free Tier

if (typeof importScripts !== 'undefined') {
  importScripts('../lib/storage.js', '../lib/pdf-extractor.js', '../lib/gemini-service.js', '../lib/audit-logger.js');
}

// 1. Extension Installation & Setup
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[ApplyPilot AI] Extension installed/updated.");

  // Initialize default profile if first time
  const profile = await StorageService.getProfile();
  await StorageService.saveProfile(profile);

  // Setup context menus
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "applypilot-autofill",
      title: "🚀 Autofill Job Application",
      contexts: ["page", "editable"]
    });

    chrome.contextMenus.create({
      id: "applypilot-ai-answer",
      title: "✨ Generate AI Answer (Gemini)",
      contexts: ["editable"]
    });

    chrome.contextMenus.create({
      id: "applypilot-open-sidepanel",
      title: "📋 Open ApplyPilot Side Panel",
      contexts: ["all"]
    });
  });
});

// 2. Context Menu Click Handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === "applypilot-autofill") {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "AUTOFILL" });
    } catch (e) {
      console.warn("Could not message active tab:", e);
    }
  } else if (info.menuItemId === "applypilot-ai-answer") {
    try {
      const profile = await StorageService.getProfile();
      const apiKey = profile.settings?.geminiApiKey;
      if (!apiKey) {
        await notifyUser(tab.id, "Add your free Gemini API key in ApplyPilot Settings to use AI answers.");
        return;
      }
      await chrome.tabs.sendMessage(tab.id, { action: "SUGGEST_UNMATCHED" });
    } catch (e) {
      console.warn("Error running AI answer context action:", e);
    }
  } else if (info.menuItemId === "applypilot-open-sidepanel") {
    // A context-menu click is a user gesture, so opening directly is allowed here.
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (e) {
      console.warn("Could not open side panel:", e);
    }
  }
});

// Surface a message to the user. Prefers an in-page toast (no extra permission,
// and it appears where the user is looking); falls back to chrome.notifications
// only when that API is actually available.
async function notifyUser(tabId, message) {
  if (tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: "SHOW_TOAST", message });
      return;
    } catch (e) {
      // Content script not present on this tab - fall through.
    }
  }
  if (typeof chrome !== 'undefined' && chrome.notifications?.create) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon-48.png",
      title: "ApplyPilot AI",
      message
    });
    return;
  }
  console.warn("[ApplyPilot] Could not surface message to user:", message);
}

// 2b. Background Intelligence Compiler & Debounced Queue Processor
//
// MV3 service workers are evicted after ~30s idle, which silently killed the
// setTimeout this used to rely on (and the whole queue with it). chrome.alarms
// survives eviction and wakes the worker back up to run the job.
const REFINEMENT_ALARM = "applypilot-background-refinement";

// chrome.alarms enforces a 1-minute floor for regular extensions.
const REFINEMENT_DELAY_MINUTES = 1;

function scheduleBackgroundRefinement() {
  if (typeof chrome === 'undefined' || !chrome.alarms) return;
  // create() replaces an existing alarm of the same name, giving us the
  // debounce behaviour the old clearTimeout/setTimeout pair provided.
  chrome.alarms.create(REFINEMENT_ALARM, { delayInMinutes: REFINEMENT_DELAY_MINUTES });
}

if (typeof chrome !== 'undefined' && chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === REFINEMENT_ALARM) {
      await processBackgroundSyncQueue();
    }
  });
}

async function processBackgroundSyncQueue() {
  try {
    const pendingItems = await StorageService.getPendingSyncQueue();
    if (!pendingItems || pendingItems.length === 0) return;

    // Clear queue so incoming items can gather cleanly
    await StorageService.clearPendingSyncQueue();

    // Ensure all user_cleared_field items are permanently cleared from profile and marked ignored
    for (const it of pendingItems) {
      if (it && it.type === "user_cleared_field" && it.fieldLabel) {
        await StorageService.handleUserClearedField({
          fieldLabel: it.fieldLabel,
          fieldNameOrId: it.fieldNameOrId
        });
      }
    }

    // Re-read AFTER the mutations above. Reading earlier and saving that
    // snapshot at the end would roll back every clearPendingSyncQueue() and
    // handleUserClearedField() change just committed.
    const profile = await StorageService.getProfile();
    const apiKey = profile.settings?.geminiApiKey;

    if (!apiKey) {
      console.log("[ApplyPilot Background] Telemetry queued. Background Gemini compiler idle (no API key configured).");
      return;
    }

    if (profile.settings?.aiKnowledgeSync === false) {
      console.log("[ApplyPilot Background] AI knowledge sync disabled by user. Skipping compiler.");
      return;
    }

    console.log(`[ApplyPilot Background] Running asynchronous AI knowledge compiler on ${pendingItems.length} items...`);
    const result = await GeminiService.refineKnowledgeBase({
      pendingItems,
      profile,
      apiKey
    });

    if (result) {
      // Both updates below go through the serialized StorageService mutators
      // rather than hand-patching a local snapshot, so a content script writing
      // concurrently from another tab or frame cannot be clobbered.

      // 1. Update Dynamic Fields
      if (Array.isArray(result.updatedFields) && result.updatedFields.length > 0) {
        const existing = await StorageService.getDynamicFields();
        for (const uf of result.updatedFields) {
          const match = existing.find(f => f.canonicalKey === uf.canonicalKey || f.id === uf.id);
          if (match) {
            await StorageService.updateDynamicField(match.id, {
              ...uf,
              id: match.id,
              aliases: Array.from(new Set([...(match.aliases || []), ...(uf.aliases || [])]))
            });
          } else {
            await StorageService.addDynamicField({
              category: uf.category || "Custom / Learned",
              canonicalKey: uf.canonicalKey || `custom.${Date.now()}`,
              label: uf.label || "Custom Field",
              aliases: uf.aliases || [],
              value: uf.value || "",
              companyRules: uf.companyRules || null
            });
          }
        }
      }

      // 2. Update Recommended Ignored Fields
      if (Array.isArray(result.recommendedIgnored) && result.recommendedIgnored.length > 0) {
        for (const ign of result.recommendedIgnored) {
          const label = (typeof ign === "string" ? ign : (ign.label || ign.fieldLabel || "")).trim();
          if (label) {
            await StorageService.addIgnoredOptionalField({ label, keywords: [label.toLowerCase()] });
          }
        }
      }

      await AuditLogger.log({
        actionType: "background_sync",
        portalType: "ai_compiler",
        status: "success",
        details: `Background AI compiler refined ${result.updatedFields?.length || 0} fields and ${result.recommendedIgnored?.length || 0} ignore rules.`
      });
      console.log("[ApplyPilot Background] AI compilation complete and saved.");
    }
  } catch (err) {
    console.warn("[ApplyPilot Background] Error during background refinement:", err);
  }
}

// 3. Message Dispatcher
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.action) {
        case "GET_PROFILE": {
          const profile = await StorageService.getProfile();
          sendResponse({ success: true, profile });
          break;
        }

        case "SAVE_PROFILE": {
          await StorageService.saveProfile(request.profile);
          sendResponse({ success: true });
          break;
        }

        case "GET_ONBOARDING_STATE": {
          const onboarded = await StorageService.isOnboardingComplete();
          sendResponse({ success: true, onboarded });
          break;
        }

        case "COMPLETE_ONBOARDING": {
          await StorageService.completeOnboarding();
          sendResponse({ success: true });
          break;
        }

        case "RESET_PROFILE": {
          const blank = await StorageService.resetProfile();
          await AuditLogger.clearLogs();
          sendResponse({ success: true, profile: blank });
          break;
        }

        case "LOAD_SAMPLE_PROFILE": {
          const sample = await StorageService.loadSampleProfile();
          sendResponse({ success: true, profile: sample });
          break;
        }

        case "QUEUE_BACKGROUND_SYNC": {
          const queued = await StorageService.queuePendingSync(request.item);
          scheduleBackgroundRefinement(25000);
          sendResponse({ success: true, queued });
          break;
        }

        case "GET_PENDING_SYNC_QUEUE": {
          const queue = await StorageService.getPendingSyncQueue();
          sendResponse({ success: true, queue });
          break;
        }

        case "TRIGGER_BACKGROUND_SYNC_NOW": {
          await processBackgroundSyncQueue();
          sendResponse({ success: true });
          break;
        }

        case "RECORD_FIELD_INTERACTION": {
          const res = await StorageService.recordFieldInteraction(request.fieldLabel, {
            filled: request.filled,
            value: request.value,
            isRequired: request.isRequired
          });
          sendResponse({ success: true, res });
          break;
        }

        case "USER_CLEARED_FIELD": {
          const res = await StorageService.handleUserClearedField(request);
          sendResponse({ success: true, res });
          break;
        }

        case "SAVE_WORK_EXPERIENCE_FIELD": {
          const res = await StorageService.saveWorkExperienceRoleDescription(request);
          sendResponse({ success: true, res });
          break;
        }

        case "SAVE_NESTED_FIELD": {
          const res = await StorageService.saveNestedField(request);
          sendResponse({ success: true, res });
          break;
        }

        case "ADD_DYNAMIC_FIELD": {
          const field = await StorageService.addDynamicField(request.field);
          sendResponse({ success: true, field });
          break;
        }

        case "UPDATE_DYNAMIC_FIELD": {
          const field = await StorageService.updateDynamicField(request.id, request.updates);
          sendResponse({ success: true, field });
          break;
        }

        case "DELETE_DYNAMIC_FIELD": {
          const fields = await StorageService.deleteDynamicField(request.id);
          sendResponse({ success: true, fields });
          break;
        }

        case "GET_DYNAMIC_FIELDS": {
          const dynamicFields = await StorageService.getDynamicFields();
          sendResponse({ success: true, dynamicFields });
          break;
        }

        case "SAVE_LEARNED_FIELD": {
          const item = await StorageService.saveLearnedField(request.fieldData);
          sendResponse({ success: true, item });
          break;
        }

        case "ADD_CUSTOM_FIELD": {
          const fields = await StorageService.addCustomField(request.field);
          sendResponse({ success: true, fields });
          break;
        }

        case "DELETE_CUSTOM_FIELD": {
          const fields = await StorageService.deleteCustomField(request.id);
          sendResponse({ success: true, fields });
          break;
        }

        case "LOG_AUDIT_ENTRY": {
          const entry = await AuditLogger.log(request.logData);
          sendResponse({ success: true, entry });
          break;
        }

        case "GET_AUDIT_LOGS": {
          const logs = await AuditLogger.getLogs(request.filter || {});
          const stats = await AuditLogger.getStats();
          sendResponse({ success: true, logs, stats });
          break;
        }

        case "CLEAR_AUDIT_LOGS": {
          await AuditLogger.clearLogs();
          sendResponse({ success: true });
          break;
        }

        case "ADD_IGNORED_FIELD": {
          const ignored = await StorageService.addIgnoredOptionalField(request.fieldInfo);
          sendResponse({ success: true, ignored });
          break;
        }

        case "REMOVE_IGNORED_FIELD": {
          const ignored = await StorageService.removeIgnoredOptionalField(request.idOrPattern);
          sendResponse({ success: true, ignored });
          break;
        }

        case "CLEAR_IGNORED_FIELDS": {
          const ignored = await StorageService.clearIgnoredOptionalFields();
          sendResponse({ success: true, ignored });
          break;
        }

        case "OPEN_SIDEPANEL": {
          // A user gesture in a content script does NOT carry into the worker, so
          // sidePanel.open() from here is rejected by Chrome. Enable open-on-action
          // instead and tell the caller to point the user at the toolbar icon.
          if (!sender.tab?.windowId) {
            sendResponse({ success: false, error: "No window context available for the side panel." });
            break;
          }
          try {
            await chrome.sidePanel.open({ windowId: sender.tab.windowId });
            sendResponse({ success: true });
          } catch (e) {
            sendResponse({
              success: false,
              error: "Chrome only opens the side panel from a direct extension gesture. Click the ApplyPilot toolbar icon, then 'Open Side Panel'."
            });
          }
          break;
        }

        case "TEST_API_KEY": {
          const profile = await StorageService.getProfile();
          const key = request.apiKey || profile.settings?.geminiApiKey;
          const result = await GeminiService.testApiKey(key);
          sendResponse(result);
          break;
        }

        case "DISCOVER_MODELS": {
          const profile = await StorageService.getProfile();
          const key = request.apiKey || profile.settings?.geminiApiKey;
          const result = await GeminiService.testApiKey(key);
          sendResponse(result);
          break;
        }

        case "GENERATE_AI_ANSWER": {
          const profile = await StorageService.getProfile();
          const apiKey = profile.settings?.geminiApiKey;
          if (!apiKey) {
            sendResponse({ error: "Missing Gemini API Key. Please add your free key in ApplyPilot Settings." });
            return;
          }

          // Empty/absent means auto-detect from the live ListModels response.
          const model = request.model || profile.settings?.model || null;
          const answer = await GeminiService.answerOpenEndedQuestion({
            question: request.question,
            jobTitle: request.jobTitle,
            companyName: request.companyName || request.targetCompany,
            parentScope: request.parentScope,
            category: request.category,
            sectionIndex: request.sectionIndex,
            targetCompany: request.targetCompany,
            targetTitle: request.targetTitle,
            experienceItem: request.experienceItem,
            userProfile: profile,
            tone: profile.settings?.answerTone || "Technical & Impactful",
            apiKey,
            preferredModel: model
          });

          sendResponse({ success: true, answer });
          break;
        }

        case "SUGGEST_FIELD_ANSWER": {
          const profile = await StorageService.getProfile();
          const apiKey = profile.settings?.geminiApiKey;
          if (!apiKey) {
            sendResponse({ error: "Missing Gemini API Key. Please add your free key in ApplyPilot Settings." });
            return;
          }

          // Empty/absent means auto-detect from the live ListModels response.
          const model = request.model || profile.settings?.model || null;
          const suggestion = await GeminiService.suggestFieldAnswer({
            fieldLabel: request.fieldLabel,
            fieldType: request.fieldType,
            options: request.options || [],
            pageContext: request.pageContext || "",
            userProfile: profile,
            apiKey,
            preferredModel: model
          });

          sendResponse({ success: true, suggestion });
          break;
        }

        case "PARSE_RESUME_TEXT": {
          const profile = await StorageService.getProfile();
          const apiKey = profile.settings?.geminiApiKey || request.apiKey;
          if (!apiKey) {
            sendResponse({ error: "Missing Gemini API Key. Please add your free key in Settings." });
            return;
          }

          // Empty/absent means auto-detect from the live ListModels response.
          const model = request.model || profile.settings?.model || null;
          const parsed = await GeminiService.parseResumeText(request.resumeText, apiKey, model);
          sendResponse({ success: true, parsed });
          break;
        }

        case "PARSE_RESUME_FILE": {
          const profile = await StorageService.getProfile();
          const apiKey = profile.settings?.geminiApiKey || request.apiKey;
          if (!apiKey) {
            sendResponse({ error: "Missing Gemini API Key. Please add your free key in Settings." });
            return;
          }

          // Empty/absent means auto-detect from the live ListModels response.
          const model = request.model || profile.settings?.model || null;
          const parsed = await GeminiService.parseResumeFile(request.base64Data, request.mimeType, apiKey, model);
          sendResponse({ success: true, parsed });
          break;
        }

        default:
          sendResponse({ error: "Unknown action" });
      }
    } catch (err) {
      console.error("[ApplyPilot Background] Error handling message:", request.action, err);
      sendResponse({ error: err.message || "Internal extension error" });
    }
  })();

  return true; // Keep message channel open for async response
});

if (typeof module !== 'undefined') {
  module.exports = { scheduleBackgroundRefinement, processBackgroundSyncQueue };
}
