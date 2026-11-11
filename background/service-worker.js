// ApplyPilot - Background Service Worker (Manifest V3)
// 100% Local, Offline Intelligent Application Engine (Zero external API key required)
/* global StorageService, DeterministicResumeParser, AuditLogger, PdfExtractor, calculateStringSimilarity */

if (typeof importScripts !== 'undefined') {
  importScripts('../lib/storage.js', '../lib/pdf-extractor.js', '../lib/deterministic-resume-parser.js', '../lib/audit-logger.js');
}

function getParser() {
  if (typeof DeterministicResumeParser !== 'undefined') return DeterministicResumeParser;
  if (typeof globalThis !== 'undefined' && globalThis.DeterministicResumeParser) return globalThis.DeterministicResumeParser;
  return null;
}

function getPdfExtractor() {
  if (typeof PdfExtractor !== 'undefined') return PdfExtractor;
  if (typeof globalThis !== 'undefined' && globalThis.PdfExtractor) return globalThis.PdfExtractor;
  return null;
}

function similarityScore(a, b) {
  if (typeof calculateStringSimilarity === 'function') return calculateStringSimilarity(a, b);
  if (typeof globalThis !== 'undefined' && typeof globalThis.calculateStringSimilarity === 'function') {
    return globalThis.calculateStringSimilarity(a, b);
  }
  const s1 = String(a || "").toLowerCase().trim();
  const s2 = String(b || "").toLowerCase().trim();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  return 0;
}

