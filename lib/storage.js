// ApplyPilot AI - Local Storage & Data Management Module
// All data is stored locally in chrome.storage.local (Zero external servers, 100% private)

const DEFAULT_PROFILE = {
  creator: {
    name: "Pritam Rauniyar",
    portfolio: "https://pritamrauniyar.com.np/",
    tagline: "Universal AI-Powered Job Application Engine"
  },
  personal: {
    firstName: "Pritam",
    middleName: "",
    lastName: "Rauniyar",
    fullName: "Pritam Rauniyar",
    email: "pritam.rauniyar@example.com",
    phone: "+1 (555) 234-5678",
    location: "San Francisco, CA",
    city: "San Francisco",
    state: "CA",
    postalCode: "94103",
    country: "United States",
    address: "123 Market Street"
  },
  links: {
    linkedin: "https://linkedin.com/in/pritamrauniyar",
    github: "https://github.com/pritamrauniyar",
    portfolio: "https://pritamrauniyar.com.np/",
    twitter: ""
  },
  experience: {
    currentCompany: "Uber",
    currentTitle: "Software Engineer II",
    yearsOfExperience: "4",
    location: "San Francisco, CA",
    noticePeriod: "Immediately available",
    earliestStartDate: "Immediate",
    headline: "Software Engineer II with 4+ years building high-throughput distributed microservices, APIs, and scalable backend platforms.",
    skills: "Go, Java, Python, Microservices, Distributed Systems, Kafka, Docker, Kubernetes, gRPC, PostgreSQL, Redis, AWS",
    items: [
      {
        id: "exp-1",
        title: "Software Engineer II",
        company: "Uber",
        location: "San Francisco, CA",
        startDate: "2022-08",
        endDate: "Present",
        isCurrent: true,
        description: "Architected and scaled distributed microservices, Kafka event streaming pipelines, and low-latency gRPC services supporting 45k+ RPS with 99.99% reliability."
      }
    ]
  },
  education: {
    degree: "Bachelor of Technology",
    fieldOfStudy: "Electronics and Communication Engineering",
    school: "Motilal Nehru National Institute Of Technology",
    graduationYear: "2020",
    gpa: "3.8",
    items: [
      {
        id: "edu-1",
        school: "Motilal Nehru National Institute Of Technology",
        degree: "Bachelor of Technology",
        fieldOfStudy: "Electronics and Communication Engineering",
        graduationYear: "2020",
        gpa: "3.8"
      }
    ]
  },
  presets: {
    workAuthorization: "Yes",
    workCountries: "All / Remote",
    requireSponsorship: "No",
    sponsorshipDetails: "Legally authorized to work without restrictions and will not require sponsorship now or in the future.",
    willingToRelocate: "Yes",
    workArrangement: "Remote or Hybrid",
    salaryExpectations: "Competitive / Negotiable",
    noticePeriod: "Immediately available",
    veteranStatus: "No, I am not a protected veteran",
    disabilityStatus: "No, I do not have a disability",
    gender: "Decline to state",
    race: "Decline to state"
  },
  // Dynamic Knowledge Store - Extensible, AI-Categorized & Nested
  dynamicFields: [
    {
      id: "df-edu-highest",
      category: "Education",
      canonicalKey: "education.highest",
      label: "Higher Education / Highest Degree",
      aliases: [
        "higher education",
        "highest degree",
        "highest level of education",
        "college",
        "university",
        "institute",
        "school name",
        "institution"
      ],
      value: "Motilal Nehru National Institute Of Technology",
      nestedDetails: {
        institution: "Motilal Nehru National Institute Of Technology",
        college: "Motilal Nehru National Institute Of Technology",
        degree: "Bachelor of Technology",
        major: "Electronics and Communication Engineering",
        fieldOfStudy: "Electronics and Communication Engineering",
        graduationYear: "2020",
        gpa: "3.8"
      },
      stats: { timesSuggested: 0, timesAccepted: 0, timesCorrected: 0, confidence: 1.0 }
    },
    {
      id: "df-exp-company",
      category: "Work History",
      canonicalKey: "experience.currentCompany",
      label: "Current / Recent Employer",
      aliases: ["current company", "recent employer", "company name", "organization", "employer"],
      value: "Uber",
      stats: { timesSuggested: 0, timesAccepted: 0, timesCorrected: 0, confidence: 1.0 }
    },
    {
      id: "df-exp-title",
      category: "Work History",
      canonicalKey: "experience.currentTitle",
      label: "Current / Recent Job Title",
      aliases: ["current title", "job title", "current role", "position", "designation"],
      value: "Software Engineer II",
      stats: { timesSuggested: 0, timesAccepted: 0, timesCorrected: 0, confidence: 1.0 }
    },
    {
      id: "df-exp-role-descriptions",
      category: "Work Experience",
      canonicalKey: "experience.role_descriptions",
      label: "Work Experience Role Descriptions",
      aliases: [
        "role description",
        "job description",
        "responsibilities",
        "description of duties",
        "work experience description",
        "summary of duties"
      ],
      value: "Architected and scaled distributed microservices, Kafka event streaming pipelines, and low-latency gRPC services supporting 45k+ RPS with 99.99% reliability.",
      nestedDetails: {
        "Work Experience 1": {
          company: "Uber",
          title: "Software Engineer II",
          roleDescription: "Architected and scaled distributed microservices, Kafka event streaming pipelines, and low-latency gRPC services supporting 45k+ RPS with 99.99% reliability.",
          sectionIndex: 0
        }
      },
      stats: { timesSuggested: 0, timesAccepted: 0, timesCorrected: 0, confidence: 1.0 }
    },
    {
      id: "df-emp-previous",
      category: "Company-Specific",
      canonicalKey: "employment.previous_employee_at_company",
      label: "Former Employee of Company",
      aliases: [
        "have you ever worked for",
        "have you ever worked at",
        "former employee of",
        "previously employed by",
        "worked at"
      ],
      value: "No",
      companyRules: {
        "Uber": "Yes",
        "Uber Technologies": "Yes",
        "default": "No"
      },
      stats: { timesSuggested: 0, timesAccepted: 0, timesCorrected: 0, confidence: 1.0 }
    },
    {
      id: "df-app-auth",
      category: "General Application",
      canonicalKey: "application.work_authorization",
      label: "Work Authorization / Right to Work",
      aliases: ["legally authorized to work", "right to work", "work authorization", "authorized to work in"],
      value: "Yes",
      stats: { timesSuggested: 0, timesAccepted: 0, timesCorrected: 0, confidence: 1.0 }
    },
    {
      id: "df-app-sponsorship",
      category: "General Application",
      canonicalKey: "application.sponsorship",
      label: "Visa Sponsorship Required",
      aliases: ["require sponsorship", "future sponsorship", "visa sponsorship", "need sponsorship"],
      value: "No",
      stats: { timesSuggested: 0, timesAccepted: 0, timesCorrected: 0, confidence: 1.0 }
    },
    {
      id: "df-app-notice",
      category: "General Application",
      canonicalKey: "application.notice_period",
      label: "Notice Period / Earliest Start Date",
      aliases: ["notice period", "availability", "earliest start date", "when can you start", "available to start"],
      value: "Immediately available",
      stats: { timesSuggested: 0, timesAccepted: 0, timesCorrected: 0, confidence: 1.0 }
    },
    {
      id: "df-link-portfolio",
      category: "Contact & Links",
      canonicalKey: "links.portfolio",
      label: "Portfolio Website",
      aliases: ["portfolio", "website", "personal website", "personal site", "portfolio link", "web link"],
      value: "https://pritamrauniyar.com.np/",
      stats: { timesSuggested: 0, timesAccepted: 0, timesCorrected: 0, confidence: 1.0 }
    },
    {
      id: "df-link-linkedin",
      category: "Contact & Links",
      canonicalKey: "links.linkedin",
      label: "LinkedIn Profile",
      aliases: ["linkedin", "linkedin profile", "linkedin url"],
      value: "https://linkedin.com/in/pritamrauniyar",
      stats: { timesSuggested: 0, timesAccepted: 0, timesCorrected: 0, confidence: 1.0 }
    },
    {
      id: "df-link-github",
      category: "Contact & Links",
      canonicalKey: "links.github",
      label: "GitHub Profile",
      aliases: ["github", "github profile", "github url"],
      value: "https://github.com/pritamrauniyar",
      stats: { timesSuggested: 0, timesAccepted: 0, timesCorrected: 0, confidence: 1.0 }
    }
  ],
  customFields: [
    {
      id: "cf-reason-leaving",
      label: "Reason for Leaving / Availability",
      value: "Impacted by organizational restructuring; immediately available for new roles.",
      keywords: ["reason for leaving", "why are you looking", "current situation", "layoff", "availability"]
    },
    {
      id: "cf-tech-challenge",
      label: "Greatest Technical Challenge / Achievement",
      value: "Architected and optimized a distributed event-driven processing microservice, reducing p99 tail latency by 35% and supporting high throughput with zero downtime.",
      keywords: ["technical challenge", "achievement", "difficult project", "proudest project", "distributed systems"]
    },
    {
      id: "cf-why-company",
      label: "Why Do You Want to Work Here?",
      value: "I am drawn by your engineering culture and focus on high-impact products. I want to bring my background, resilience design, and cross-team execution to accelerate your mission.",
      keywords: ["why do you want to work here", "why us", "interest in company", "why join"]
    }
  ],
  learnedMemory: [],
  ignoredOptionalFields: [],
  fieldInteractionStats: {},
  pendingSyncQueue: [],
  settings: {
    geminiApiKey: "",
    model: "gemini-3.6-flash",
    answerTone: "Technical & Impactful",
    autoFillEnabled: true,
    showFloatingBadge: true,
    autoSuggestForUnrecognized: true
  }
};

