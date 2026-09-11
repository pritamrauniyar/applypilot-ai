// ApplyPilot AI - Gemini Free-Tier Client Service
// Resilient multi-model discovery, v1/v1beta cross-version support, and dynamic ModelService inspection.

const GeminiService = {
  CANDIDATE_MODELS: [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.7-flash"
  ],

  cachedWorkingModel: null,

  // Test the API key and return exact available models or diagnostic error
  async testApiKey(apiKey) {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, error: "Please enter an API key to test." };
    }

    const trimmedKey = apiKey.trim();
    const results = [];

    for (const apiVer of ["v1beta", "v1"]) {
      try {
        const url = `https://generativelanguage.googleapis.com/${apiVer}/models?key=${trimmedKey}`;
        const res = await fetch(url);
        const data = await res.json();

        if (res.ok && data.models) {
          const genModels = data.models
            .filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
            .map(m => m.name.replace(/^models\//, ''))
            .filter(m => !m.includes("2.5") && !m.includes("2.0") && !m.includes("1.5"));

          const preferred = genModels.find(m => m.includes("3.6-flash")) || 
                          genModels.find(m => m.includes("3.5-flash")) || 
                          genModels.find(m => m.includes("flash")) || 
                          genModels[0] || "gemini-3.6-flash";

          return {
            success: true,
            apiVersion: apiVer,
            models: genModels,
            selectedModel: preferred,
            message: `Connected successfully on ${apiVer}! Found ${genModels.length} modern models. (Active: ${preferred})`
          };
        } else if (data.error) {
          results.push(`${apiVer}: ${data.error.message}`);
        }
      } catch (e) {
        results.push(`${apiVer}: ${e.message}`);
      }
    }

    return {
      success: false,
      error: results.join(" | ") || "Could not connect to Google Generative Language API."
    };
  },

  // Dynamically discover supported models for this specific API key
  async getSupportedModel(apiKey) {
    if (this.cachedWorkingModel && !this.cachedWorkingModel.model.includes("2.5") && !this.cachedWorkingModel.model.includes("2.0") && !this.cachedWorkingModel.model.includes("1.5")) {
      return this.cachedWorkingModel;
    }

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.models && data.models.length > 0) {
          const available = data.models
            .filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
            .map(m => m.name.replace(/^models\//, ''))
            .filter(m => !m.includes("2.5") && !m.includes("2.0") && !m.includes("1.5"));

          console.log(`[ApplyPilot AI] Discovered modern models on v1beta:`, available);

          // Priority 1: gemini-3.6-flash
          if (available.includes("gemini-3.6-flash")) {
            this.cachedWorkingModel = { model: "gemini-3.6-flash", apiVersion: "v1beta" };
            console.log(`[ApplyPilot AI] Selected verified model: gemini-3.6-flash (v1beta)`);
            return this.cachedWorkingModel;
          }

          // Priority 2: candidate models
          for (const candidate of this.CANDIDATE_MODELS) {
            if (available.includes(candidate)) {
              this.cachedWorkingModel = { model: candidate, apiVersion: "v1beta" };
              console.log(`[ApplyPilot AI] Selected verified model: ${candidate} (v1beta)`);
              return this.cachedWorkingModel;
            }
          }

          // Priority 3: any modern flash model
          const anyFlash = available.find(n => n.includes("flash"));
          if (anyFlash) {
            this.cachedWorkingModel = { model: anyFlash, apiVersion: "v1beta" };
            return this.cachedWorkingModel;
          }
        }
      }
    } catch (e) {
      console.warn("[ApplyPilot AI] ListModels inspection warning:", e.message);
    }

    return { model: "gemini-3.6-flash", apiVersion: "v1beta" };
  },

  // Send request with direct, validated model call (no blind hit-and-trial cycling)
  async requestWithFallback(payload, apiKey, preferredModel = null) {
    if (!apiKey || !apiKey.trim()) {
      throw new Error("Missing Gemini API Key. Please add your free key in ApplyPilot Settings (get one at https://aistudio.google.com/).");
    }

    let targetModel = preferredModel;
    if (!targetModel || targetModel.includes("2.5") || targetModel.includes("2.0") || targetModel.includes("1.5")) {
      targetModel = "gemini-3.6-flash";
    }

    // Priority 1: explicitly selected model
    const attempts = [
      { model: targetModel, apiVersion: "v1beta" },
      { model: "gemini-3.6-flash", apiVersion: "v1beta" },
      { model: "gemini-3.5-flash", apiVersion: "v1beta" }
    ];

    const seen = new Set();
    const uniqueAttempts = [];
    for (const a of attempts) {
      if (!a || !a.model) continue;
      const key = `${a.apiVersion}/${a.model}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueAttempts.push(a);
      }
    }

    let lastError = null;

    for (const { model, apiVersion } of uniqueAttempts) {
      const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey.trim()}`;

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          this.cachedWorkingModel = { model, apiVersion };
          return await response.json();
        }

        const errJson = await response.json().catch(() => ({}));
        const msg = errJson.error?.message || `HTTP ${response.status}: ${response.statusText}`;

        // 1. Fast-fail on auth errors
        if (response.status === 400 && (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid"))) {
          throw new Error("Invalid Gemini API Key. Please verify your key from Google AI Studio.");
        }
        if (response.status === 403) {
          throw new Error(`Google API Permission Error: ${msg}. (Make sure Generative Language API is enabled in your Google Cloud Project).`);
        }
        if (response.status === 429) {
          throw new Error("Gemini Free Tier rate limit hit. Please wait a moment and retry.");
        }

        // 2. Modality / input type error: do NOT cycle through other models!
        if (msg.includes("not supported for generateContent") && (msg.includes("mimeType") || msg.includes("modality") || msg.includes("inlineData") || msg.includes("application/pdf"))) {
          throw new Error(`Gemini API does not support binary PDF inline data for generateContent: ${msg}. Please use the text resume tab.`);
        }

        // 3. If model 404, try next in verified list
        if (response.status === 404 || msg.includes("not found")) {
          console.warn(`[ApplyPilot AI] ${apiVersion}/models/${model} returned 404. Checking next modern model...`);
          lastError = new Error(msg);
          continue;
        }

        throw new Error(`Gemini API error (${apiVersion}/${model}): ${msg}`);
      } catch (err) {
        if (err.message.includes("Invalid Gemini API Key") || err.message.includes("Google API Permission Error") || err.message.includes("rate limit") || err.message.includes("binary PDF inline data")) {
          throw err;
        }
        lastError = err;
      }
    }

    throw lastError || new Error("Could not connect to Gemini API. Please verify your API key.");
  },

  // Call Gemini API for text generation
  async generate(prompt, apiKey, systemInstruction = "", preferredModel = null, configOverrides = {}) {
    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 4096,
        ...configOverrides
      }
    };

    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const data = await this.requestWithFallback(payload, apiKey, preferredModel);
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return candidate.trim();
  },

  // Parse raw resume text into structured candidate profile JSON
  async parseResumeText(resumeText, apiKey, preferredModel = null) {
    const systemPrompt = `You are an expert technical resume parser for career applications across all industries.
Extract candidate information from the provided resume text into clean, strict JSON format with NO markdown wrapping, NO backticks.

CRITICAL INSTRUCTIONS FOR WORK EXPERIENCE:
- Extract ALL work experience roles from the resume into the "experience.items" array in exact sequence (most recent role first, down to earliest role).
- Do NOT skip any past jobs, previous companies, or internships. Every single position on the resume must be included as an entry in "experience.items".
- For each role, extract: "company", "title", "location", "startDate", "endDate", "isCurrent" (true if currently working there), and "description" (bullet points or summary of responsibilities & key achievements).
- Set "currentCompany" and "currentTitle" to the most recent role from "experience.items[0]".

JSON schema must strictly match:
{
  "personal": {
    "firstName": string,
    "lastName": string,
    "fullName": string,
    "email": string,
    "phone": string,
    "location": string,
    "city": string,
    "state": string,
    "postalCode": string,
    "country": string,
    "address": string
  },
  "links": {
    "linkedin": string,
    "github": string,
    "portfolio": string
  },
  "experience": {
    "currentCompany": string,
    "currentTitle": string,
    "yearsOfExperience": string,
    "headline": string,
    "skills": string,
    "items": [
      {
        "company": string,
        "title": string,
        "location": string,
        "startDate": string,
        "endDate": string,
        "isCurrent": boolean,
        "description": string
      }
    ]
  },
  "education": {
    "degree": string,
    "fieldOfStudy": string,
    "school": string,
    "graduationYear": string,
    "gpa": string,
    "items": [
      {
        "school": string,
        "degree": string,
        "fieldOfStudy": string,
        "graduationYear": string,
        "gpa": string
      }
    ]
  },
  "suggestedCustomFields": [
    {
      "label": string,
      "value": string,
      "keywords": [string]
    }
  ]
}`;

    const userPrompt = `Parse this resume text into the JSON format:\n\n${resumeText.slice(0, 18000)}`;
    const rawResult = await this.generate(userPrompt, apiKey, systemPrompt, preferredModel, {
      maxOutputTokens: 4096,
      responseMimeType: "application/json"
    });

    const parsed = this.parseAndRepairJson(rawResult);

    // Normalize experience items
    if (parsed && parsed.experience) {
      if (!Array.isArray(parsed.experience.items)) {
        parsed.experience.items = [];
      }
      parsed.experience.items = parsed.experience.items.map((it, idx) => ({
        id: it.id || `exp-${Date.now()}-${idx}`,
        title: it.title || it.jobTitle || "",
        company: it.company || it.companyName || "",
        location: it.location || "",
        startDate: it.startDate || it.from || "",
        endDate: it.endDate || it.to || (it.isCurrent ? "Present" : ""),
        isCurrent: it.isCurrent !== undefined ? Boolean(it.isCurrent) : (it.endDate ? it.endDate.toLowerCase().includes("present") : false),
        description: it.description || it.summary || ""
      }));

      if (parsed.experience.items.length > 0) {
        if (!parsed.experience.currentCompany) parsed.experience.currentCompany = parsed.experience.items[0].company;
        if (!parsed.experience.currentTitle) parsed.experience.currentTitle = parsed.experience.items[0].title;
        if (!parsed.experience.headline) parsed.experience.headline = parsed.experience.items[0].description;
      }
    }

    // Normalize education items
    if (parsed && parsed.education) {
      if (!Array.isArray(parsed.education.items)) {
        parsed.education.items = [];
      }
      parsed.education.items = parsed.education.items.map((it, idx) => ({
        id: it.id || `edu-${Date.now()}-${idx}`,
        school: it.school || "",
        degree: it.degree || "",
        fieldOfStudy: it.fieldOfStudy || it.major || "",
        graduationYear: it.graduationYear || it.year || "",
        gpa: it.gpa || ""
      }));

      if (parsed.education.items.length > 0) {
        if (!parsed.education.school) parsed.education.school = parsed.education.items[0].school;
        if (!parsed.education.degree) parsed.education.degree = parsed.education.items[0].degree;
        if (!parsed.education.fieldOfStudy) parsed.education.fieldOfStudy = parsed.education.items[0].fieldOfStudy;
        if (!parsed.education.graduationYear) parsed.education.graduationYear = parsed.education.items[0].graduationYear;
        if (!parsed.education.gpa) parsed.education.gpa = parsed.education.items[0].gpa;
      }
    }

    return parsed;
  },

  // Resilient JSON parser and repair engine
  parseAndRepairJson(rawResult) {
    let cleaned = (rawResult || "")
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // 1. Direct JSON parse
    try {
      return JSON.parse(cleaned);
    } catch (e1) {
      console.warn("[ApplyPilot AI] Initial JSON parse failed, attempting intelligent repair...", e1.message);
    }

    // 2. Intelligent JSON repair for truncated strings
    try {
      let repaired = cleaned;
      repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/, '');
      repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*$/, '');
      repaired = repaired.replace(/,\s*"[^"]*"?\s*$/, '');
      repaired = repaired.replace(/,\s*$/, '');

      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      let escape = false;

      for (let i = 0; i < repaired.length; i++) {
        const c = repaired[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (c === '\\') {
          escape = true;
          continue;
        }
        if (c === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (c === '{') openBraces++;
          else if (c === '}') openBraces--;
          else if (c === '[') openBrackets++;
          else if (c === ']') openBrackets--;
        }
      }

      if (inString) repaired += '"';
      while (openBrackets > 0) { repaired += ']'; openBrackets--; }
      while (openBraces > 0) { repaired += '}'; openBraces--; }

      return JSON.parse(repaired);
    } catch (e2) {
      console.warn("[ApplyPilot AI] Syntax repair failed, attempting regex extraction...", e2.message);
    }

    // 3. Fallback: extract personal block using regex
    try {
      const personalMatch = cleaned.match(/"personal"\s*:\s*\{([^}]+)\}/);
      const personal = {};
      if (personalMatch) {
        const fields = ["firstName", "lastName", "fullName", "email", "phone", "location", "city", "country"];
        for (const f of fields) {
          const m = personalMatch[1].match(new RegExp(`"${f}"\\s*:\\s*"([^"]+)"`));
          if (m) personal[f] = m[1];
        }
      }

      if (personal.firstName || personal.fullName || personal.email) {
        return {
          personal,
          links: {},
          experience: {},
          education: {},
          suggestedCustomFields: []
        };
      }
    } catch (e3) {}

    throw new Error("Could not parse resume data into JSON. Please verify the resume text and try again.");
  },

  // Parse resume directly from a PDF/DOC base64 file via Gemini
  async parseResumeFile(base64Data, mimeType, apiKey, preferredModel = null) {
    let resolvedMime = mimeType;
    if (!resolvedMime || resolvedMime === "application/octet-stream") {
      resolvedMime = "application/pdf";
    }

    // 1. If PDF document, extract text directly (available in background worker or browser window)
    const extractor = (typeof self !== 'undefined' && self.PdfExtractor) || 
                      (typeof window !== 'undefined' && window.PdfExtractor);

    if (resolvedMime === "application/pdf" && extractor && base64Data) {
      try {
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const fileObj = {
          name: "resume.pdf",
          type: "application/pdf",
          arrayBuffer: async () => bytes.buffer
        };
        const extractedText = await extractor.extractText(fileObj);
        if (extractedText && extractedText.length > 25) {
          console.log(`[ApplyPilot AI] Extracted ${extractedText.length} chars from PDF. Parsing via text engine (${preferredModel || 'gemini-3.6-flash'})...`);
          return await this.parseResumeText(extractedText, apiKey, preferredModel);
        }
      } catch (extractErr) {
        console.warn("[ApplyPilot AI] Background PDF text extraction warning:", extractErr);
      }
    }

    // 2. If it's an image file (PNG/JPEG), Gemini multimodal supports it directly
    if (resolvedMime.startsWith("image/")) {
      const systemPrompt = `You are an expert technical resume parser for software engineering applications.
Extract candidate information from the provided resume image into clean, strict JSON format with NO markdown wrapping, NO backticks.
JSON schema must strictly match:
{
  "personal": { "firstName": string, "lastName": string, "fullName": string, "email": string, "phone": string, "location": string, "city": string, "state": string, "postalCode": string, "country": string, "address": string },
  "links": { "linkedin": string, "github": string, "portfolio": string },
  "experience": { "currentCompany": string, "currentTitle": string, "yearsOfExperience": string, "headline": string, "skills": string },
  "education": { "degree": string, "fieldOfStudy": string, "school": string, "graduationYear": string, "gpa": string },
  "suggestedCustomFields": [{ "label": string, "value": string, "keywords": [string] }]
}`;

      const payload = {
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: resolvedMime, data: base64Data } },
            { text: "Extract candidate information from this resume image into the specified JSON format." }
          ]
        }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" }
      };

      const data = await this.requestWithFallback(payload, apiKey, preferredModel);
      const rawResult = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return this.parseAndRepairJson(rawResult);
    }

    // 3. If it's a PDF where text extraction found no text (e.g. scanned image PDF)
    throw new Error("No readable text found in this PDF (it may be a scanned raster image or encrypted). Please open the 'Paste Resume Text' tab and paste your resume text directly.");
  },

  // Generate customized, professional answers for open-ended essay questions
  async answerOpenEndedQuestion({ question, jobTitle = "", companyName = "", userProfile, tone = "Professional & Impactful", apiKey }) {
    const candidateRole = userProfile.experience?.currentTitle || "Professional";
    const candidateCompany = userProfile.experience?.currentCompany || "";
    const candidateContext = `
Candidate Name: ${userProfile.personal?.fullName || "Candidate"}
Current / Recent Role: ${candidateRole}
Current / Recent Employer: ${candidateCompany || "Not specified"}
Target Job: ${jobTitle || candidateRole} ${companyName ? `at ${companyName}` : ""}
Experience Summary: ${userProfile.experience?.headline || userProfile.experience?.skills || ""}
Key Skills: ${userProfile.experience?.skills || ""}
Education: ${userProfile.education?.degree || ""} ${userProfile.education?.fieldOfStudy ? `in ${userProfile.education.fieldOfStudy}` : ""} ${userProfile.education?.school ? `from ${userProfile.education.school}` : ""}
Location / Country: ${userProfile.personal?.location || userProfile.personal?.country || "Any"}
Work Authorization: ${userProfile.presets?.workAuthorization || "Authorized to work"} ${userProfile.presets?.workCountries ? `(Countries: ${userProfile.presets.workCountries})` : ""}
Notice Period / Availability: ${userProfile.presets?.noticePeriod || userProfile.experience?.noticePeriod || "Immediately available"}
Salary Expectations: ${userProfile.presets?.salaryExpectations || "Negotiable"}
`;

    const systemPrompt = `You are a qualified job candidate (${candidateRole}) writing an application answer.
Write a genuine, concise, articulate, and compelling response to the application prompt.
Tone: ${tone}.
Guidelines:
- Highlight concrete achievements, skills, and value aligned with the role.
- Keep the length appropriate (2 to 4 sentences for short textareas; 1 to 2 focused paragraphs for essay prompts).
- Do not use clichés or overly fluffy adjectives. Write pragmatically and professionally.
- Return ONLY the final response text with no meta-commentary, no greetings, no quotes around it.`;

    const userPrompt = `Application Question:\n"${question}"\n\nCandidate Profile Context:\n${candidateContext}`;

    return await this.generate(userPrompt, apiKey, systemPrompt);
  },

  // Suggest answer for unrecognized / non-standard form fields
  async suggestFieldAnswer({ fieldLabel, fieldType = "text", options = [], pageContext = "", userProfile, apiKey }) {
    const candidateRole = userProfile.experience?.currentTitle || "Job Candidate";
    const systemPrompt = `You are an intelligent form assistant for a candidate (${candidateRole}) applying to jobs.
Your task is to analyze a form field on a job application page and supply the most accurate, concise value based on the candidate's profile.
If options are provided (for a dropdown or radio), output the EXACT matching option value or label that best fits.
Otherwise, output a concise, appropriate text value.
Return ONLY the suggested value, nothing else.`;

    const optionsText = options.length ? `\nAvailable Dropdown Options:\n${options.map(o => `"${o}"`).join(", ")}` : "";
    
    const userPrompt = `Form Field Label / Question: "${fieldLabel}"
Field Type: ${fieldType}${optionsText}
Page Context: ${pageContext}

Candidate Profile:
- Full Name: ${userProfile.personal?.fullName || ""}
- Email: ${userProfile.personal?.email || ""}
- Phone: ${userProfile.personal?.phone || ""}
- Location: ${userProfile.personal?.location || userProfile.personal?.country || ""}
- Current/Past Company: ${userProfile.experience?.currentCompany || ""}
- Current/Past Title: ${userProfile.experience?.currentTitle || ""}
- Total Years Experience: ${userProfile.experience?.yearsOfExperience || ""}
- Notice Period: ${userProfile.presets?.noticePeriod || userProfile.experience?.noticePeriod || ""}
- Work Auth: ${userProfile.presets?.workAuthorization || ""} (Sponsorship Required: ${userProfile.presets?.requireSponsorship || "No"})
- Desired Salary: ${userProfile.presets?.salaryExpectations || ""}
- Relocation: ${userProfile.presets?.willingToRelocate || ""}
- Skills / Background: ${userProfile.experience?.skills || ""}

What is the best answer to fill in this field?`;

    return await this.generate(userPrompt, apiKey, systemPrompt);
  },

  // Background AI Compiler: Evaluates telemetry, user corrections, synonym clusters, and company rules
  async refineKnowledgeBase({ pendingItems, profile, apiKey }) {
    if (!apiKey || !pendingItems || !pendingItems.length) return null;

    const corrections = pendingItems.filter(p => p.type === 'user_correction');
    const telemetries = pendingItems.filter(p => p.type === 'autofill_telemetry');
    const existingDynamicFields = profile.dynamicFields || [];

    const prompt = `You are the Background Knowledge Compiler for ApplyPilot AI.
Analyze user form corrections, new form questions, and application telemetry to update and refine the candidate's dynamic knowledge store.

Current Dynamic Knowledge Store:
${JSON.stringify(existingDynamicFields.map(f => ({ id: f.id, label: f.label, key: f.canonicalKey, aliases: f.aliases, value: f.value, companyRules: f.companyRules })), null, 2)}

Candidate Past Employers:
${(profile.experience?.items || []).map(e => e.company).join(", ")}

New User Corrections & Form Activity:
${JSON.stringify(corrections, null, 2)}

Unmatched Form Questions Encountered:
${JSON.stringify(telemetries.flatMap(t => t.unmatchedSample || []), null, 2)}

Instructions:
1. For user corrections:
   - Determine if the correction is a GLOBAL update (e.g. general detail) OR a COMPANY-SPECIFIC question (e.g., "Have you worked at X?").
   - If company-specific: produce a companyRule update for that question template.
   - If global: update the canonical value.
2. For newly encountered questions:
   - Group synonyms / aliases to existing dynamic fields where possible (e.g., "higher degree" -> "education.highest").
   - If it represents a genuinely new reusable question, propose a new dynamic field with a category, label, aliases, and value.
3. Output strict valid JSON matching this schema:
{
  "updatedFields": [
    {
      "id": "existing-or-new-id",
      "canonicalKey": "category.key",
      "category": "Education | Work History | Company-Specific | General Application | Contact & Links",
      "label": "Human Readable Label",
      "aliases": ["alias 1", "alias 2"],
      "value": "canonical answer",
      "companyRules": null
    }
  ],
  "recommendedIgnored": []
}
Return ONLY valid JSON with no markdown wrapping.`;

    const systemPrompt = "You are a professional semantic knowledge compiler. Output strictly valid JSON.";
    try {
      const response = await this.generate(prompt, apiKey, systemPrompt);
      const cleanJson = response.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      console.warn("[GeminiService] Failed to parse refineKnowledgeBase response:", e);
      return null;
    }
  }
};

if (typeof module !== 'undefined') {
  module.exports = { GeminiService };
}