// Deterministic offline open-ended answer builder using local profile & experience
function buildOfflineDraftAnswer(request = {}, profile = {}) {
  const question = String(request.question || "").trim();
  const qLower = question.toLowerCase();
  const tone = request.tone || profile.settings?.answerTone || "Professional & Impactful";
  const personal = profile.personal || {};
  const exp = profile.experience || {};
  const edu = profile.education || {};
  const presets = profile.presets || {};
  const items = Array.isArray(exp.items) ? exp.items : [];
  const companyName = String(request.companyName || request.targetCompany || "").trim();
  const roleTitle = String(request.targetTitle || exp.currentTitle || items[0]?.title || "").trim();
  const skills = String(exp.skills || "").trim();
  const topSkills = skills ? skills.split(/[,;|]+/).map(s => s.trim()).filter(Boolean).slice(0, 6).join(", ") : "";

  const applyCompany = (text) => {
    if (!text) return "";
    if (!companyName) return text;
    return text.replace(/\[company(?:\s*name)?\]/gi, companyName);
  };

  // 1. Work experience role description / responsibilities
  const expItem = request.experienceItem || (Number.isInteger(request.sectionIndex) ? items[request.sectionIndex] : null);
  if (
    request.category === "experience" ||
    /role\s*description|job\s*description|responsibilities|summary\s*of\s*duties|duties/i.test(qLower)
  ) {
    if (expItem?.description) return expItem.description.trim();
    const roleLabel = expItem?.title || roleTitle || "my role";
    const orgLabel = expItem?.company || companyName || exp.currentCompany || "my team";
    if (topSkills) {
      return `Served as ${roleLabel} at ${orgLabel}, designing, building, and scaling production systems using ${topSkills} while collaborating cross-functionally to deliver reliable, measurable outcomes.`;
    }
    if (exp.headline) return exp.headline;
  }

  // 2. Check customFields, learnedMemory, and dynamicFields for an existing relevant answer
  const sources = [];
  for (const m of (profile.learnedMemory || [])) {
    if (m?.fieldLabel && m?.answer) {
      sources.push({ label: m.fieldLabel, keywords: m.questionKeywords || [], value: m.answer });
    }
  }
  for (const cf of (profile.customFields || [])) {
    if (cf?.label && cf?.value) {
      sources.push({ label: cf.label, keywords: cf.keywords || [], value: cf.value });
    }
  }
  for (const df of (profile.dynamicFields || [])) {
    if (df?.value) {
      sources.push({ label: df.label || "", keywords: df.aliases || [], value: df.value });
    }
  }

  let bestScore = 0;
  let bestAnswer = "";
  for (const src of sources) {
    const candidates = [src.label, ...(Array.isArray(src.keywords) ? src.keywords : [])].filter(Boolean);
    for (const cand of candidates) {
      const cleanCand = String(cand).toLowerCase().trim();
      if (!cleanCand) continue;
      let score = similarityScore(qLower, cleanCand);
      if (qLower.includes(cleanCand) && cleanCand.length >= 4) score = Math.max(score, 0.85);
      if (score > bestScore) {
        bestScore = score;
        bestAnswer = src.value;
      }
    }
  }
  if (bestScore >= 0.72 && bestAnswer) {
    return applyCompany(bestAnswer);
  }

  // 3. Intent-based structured drafting from profile facts
  const concise = /concise/i.test(tone);
  const star = /story|challenge/i.test(tone);
  const primaryRole = items[0] || {};
  const recentSummary = primaryRole.description || exp.headline || "";

  if (/why\s*(?:do\s*you\s*want|work|join|us|interested|this\s*role|company)/i.test(qLower)) {
    const targetPhrase = companyName ? `${companyName}` : "your organization";
    const expBit = roleTitle
      ? `With ${exp.yearsOfExperience ? `${exp.yearsOfExperience}+ years of ` : ""}experience as a ${roleTitle}${topSkills ? ` working with ${topSkills}` : ""}, `
      : "";
    if (concise) {
      return `I am excited to join ${targetPhrase} because of the opportunity to apply my background in ${topSkills || roleTitle || "software engineering"} to high-impact products.${recentSummary ? ` ${recentSummary}` : ""}`;
    }
    return `${expBit}I am excited by ${targetPhrase}'s engineering standards and product impact. ${recentSummary || "I focus on building reliable, maintainable solutions that directly serve users."} I look forward to bringing ownership, strong fundamentals, and collaborative execution to ${targetPhrase}.`;
  }

  if (/tell\s*me\s*about\s*yourself|introduce|summary|background|about\s*you/i.test(qLower)) {
    const who = personal.fullName ? `I am ${personal.fullName}, ` : "I am ";
    const rolePart = roleTitle
      ? `a ${roleTitle}${exp.currentCompany ? ` currently at ${exp.currentCompany}` : ""}${exp.yearsOfExperience ? ` with ${exp.yearsOfExperience}+ years of experience` : ""}.`
      : "an experienced professional focused on delivering measurable impact.";
    const eduPart = edu.degree || edu.school
      ? ` I hold a ${[edu.degree, edu.fieldOfStudy ? `in ${edu.fieldOfStudy}` : ""].filter(Boolean).join(" ")}${edu.school ? ` from ${edu.school}` : ""}.`
      : "";
    const skillPart = topSkills ? ` My core strengths include ${topSkills}.` : "";
    return `${who}${rolePart}${recentSummary ? ` ${recentSummary}` : ""}${skillPart}${concise ? "" : eduPart}`.trim();
  }

  if (/challenge|achievement|accomplish|proud|project|difficult|conflict|star/i.test(qLower)) {
    if (recentSummary) {
      return star
        ? `Situation & Task: While serving as ${primaryRole.title || roleTitle || "an engineer"}${primaryRole.company ? ` at ${primaryRole.company}` : ""}, our team needed to improve system reliability and scale. Action & Result: ${recentSummary}`
        : recentSummary;
    }
    if (topSkills) {
      return `In my most recent role${roleTitle ? ` as ${roleTitle}` : ""}, I delivered end-to-end initiatives using ${topSkills}, improving reliability and team delivery speed through structured execution and clear communication.`;
    }
  }

  if (/leaving|looking|why\s*now|notice|availability|start/i.test(qLower)) {
    return presets.noticePeriod
      ? `I am seeking my next high-impact role where I can grow my technical and product ownership. Availability / Notice Period: ${presets.noticePeriod}.`
      : "I am looking for a new opportunity where I can make a strong impact and take on broader ownership.";
  }

  if (/salary|compensation|ctc|pay/i.test(qLower) && presets.salaryExpectations) {
    return presets.salaryExpectations;
  }

  // Generic professional response using profile details
  const baseParts = [];
  if (roleTitle) {
    baseParts.push(`In my experience as a ${roleTitle}${exp.currentCompany ? ` at ${exp.currentCompany}` : ""}${exp.yearsOfExperience ? ` (${exp.yearsOfExperience}+ years)` : ""}, I have consistently delivered reliable, high-quality work.`);
  }
  if (recentSummary) {
    baseParts.push(recentSummary);
  }
  if (topSkills && !concise) {
    baseParts.push(`Key relevant skills: ${topSkills}.`);
  }
  if (companyName && !concise) {
    baseParts.push(`I would welcome the opportunity to contribute these capabilities to ${companyName}.`);
  }

  if (baseParts.length > 0) return baseParts.join(" ");

  return `I bring dedicated experience, strong problem-solving skills, and a collaborative mindset to ${companyName || "this role"}. Please update your Profile or Experience details in ApplyPilot for even more tailored drafts.`;
}