// 90% Fuzzy / Semantic String Matching Utility
function calculateStringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const s1 = String(str1).toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
  const s2 = String(str2).toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(s1.length, s2.length);
    const maxLen = Math.max(s1.length, s2.length);
    if (minLen / maxLen >= 0.7) return 0.95;
    return 0.9;
  }

  // Token-based Jaccard similarity for company and multi-word names
  const tokens1 = new Set(s1.split(/\s+/).filter(Boolean));
  const tokens2 = new Set(s2.split(/\s+/).filter(Boolean));
  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }
  const union = new Set([...tokens1, ...tokens2]).size;
  const jaccard = intersection / union;
  if (jaccard >= 0.75) return 0.92;

  // Levenshtein distance for word typos
  const len1 = s1.length;
  const len2 = s2.length;
  if (Math.abs(len1 - len2) > 3 && jaccard < 0.5) return jaccard;

  const dp = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0));
  for (let i = 0; i <= len1; i++) dp[i][0] = i;
  for (let j = 0; j <= len2; j++) dp[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  const distance = dp[len1][len2];
  const maxL = Math.max(len1, len2);
  const levScore = 1.0 - (distance / maxL);

  return Math.max(jaccard, levScore);
}

function is90PercentMatch(str1, str2) {
  return calculateStringSimilarity(str1, str2) >= 0.90;
}

