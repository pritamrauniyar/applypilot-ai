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
    noticePeriod: "Immediately available",
    earliestStartDate: "Immediate",
    headline: "Software Engineer II with 4+ years building high-throughput distributed microservices, APIs, and scalable backend platforms.",
    skills: "Go, Java, Python, Microservices, Distributed Systems, Kafka, Docker, Kubernetes, gRPC, PostgreSQL, Redis, AWS"
  },
  education: {
    degree: "Bachelor of Science",
    fieldOfStudy: "Computer Science",
    school: "University of California",
    graduationYear: "2020",
    gpa: "3.8"
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
            learnedMemory: result.applypilot_profile.learnedMemory || []
          };

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
  }
};

if (typeof module !== 'undefined') {
  module.exports = { StorageService, DEFAULT_PROFILE };
}