// Deterministic offline suggestion engine for unmatched form fields
function buildOfflineFieldSuggestion(request = {}, profile = {}) {
  const fieldLabel = String(request.fieldLabel || "").trim();
  const qLower = fieldLabel.toLowerCase();
  const options = Array.isArray(request.options) ? request.options.filter(Boolean) : [];
  const pageContext = String(request.pageContext || "").toLowerCase();

  const pickBestOption = (candidateValue) => {
    if (!options.length) return candidateValue;
    if (!candidateValue) return "";
    const target = String(candidateValue).toLowerCase().trim();
    const exact = options.find(o => o.toLowerCase().trim() === target);
    if (exact) return exact;
    const partial = options.find(o => {
      const ol = o.toLowerCase().trim();
      return ol.includes(target) || (target.length >= 2 && target.includes(ol));
    });
    return partial || candidateValue;
  };

  if (!qLower) {
    return "";
  }

  // 1. Check learnedMemory, customFields, and dynamicFields (including companyRules/companyAnswers)
  for (const m of (profile.learnedMemory || [])) {
    if (!m?.answer) continue;
    const lbl = (m.fieldLabel || "").toLowerCase().trim();
    if (lbl === qLower || similarityScore(qLower, lbl) >= 0.85) {
      return pickBestOption(m.answer);
    }
  }

  for (const df of (profile.dynamicFields || [])) {
    const terms = [df.label, ...(df.aliases || [])].filter(Boolean);
    const matched = terms.some(t => {
      const tl = String(t).toLowerCase().trim();
      return tl === qLower || (tl.length >= 4 && (qLower.includes(tl) || tl.includes(qLower))) || similarityScore(qLower, tl) >= 0.88;
    });
    if (matched) {
      const rules = df.companyRules || df.companyAnswers;
      if (rules && typeof rules === 'object') {
        for (const [comp, ans] of Object.entries(rules)) {
          if (comp !== 'default' && pageContext.includes(comp.toLowerCase())) {
            return pickBestOption(ans);
          }
        }
        if (rules.default) return pickBestOption(rules.default);
      }
      if (df.value) return pickBestOption(df.value);
    }
  }

  for (const cf of (profile.customFields || [])) {
    if (!cf?.value) continue;
    const terms = [cf.label, ...(cf.keywords || [])].filter(Boolean);
    if (terms.some(t => qLower.includes(String(t).toLowerCase()) || similarityScore(qLower, t) >= 0.82)) {
      return pickBestOption(cf.value);
    }
  }

  // 2. Preset & heuristic rules
  const p = profile.personal || {};
  const presets = profile.presets || {};
  const exp = profile.experience || {};
  const edu = profile.education || {};
  const links = profile.links || {};

  if (/work\s*auth(?:orization|orised|orized)?|authorized\s*to\s*work|legally\s*authorized|right\s*to\s*work|eligible\s*to\s*work/i.test(qLower)) {
    return pickBestOption(presets.workAuthorization || "Yes");
  }
  if (/sponsor|visa/i.test(qLower)) {
    return pickBestOption(presets.requireSponsorship || "No");
  }
  if (/relocat/i.test(qLower)) {
    return pickBestOption(presets.willingToRelocate || "Yes");
  }
  if (/notice\s*period|when\s*can\s*you\s*start|start\s*date|availability/i.test(qLower)) {
    return pickBestOption(presets.noticePeriod || exp.noticePeriod || "Immediately available");
  }
  if (/salary|compensation|ctc|expected\s*pay/i.test(qLower)) {
    return pickBestOption(presets.salaryExpectations || "Negotiable");
  }
  if (/years\s*(?:of)?\s*experience|how\s*many\s*years/i.test(qLower)) {
    return pickBestOption(exp.yearsOfExperience || "");
  }
  if (/previously\s*worked|worked\s*(?:at|for)|former\s*employee|employed\s*by/i.test(qLower)) {
    return pickBestOption("No");
  }
  if (/how\s*did\s*you\s*hear|referral\s*source|where\s*did\s*you\s*(?:hear|find)|source/i.test(qLower)) {
    return pickBestOption("Company Website");
  }
  if (/18\s*years|legal\s*age|of\s*age/i.test(qLower)) {
    return pickBestOption("Yes");
  }
  if (/gender/i.test(qLower)) return pickBestOption(presets.gender || "Decline to state");
  if (/veteran/i.test(qLower)) return pickBestOption(presets.veteranStatus || "I decline to state");
  if (/disabilit/i.test(qLower)) return pickBestOption(presets.disabilityStatus || "I decline to state");
  if (/race|ethnicity/i.test(qLower)) return pickBestOption(presets.race || "Decline to state");
  if (/linkedin/i.test(qLower)) return links.linkedin || "";
  if (/github/i.test(qLower)) return links.github || "";
  if (/portfolio|website|personal\s*site/i.test(qLower)) return links.portfolio || "";
  if (/university|college|school|institution/i.test(qLower)) return edu.school || "";
  if (/degree/i.test(qLower)) return pickBestOption(edu.degree || "");
  if (/major|field\s*of\s*study|discipline/i.test(qLower)) return edu.fieldOfStudy || "";
  if (/city/i.test(qLower)) return p.city || "";
  if (/state|province/i.test(qLower)) return pickBestOption(p.state || "");
  if (/country/i.test(qLower)) return pickBestOption(p.country || "");

  // If this looks like a narrative prompt, draft a helpful response
  if (request.fieldType === "textarea" || /why|describe|tell\s*us|explain|summary|cover\s*letter/i.test(qLower)) {
    return buildOfflineDraftAnswer({ question: fieldLabel }, profile);
  }

  return "";
}