let _mockProfileStore = null;

const StorageService = {
  // Load entire profile or defaults
  async getProfile() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get(['applypilot_profile'], (result) => {
          if (result && result.applypilot_profile) {
            const raw = result.applypilot_profile;
            // Merge with defaults in case of new schema keys
            const merged = {
              ...DEFAULT_PROFILE,
              ...raw,
              creator: { ...DEFAULT_PROFILE.creator, ...(raw.creator || {}) },
              personal: { ...DEFAULT_PROFILE.personal, ...(raw.personal || {}) },
              links: { ...DEFAULT_PROFILE.links, ...(raw.links || {}) },
              experience: { ...DEFAULT_PROFILE.experience, ...(raw.experience || {}) },
              education: { ...DEFAULT_PROFILE.education, ...(raw.education || {}) },
              presets: { ...DEFAULT_PROFILE.presets, ...(raw.presets || {}) },
              settings: { ...DEFAULT_PROFILE.settings, ...(raw.settings || {}) },
              dynamicFields: raw.dynamicFields && raw.dynamicFields.length ? raw.dynamicFields : DEFAULT_PROFILE.dynamicFields,
              customFields: raw.customFields || DEFAULT_PROFILE.customFields,
              learnedMemory: raw.learnedMemory || [],
              ignoredOptionalFields: raw.ignoredOptionalFields || [],
              fieldInteractionStats: raw.fieldInteractionStats || {},
              pendingSyncQueue: raw.pendingSyncQueue || []
            };

            // Ensure portfolio link is updated
            if (!merged.links.portfolio || merged.links.portfolio === "https://pritam.dev") {
              merged.links.portfolio = "https://pritamrauniyar.com.np/";
            }

            // Ensure sequential experience items exist
            const rawExp = raw.experience || {};
            if (Array.isArray(rawExp.items) && rawExp.items.length > 0) {
              merged.experience.items = rawExp.items;
            } else if (rawExp.currentCompany || rawExp.currentTitle) {
              merged.experience.items = [
                {
                  id: "exp-1",
                  title: rawExp.currentTitle || "",
                  company: rawExp.currentCompany || "",
                  location: rawExp.location || raw.personal?.location || "",
                  startDate: "",
                  endDate: "Present",
                  isCurrent: true,
                  description: rawExp.headline || ""
                }
              ];
            }

            // Ensure sequential education items exist
            const rawEdu = raw.education || {};
            if (Array.isArray(rawEdu.items) && rawEdu.items.length > 0) {
              merged.education.items = rawEdu.items;
            } else if (rawEdu.school || rawEdu.degree) {
              merged.education.items = [
                {
                  id: "edu-1",
                  school: rawEdu.school || "",
                  degree: rawEdu.degree || "",
                  fieldOfStudy: rawEdu.fieldOfStudy || "",
                  graduationYear: rawEdu.graduationYear || "",
                  gpa: rawEdu.gpa || ""
                }
              ];
            }

            // Auto-migrate any deprecated model
            if (merged.settings?.model && (merged.settings.model.includes('2.5') || merged.settings.model.includes('2.0') || merged.settings.model.includes('1.5'))) {
              merged.settings.model = 'gemini-3.6-flash';
              chrome.storage.local.set({ applypilot_profile: merged });
            }

            resolve(merged);
          } else {
            resolve(DEFAULT_PROFILE);
          }
        });
      });
    }

    // Node.js or testing fallback
    if (!_mockProfileStore) {
      _mockProfileStore = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
    }
    return JSON.parse(JSON.stringify(_mockProfileStore));
  },

  // Save profile
  async saveProfile(profile) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ applypilot_profile: profile }, () => {
          resolve(true);
        });
      });
    }

    _mockProfileStore = JSON.parse(JSON.stringify(profile));
    return true;
  },

  // Save a learned field to memory from the AI feedback loop
  async saveLearnedField(fieldData = {}) {
    const profile = await this.getProfile();
    const label = String(fieldData.fieldLabel || fieldData.label || "").trim();
    const existingIndex = (profile.learnedMemory || []).findIndex(
      m => m.fieldLabel.toLowerCase().trim() === label.toLowerCase()
    );

    const memoryItem = {
      id: "mem-" + Date.now(),
      fieldLabel: label,
      questionKeywords: fieldData.keywords || [label.toLowerCase()],
      answer: fieldData.answer !== undefined ? fieldData.answer : (fieldData.value || ""),
      fieldType: fieldData.fieldType || "text",
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      profile.learnedMemory[existingIndex] = memoryItem;
    } else {
      profile.learnedMemory = profile.learnedMemory || [];
      profile.learnedMemory.unshift(memoryItem);
    }

    // Keep learned memory capped to prevent excess storage
    if (profile.learnedMemory.length > 200) {
      profile.learnedMemory = profile.learnedMemory.slice(0, 200);
    }

    await this.saveProfile(profile);
    return memoryItem;
  },

  // Add custom field
  async addCustomField(field) {
    const profile = await this.getProfile();
    profile.customFields = profile.customFields || [];
    profile.customFields.push({
      id: "cf-" + Date.now(),
      label: field.label,
      value: field.value,
      keywords: field.keywords ? field.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean) : [field.label.toLowerCase()]
    });
    await this.saveProfile(profile);
    return profile.customFields;
  },

  // Delete custom field
  async deleteCustomField(id) {
    const profile = await this.getProfile();
    profile.customFields = (profile.customFields || []).filter(f => f.id !== id);
    await this.saveProfile(profile);
    return profile.customFields;
  },

  // Update Gemini API key
  async saveApiKey(apiKey) {
    const profile = await this.getProfile();
    profile.settings.geminiApiKey = apiKey.trim();
    await this.saveProfile(profile);
    return true;
  },

  // Add an optional field pattern to the ignore list
  async addIgnoredOptionalField(fieldInfo) {
    const profile = await this.getProfile();
    profile.ignoredOptionalFields = profile.ignoredOptionalFields || [];
    const label = (typeof fieldInfo === 'string' ? fieldInfo : (fieldInfo.label || fieldInfo.fieldLabel || fieldInfo.key || "")).trim();
    if (!label) return profile.ignoredOptionalFields;

    const exists = profile.ignoredOptionalFields.some(
      f => f.label.toLowerCase() === label.toLowerCase() || (f.pattern && f.pattern.toLowerCase() === label.toLowerCase())
    );

    if (!exists) {
      profile.ignoredOptionalFields.push({
        id: "ign-" + Date.now(),
        label: label,
        pattern: label.toLowerCase(),
        keywords: (fieldInfo.keywords && Array.isArray(fieldInfo.keywords)) ? fieldInfo.keywords : [label.toLowerCase()],
        ignoredAt: new Date().toISOString()
      });
      await this.saveProfile(profile);
    }
    return profile.ignoredOptionalFields;
  },

  // Remove an ignored field pattern
  async removeIgnoredOptionalField(idOrPattern) {
    const profile = await this.getProfile();
    const query = String(idOrPattern).toLowerCase().trim();
    profile.ignoredOptionalFields = (profile.ignoredOptionalFields || []).filter(
      f => f.id !== idOrPattern && f.label.toLowerCase() !== query && (f.pattern || '').toLowerCase() !== query
    );
    await this.saveProfile(profile);
    return profile.ignoredOptionalFields;
  },

  // Clear all ignored fields
  async clearIgnoredOptionalFields() {
    const profile = await this.getProfile();
    profile.ignoredOptionalFields = [];
    await this.saveProfile(profile);
    return profile.ignoredOptionalFields;
  },

  // Get all dynamic fields
  async getDynamicFields() {
    const profile = await this.getProfile();
    return profile.dynamicFields || [];
  },

  // Add a new dynamic field
  async addDynamicField(field) {
    const profile = await this.getProfile();
    profile.dynamicFields = profile.dynamicFields || [];
    const newField = {
      id: "df-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      category: field.category || "Custom / Learned",
      canonicalKey: field.canonicalKey || `custom.${Date.now()}`,
      label: field.label || "Custom Field",
      aliases: Array.isArray(field.aliases) ? field.aliases : (field.aliases ? String(field.aliases).split(',').map(a => a.trim().toLowerCase()).filter(Boolean) : [field.label.toLowerCase()]),
      value: field.value !== undefined ? String(field.value) : "",
      nestedDetails: field.nestedDetails || null,
      companyRules: field.companyRules || null,
      stats: field.stats || { timesSuggested: 0, timesAccepted: 0, timesCorrected: 0, confidence: 1.0 },
      createdAt: new Date().toISOString()
    };
    profile.dynamicFields.push(newField);
    await this.saveProfile(profile);
    return newField;
  },

  // Update dynamic field
  async updateDynamicField(id, updates) {
    const profile = await this.getProfile();
    profile.dynamicFields = profile.dynamicFields || [];
    const idx = profile.dynamicFields.findIndex(f => f.id === id);
    if (idx >= 0) {
      profile.dynamicFields[idx] = {
        ...profile.dynamicFields[idx],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      await this.saveProfile(profile);
      return profile.dynamicFields[idx];
    }
    return null;
  },

  // Delete dynamic field
  async deleteDynamicField(id) {
    const profile = await this.getProfile();
    profile.dynamicFields = (profile.dynamicFields || []).filter(f => f.id !== id);
    await this.saveProfile(profile);
    return profile.dynamicFields;
  },

  // Record field interaction (filled vs skipped count for predictive feedback)
  async recordFieldInteraction(fieldLabel, { filled = false, value = "", isRequired = false } = {}) {
    const profile = await this.getProfile();
    profile.fieldInteractionStats = profile.fieldInteractionStats || {};
    const cleanKey = String(fieldLabel).toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    if (!cleanKey) return;

    const existing = profile.fieldInteractionStats[cleanKey] || {
      label: fieldLabel,
      encounters: 0,
      filledCount: 0,
      skippedCount: 0,
      lastValue: "",
      isRequired: !!isRequired,
      predictedIgnored: false,
      confidence: 0
    };

    existing.encounters++;
    if (filled) {
      existing.filledCount++;
      if (value) existing.lastValue = String(value).slice(0, 100);
      existing.predictedIgnored = false;
    } else {
      existing.skippedCount++;
      // If an optional field is skipped >= 2 times and never filled, predict as ignored
      if (!isRequired && existing.skippedCount >= 2 && existing.filledCount === 0) {
        existing.predictedIgnored = true;
        existing.confidence = Math.min(0.99, 0.5 + (existing.skippedCount * 0.15));
      }
    }

    profile.fieldInteractionStats[cleanKey] = existing;
    await this.saveProfile(profile);
    return existing;
  },

  // Queue an item to the pending background sync queue for Gemini refinement
  async queuePendingSync(item) {
    const profile = await this.getProfile();
    profile.pendingSyncQueue = profile.pendingSyncQueue || [];
    const queueItem = {
      id: "sync-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      status: "pending",
      ...item
    };
    profile.pendingSyncQueue.push(queueItem);
    // Limit queue size to avoid bloat
    if (profile.pendingSyncQueue.length > 50) {
      profile.pendingSyncQueue = profile.pendingSyncQueue.slice(-50);
    }
    await this.saveProfile(profile);
    return queueItem;
  },

  // Get pending queue items
  async getPendingSyncQueue() {
    const profile = await this.getProfile();
    return profile.pendingSyncQueue || [];
  },

  // Clear pending queue items
  async clearPendingSyncQueue() {
    const profile = await this.getProfile();
    profile.pendingSyncQueue = [];
    await this.saveProfile(profile);
    return true;
  },

  // Handle when user completely clears an autofilled field on an application form
  async handleUserClearedField({ fieldLabel = "", fieldKey = "", fieldNameOrId = "", parentScope = "", childKey = "", sectionIndex = 0 } = {}) {
    const profile = await this.getProfile();
    const cleanLabel = String(fieldLabel || "").toLowerCase().trim();
    const cleanKey = String(childKey || fieldKey || "").toLowerCase().trim();
    const cleanId = String(fieldNameOrId || "").toLowerCase().trim();
    const cleanScope = String(parentScope || "").trim();

    // 1. If it's Middle Name
    if (cleanKey === "middlename" || cleanLabel.includes("middle name") || cleanLabel.includes("middle initial") || cleanId.includes("middlename")) {
      profile.personal = profile.personal || {};
      profile.personal.middleName = "";
      if (profile.personal.fullName && profile.personal.firstName && profile.personal.lastName) {
        profile.personal.fullName = `${profile.personal.firstName} ${profile.personal.lastName}`.trim();
      }
    }

    // 2. Clear from specific parent scope in dynamicFields
    if (cleanScope && profile.dynamicFields) {
      for (const df of profile.dynamicFields) {
        if (df.nestedDetails && typeof df.nestedDetails === "object") {
          // If nestedDetails has parentScope as key
          if (df.nestedDetails[cleanScope] && typeof df.nestedDetails[cleanScope] === "object") {
            for (const k of Object.keys(df.nestedDetails[cleanScope])) {
              if (k.toLowerCase() === cleanKey) {
                df.nestedDetails[cleanScope][k] = "";
              }
            }
          }
          // If this df IS the parentScope container
          if (df.label === cleanScope || (df.canonicalKey && df.canonicalKey.includes(cleanScope.toLowerCase().replace(/[^a-z0-9]/g, '_')))) {
            for (const k of Object.keys(df.nestedDetails)) {
              if (k.toLowerCase() === cleanKey) {
                df.nestedDetails[k] = "";
              }
            }
          }
        }
      }
    }

    // 3. Clear sequential item if in experience or education
    if (cleanScope.toLowerCase().startsWith("work experience") || cleanScope.toLowerCase().startsWith("experience") || cleanLabel.includes("role description") || cleanLabel.includes("responsibilities") || cleanKey === "roledescription" || cleanKey === "description") {
      if (profile.experience?.items && profile.experience.items[sectionIndex]) {
        if (cleanKey === "roledescription" || cleanKey === "description" || cleanLabel.includes("description") || cleanLabel.includes("responsibilities")) {
          profile.experience.items[sectionIndex].description = "";
        } else {
          for (const k of Object.keys(profile.experience.items[sectionIndex])) {
            if (k.toLowerCase() === cleanKey) profile.experience.items[sectionIndex][k] = "";
          }
        }
      }
      if (profile.dynamicFields) {
        const dfIdx = profile.dynamicFields.findIndex(f => f.canonicalKey === "experience.role_descriptions");
        if (dfIdx >= 0 && profile.dynamicFields[dfIdx].nestedDetails) {
          const expKey = cleanScope || `Work Experience ${sectionIndex + 1}`;
          if (profile.dynamicFields[dfIdx].nestedDetails[expKey]) {
            profile.dynamicFields[dfIdx].nestedDetails[expKey].roleDescription = "";
          }
        }
      }
    } else if (cleanScope.toLowerCase().startsWith("education") || cleanLabel.includes("school") || cleanLabel.includes("degree")) {
      if (profile.education?.items && profile.education.items[sectionIndex]) {
        for (const k of Object.keys(profile.education.items[sectionIndex])) {
          if (k.toLowerCase() === cleanKey) profile.education.items[sectionIndex][k] = "";
        }
      }
    }

    // 4. Standard personal, links, presets fields (if not inside repeating experience/education)
    if (!cleanScope || cleanScope === "Personal Information") {
      for (const cat of ["personal", "links", "experience", "education", "presets"]) {
        if (profile[cat] && typeof profile[cat] === "object") {
          for (const k of Object.keys(profile[cat])) {
            if (k.toLowerCase() === cleanKey) profile[cat][k] = "";
          }
        }
      }
    }

    // 5. Remove or clear from learnedMemory
    if (profile.learnedMemory && profile.learnedMemory.length) {
      profile.learnedMemory = profile.learnedMemory.filter(item => {
        if (!item) return false;
        const itemLbl = (item.fieldLabel || "").toLowerCase().trim();
        return itemLbl !== cleanLabel;
      });
    }

    // 6. Update fieldInteractionStats
    const statKey = (cleanScope ? `${cleanScope}_` : '') + (cleanLabel.replace(/[^a-z0-9]/g, '_') || cleanKey || cleanId);
    if (statKey) {
      profile.fieldInteractionStats = profile.fieldInteractionStats || {};
      const existing = profile.fieldInteractionStats[statKey] || {
        label: fieldLabel || cleanKey,
        parentScope: cleanScope,
        encounters: 0,
        filledCount: 0,
        skippedCount: 0,
        lastValue: "",
        isRequired: false,
        predictedIgnored: false,
        confidence: 0
      };
      existing.encounters++;
      existing.skippedCount++;
      existing.lastValue = "";
      if (!existing.isRequired) {
        existing.predictedIgnored = true;
        existing.confidence = Math.max(existing.confidence || 0, 0.85);
      }
      profile.fieldInteractionStats[statKey] = existing;
    }

    await this.saveProfile(profile);
    return { success: true, profile };
  },

  // Universal Nested Field Saver (Parent Key + Child Key)
  async saveNestedField({ parentScope = "", childKey = "", value = "", category = "", sectionIndex = 0, metadata = {} } = {}) {
    const profile = await this.getProfile();
    const cleanScope = String(parentScope || "General").trim();
    const cleanKey = String(childKey || "").trim();
    const cleanVal = String(value || "").trim();

    // 1. If it maps to Work Experience
    if (category === "experience" || cleanScope.toLowerCase().startsWith("work experience") || cleanScope.toLowerCase().startsWith("experience")) {
      profile.experience = profile.experience || { items: [] };
      profile.experience.items = profile.experience.items || [];
      while (profile.experience.items.length <= sectionIndex) {
        profile.experience.items.push({
          id: `exp-${Date.now()}-${profile.experience.items.length}`,
          title: "", company: "", location: "", startDate: "", endDate: "", isCurrent: profile.experience.items.length === 0, description: ""
        });
      }
      const item = profile.experience.items[sectionIndex];
      if (cleanKey === "roleDescription" || cleanKey === "description") item.description = cleanVal;
      else if (cleanKey === "company" || cleanKey === "currentCompany") item.company = cleanVal;
      else if (cleanKey === "title" || cleanKey === "currentTitle") item.title = cleanVal;
      else if (cleanKey === "location" || cleanKey === "jobLocation") item.location = cleanVal;
      else if (cleanKey === "startDate" || cleanKey === "fromDate") item.startDate = cleanVal;
      else if (cleanKey === "endDate" || cleanKey === "toDate") item.endDate = cleanVal;
      else item[cleanKey] = cleanVal;
    }

    // 2. If it maps to Education
    else if (category === "education" || cleanScope.toLowerCase().startsWith("education")) {
      profile.education = profile.education || { items: [] };
      profile.education.items = profile.education.items || [];
      while (profile.education.items.length <= sectionIndex) {
        profile.education.items.push({
          id: `edu-${Date.now()}-${profile.education.items.length}`,
          school: "", degree: "", fieldOfStudy: "", graduationYear: "", gpa: ""
        });
      }
      const item = profile.education.items[sectionIndex];
      if (cleanKey === "school" || cleanKey === "institution") item.school = cleanVal;
      else if (cleanKey === "degree") item.degree = cleanVal;
      else if (cleanKey === "fieldOfStudy" || cleanKey === "major") item.fieldOfStudy = cleanVal;
      else if (cleanKey === "graduationYear") item.graduationYear = cleanVal;
      else if (cleanKey === "gpa") item.gpa = cleanVal;
      else item[cleanKey] = cleanVal;
    }

    // 3. If it maps to Personal Information
    else if (category === "personal" || cleanScope.toLowerCase().includes("personal")) {
      profile.personal = profile.personal || {};
      if (cleanKey === "middleName" || cleanKey === "middlename") {
        profile.personal.middleName = cleanVal;
        if (profile.personal.firstName && profile.personal.lastName) {
          profile.personal.fullName = cleanVal
            ? `${profile.personal.firstName} ${cleanVal} ${profile.personal.lastName}`.trim()
            : `${profile.personal.firstName} ${profile.personal.lastName}`.trim();
        }
      } else if (cleanKey in profile.personal) {
        profile.personal[cleanKey] = cleanVal;
      }
    }

    // 4. Always synchronize into Dynamic Knowledge Store under parentScope -> nestedDetails
    profile.dynamicFields = profile.dynamicFields || [];
    const dfCanonicalKey = `nested.${cleanScope.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    let df = profile.dynamicFields.find(f => f.canonicalKey === dfCanonicalKey || f.label === cleanScope);
    if (!df) {
      df = {
        id: "df-scope-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        category: category || "Section Details",
        canonicalKey: dfCanonicalKey,
        label: cleanScope,
        aliases: [cleanScope.toLowerCase(), `${cleanScope.toLowerCase()} ${cleanKey.toLowerCase()}`],
        value: cleanVal,
        nestedDetails: {},
        stats: { timesSuggested: 0, timesAccepted: 0, timesCorrected: 0, confidence: 1.0 }
      };
      profile.dynamicFields.push(df);
    }

    df.nestedDetails = df.nestedDetails || {};
    df.nestedDetails[cleanKey] = cleanVal;
    if (metadata && Object.keys(metadata).length > 0) {
      df.nestedDetails[`${cleanKey}_meta`] = metadata;
    }

    // Also update experience.role_descriptions if this is a role description
    if (cleanKey === "roleDescription" || cleanKey === "description") {
      let roleDf = profile.dynamicFields.find(f => f.canonicalKey === "experience.role_descriptions");
      if (roleDf) {
        roleDf.nestedDetails = roleDf.nestedDetails || {};
        roleDf.nestedDetails[cleanScope] = {
          ...(roleDf.nestedDetails[cleanScope] || {}),
          roleDescription: cleanVal,
          sectionIndex
        };
      }
    }

    await this.saveProfile(profile);
    return { success: true, profile, nestedDetails: df.nestedDetails };
  },

  // Save or update a specific Work Experience role description in nested structure
  async saveWorkExperienceRoleDescription({ sectionIndex = 0, roleDescription = "", company = "", title = "" } = {}) {
    const expKey = `Work Experience ${sectionIndex + 1}`;
    return await this.saveNestedField({
      parentScope: expKey,
      childKey: "roleDescription",
      value: roleDescription,
      category: "experience",
      sectionIndex,
      metadata: { company, title }
    });
  }
};

if (typeof window !== 'undefined') {
  window.calculateStringSimilarity = calculateStringSimilarity;
  window.is90PercentMatch = is90PercentMatch;
  window.isNinetyPercentMatch = is90PercentMatch;
}
if (typeof globalThis !== 'undefined') {
  globalThis.calculateStringSimilarity = calculateStringSimilarity;
  globalThis.is90PercentMatch = is90PercentMatch;
  globalThis.isNinetyPercentMatch = is90PercentMatch;
}
if (typeof module !== 'undefined') {
  module.exports = {
    StorageService,
    DEFAULT_PROFILE,
    calculateStringSimilarity,
    is90PercentMatch,
    isNinetyPercentMatch: is90PercentMatch
  };
}
