// ApplyPilot AI - Background Service Worker (Manifest V3)
// Ephemeral, Stateless, Secure API Proxy for Gemini Free Tier

importScripts('../lib/storage.js', '../lib/pdf-extractor.js', '../lib/gemini-service.js', '../lib/audit-logger.js');

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
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon-48.png",
          title: "ApplyPilot AI",
          message: "Please set your free Gemini API key in ApplyPilot Settings first."
        });
        return;
      }
      await chrome.tabs.sendMessage(tab.id, { action: "SUGGEST_UNMATCHED" });
    } catch (e) {
      console.warn("Error running AI answer context action:", e);
    }
  } else if (info.menuItemId === "applypilot-open-sidepanel") {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// 3. Message Passing Router
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
          if (sender.tab?.windowId) {
            await chrome.sidePanel.open({ windowId: sender.tab.windowId });
            sendResponse({ success: true });
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

        case "GENERATE_AI_ANSWER": {
          const profile = await StorageService.getProfile();
          const apiKey = profile.settings?.geminiApiKey;
          if (!apiKey) {
            sendResponse({ error: "Missing Gemini API Key. Please add your free key in ApplyPilot Settings." });
            return;
          }

          const model = request.model || profile.settings?.model || "gemini-3.6-flash";
          const answer = await GeminiService.answerOpenEndedQuestion({
            question: request.question,
            jobTitle: request.jobTitle,
            companyName: request.companyName,
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

          const model = request.model || profile.settings?.model || "gemini-3.6-flash";
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

          const model = request.model || profile.settings?.model || "gemini-3.6-flash";
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

          const model = request.model || profile.settings?.model || "gemini-3.6-flash";
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