// 1. Extension Installation & Setup
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[ApplyPilot] Extension installed/updated.");

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
      title: "⚡ Smart Draft / Review Unmatched Field",
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
      await chrome.tabs.sendMessage(tab.id, { action: "SUGGEST_UNMATCHED" });
    } catch (e) {
      console.warn("Error running unmatched field review action:", e);
      await notifyUser(tab.id, "Open a job application page and reload the tab to review fields with ApplyPilot.");
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
      title: "ApplyPilot",
      message
    });
    return;
  }
  console.warn("[ApplyPilot] Could not surface message to user:", message);
}

// 2b. Background Local Intelligence Compiler & Debounced Queue Processor
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
    if (!pendingItems || pendingItems.length === 0) {
      return { processedCount: 0, learnedCount: 0, ignoredCount: 0 };
    }

    // Clear queue so incoming items can gather cleanly
    await StorageService.clearPendingSyncQueue();

    let learnedCount = 0;
    let ignoredCount = 0;

    // 1. Consolidate cleared fields and deterministic user corrections locally
    for (const it of pendingItems) {
      if (!it) continue;

      if (it.type === "user_cleared_field" && it.fieldLabel) {
        await StorageService.handleUserClearedField({
          fieldLabel: it.fieldLabel,
          fieldNameOrId: it.fieldNameOrId
        });
      } else if (it.type === "user_correction") {
        const label = String(it.fieldLabel || it.field || "").trim();
        const value = it.correctedValue !== undefined ? String(it.correctedValue).trim() : String(it.value || "").trim();
        if (label && value) {
          await StorageService.saveLearnedField({
            fieldLabel: label,
            answer: value,
            keywords: [label.toLowerCase(), it.fieldNameOrId].filter(Boolean)
          });

          const existingDynamic = await StorageService.getDynamicFields();
          const matchedDynamic = existingDynamic.find(f =>
            similarityScore(f.label, label) >= 0.85 ||
            (f.aliases || []).some(a => similarityScore(a, label) >= 0.85)
          );
          if (matchedDynamic) {
            const nextAliases = Array.from(new Set([...(matchedDynamic.aliases || []), label.toLowerCase()]));
            if (it.targetCompany && matchedDynamic.canonicalKey === "employment.previous_employee_at_company") {
              const rules = { ...(matchedDynamic.companyRules || {}), [it.targetCompany]: value };
              await StorageService.updateDynamicField(matchedDynamic.id, { aliases: nextAliases, companyRules: rules });
            } else {
              await StorageService.updateDynamicField(matchedDynamic.id, { aliases: nextAliases, value });
            }
          }
          learnedCount++;
        }
      }
    }

    // 2. Promote repeatedly skipped optional fields into ignoredOptionalFields
    const profile = await StorageService.getProfile();
    const statsEntries = Object.values(profile.fieldInteractionStats || {});
    for (const st of statsEntries) {
      if (st && st.predictedIgnored && st.label && !st.isRequired) {
        const alreadyIgnored = (profile.ignoredOptionalFields || []).some(
          ign => (ign.label || "").toLowerCase() === st.label.toLowerCase()
        );
        if (!alreadyIgnored) {
          await StorageService.addIgnoredOptionalField({
            label: st.label,
            keywords: [st.label.toLowerCase()]
          });
          ignoredCount++;
        }
      }
    }

    await AuditLogger.log({
      actionType: "background_sync",
      portalType: "local_engine",
      status: "success",
      details: `Local engine consolidated ${pendingItems.length} events (${learnedCount} learned, ${ignoredCount} ignore rules).`
    });

    return {
      processedCount: pendingItems.length,
      learnedCount,
      ignoredCount
    };
  } catch (err) {
    console.warn("[ApplyPilot Background] Error during local memory consolidation:", err);
    return { processedCount: 0, learnedCount: 0, ignoredCount: 0, error: err.message };
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
          const summary = await processBackgroundSyncQueue();
          sendResponse({
            success: true,
            processedCount: summary?.processedCount || 0,
            learnedCount: summary?.learnedCount || 0,
            ignoredCount: summary?.ignoredCount || 0
          });
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

        case "GENERATE_AI_ANSWER": {
          const profile = await StorageService.getProfile();
          const answer = buildOfflineDraftAnswer(request, profile);
          sendResponse({ success: true, answer, offline: true });
          break;
        }

        case "SUGGEST_FIELD_ANSWER": {
          const profile = await StorageService.getProfile();
          const suggestion = buildOfflineFieldSuggestion(request, profile);
          sendResponse({ success: true, suggestion, offline: true });
          break;
        }

        case "PARSE_RESUME_TEXT": {
          const resumeText = typeof request.resumeText === 'string' ? request.resumeText.trim() : '';
          if (!resumeText) {
            sendResponse({ error: "Please provide resume text to parse." });
            return;
          }

          const parser = getParser();
          if (!parser || typeof parser.parse !== 'function') {
            sendResponse({ error: "Offline resume parser is unavailable." });
            return;
          }

          const parsed = parser.parse(resumeText);
          sendResponse({ success: true, parsed, offline: true });
          break;
        }

        case "PARSE_RESUME_FILE": {
          const mimeType = String(request.mimeType || "application/pdf").toLowerCase();
          if (!request.base64Data || typeof request.base64Data !== 'string') {
            sendResponse({ error: "No resume file data provided." });
            return;
          }

          if (mimeType.startsWith("image/")) {
            sendResponse({
              error: "Image screenshots cannot be parsed offline. Please upload a text-based PDF/TXT resume or paste your resume text."
            });
            return;
          }

          const extractor = getPdfExtractor();
          const parser = getParser();
          if (!extractor || !parser) {
            sendResponse({ error: "Offline resume extractor is unavailable." });
            return;
          }

          const binaryStr = atob(request.base64Data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }

          const pseudoFile = {
            name: request.fileName || (mimeType.includes("text") ? "resume.txt" : "resume.pdf"),
            type: mimeType,
            arrayBuffer: async () => bytes.buffer,
            text: async () => new TextDecoder().decode(bytes)
          };

          const extractedText = await extractor.extractText(pseudoFile);
          if (!extractedText || extractedText.trim().length < 15) {
            sendResponse({
              error: "Could not extract readable text from this file. Please paste your resume text instead."
            });
            return;
          }

          const parsed = parser.parse(extractedText);
          sendResponse({ success: true, parsed, offline: true });
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
  module.exports = {
    scheduleBackgroundRefinement,
    processBackgroundSyncQueue,
    buildOfflineDraftAnswer,
    buildOfflineFieldSuggestion
  };
}
