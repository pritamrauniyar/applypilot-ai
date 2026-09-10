// ApplyPilot AI - Local Storage & Data Management Module
// All data is stored locally in chrome.storage.local (Zero external servers, 100% private)

const DEFAULT_PROFILE = {
  personal: {
    firstName: "Pritam",
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
    portfolio: "https://pritam.dev",
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
    degree: "Bachelor of Science",
    fieldOfStudy: "Computer Science",
    school: "University of California",
    graduationYear: "2020",
    gpa: "3.8",
    items: [
      {
        id: "edu-1",
        school: "University of California",
        degree: "Bachelor of Science",
        fieldOfStudy: "Computer Science",
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
  settings: {
    geminiApiKey: "",
    model: "gemini-3.6-flash",
    answerTone: "Technical & Impactful",
    autoFillEnabled: true,
    showFloatingBadge: true,
    autoSuggestForUnrecognized: true
  }
};

const StorageService = {
  // Load entire profile or defaults
  async getProfile() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['applypilot_profile'], (result) => {
        if (result && result.applypilot_profile) {
          // Merge with defaults in case of new schema keys
          const merged = {
            ...DEFAULT_PROFILE,
            ...result.applypilot_profile,
            personal: { ...DEFAULT_PROFILE.personal, ...(result.applypilot_profile.personal || {}) },
            links: { ...DEFAULT_PROFILE.links, ...(result.applypilot_profile.links || {}) },
            experience: { ...DEFAULT_PROFILE.experience, ...(result.applypilot_profile.experience || {}) },
            education: { ...DEFAULT_PROFILE.education, ...(result.applypilot_profile.education || {}) },
            presets: { ...DEFAULT_PROFILE.presets, ...(result.applypilot_profile.presets || {}) },
            settings: { ...DEFAULT_PROFILE.settings, ...(result.applypilot_profile.settings || {}) },
            customFields: result.applypilot_profile.customFields || DEFAULT_PROFILE.customFields,
            learnedMemory: result.applypilot_profile.learnedMemory || [],
            ignoredOptionalFields: result.applypilot_profile.ignoredOptionalFields || []
          };

          // Ensure sequential experience items exist
          const rawExp = result.applypilot_profile.experience || {};
          if (Array.isArray(rawExp.items) && rawExp.items.length > 0) {
            merged.experience.items = rawExp.items;
          } else if (rawExp.currentCompany || rawExp.currentTitle) {
            merged.experience.items = [
              {
                id: "exp-1",
                title: rawExp.currentTitle || "",
                company: rawExp.currentCompany || "",
                location: rawExp.location || result.applypilot_profile.personal?.location || "",
                startDate: "",
                endDate: "Present",
                isCurrent: true,
                description: rawExp.headline || ""
              }
            ];
          }

          // Ensure sequential education items exist
          const rawEdu = result.applypilot_profile.education || {};
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

          // Auto-migrate any deprecated model (2.5, 2.0, 1.5) directly to gemini-3.6-flash
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
  },

  // Save profile
  async saveProfile(profile) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ applypilot_profile: profile }, () => {
        resolve(true);
      });
    });
  },

  // Save a learned field to memory from the AI feedback loop
  async saveLearnedField(fieldData) {
    const profile = await this.getProfile();
    const existingIndex = (profile.learnedMemory || []).findIndex(
      m => m.fieldLabel.toLowerCase().trim() === fieldData.fieldLabel.toLowerCase().trim()
    );

    const memoryItem = {
      id: "mem-" + Date.now(),
      fieldLabel: fieldData.fieldLabel,
      questionKeywords: fieldData.keywords || [fieldData.fieldLabel.toLowerCase().trim()],
      answer: fieldData.answer,
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
  }
};

if (typeof module !== 'undefined') {
  module.exports = { StorageService, DEFAULT_PROFILE };
}
