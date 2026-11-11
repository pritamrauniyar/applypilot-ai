// ApplyPilot AI - Deterministic Offline Resume Parser
// Pure JavaScript, zero dependencies, zero network requests, 100% private.
// Parses raw resume text into structured ApplyPilot profile entities.

(function() {
  'use strict';

  const US_STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri",
    "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey",
    "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
    "DC": "District of Columbia"
  };

  const KNOWN_COUNTRIES = [
    "India", "United States", "United States of America", "USA", "U.S.A.", "US",
    "United Kingdom", "UK", "U.K.", "Canada", "Germany", "Singapore", "Australia",
    "France", "Netherlands", "Ireland", "United Arab Emirates", "UAE", "Japan",
    "Switzerland", "Sweden", "Norway", "Denmark", "Finland", "Spain", "Italy",
    "Poland", "Portugal", "Brazil", "Mexico", "Nepal", "Bangladesh", "Pakistan",
    "Sri Lanka", "New Zealand", "South Korea", "Israel", "Remote"
  ];

  const MONTH_NAMES = "(?:Jan(?:uary)?\\.?|Feb(?:ruary)?\\.?|Mar(?:ch)?\\.?|Apr(?:il)?\\.?|May|Jun(?:e)?\\.?|Jul(?:y)?\\.?|Aug(?:ust)?\\.?|Sep(?:t(?:ember)?)?\\.?|Oct(?:ober)?\\.?|Nov(?:ember)?\\.?|Dec(?:ember)?\\.?)";
  const DATE_ENDPOINT = `(?:${MONTH_NAMES}\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\b20\\d{2}\\b|\\b19\\d{2}\\b)`;
  const DATE_RANGE_REGEX = new RegExp(
    `(${DATE_ENDPOINT})\\s*(?:-|–|—|to|until)\\s*(${DATE_ENDPOINT}|Present|Current|Now|Till\\s+Date)`,
    "i"
  );

  const DEGREE_PATTERNS = [
    { pattern: /\b(ph\.?d\.?|doctor of philosophy|doctorate)\b/i, degree: "Doctor of Philosophy (Ph.D.)" },
    { pattern: /\b(master(?:'s)? of science|m\.?s\.?|msc)\b/i, degree: "Master of Science (M.S.)" },
    { pattern: /\b(master(?:'s)? of business administration|mba)\b/i, degree: "Master of Business Administration (MBA)" },
    { pattern: /\b(master(?:'s)? of arts|m\.?a\.?)\b/i, degree: "Master of Arts (M.A.)" },
    { pattern: /\b(master(?:'s)? of engineering|m\.?eng\.?|m\.?tech\.?)\b/i, degree: "Master of Engineering (M.Eng.)" },
    { pattern: /\b(bachelor(?:'s)? of science|b\.?s\.?|bsc)\b/i, degree: "Bachelor of Science (B.S.)" },
    { pattern: /\b(bachelor(?:'s)? of arts|b\.?a\.?)\b/i, degree: "Bachelor of Arts (B.A.)" },
    { pattern: /\b(bachelor(?:'s)? of technology|bachelor(?:'s)? of engineering|b\.?tech\.?|b\.?e\.?)\b/i, degree: "Bachelor of Technology / Engineering (B.Tech / B.E.)" },
    { pattern: /\b(associate(?:'s)? degree|associate of arts|associate of science)\b/i, degree: "Associate Degree" },
    { pattern: /\b(bachelor(?:'s)? degree|undergraduate)\b/i, degree: "Bachelor's Degree" },
    { pattern: /\b(master(?:'s)? degree|graduate degree)\b/i, degree: "Master's Degree" }
  ];

  const FIELD_OF_STUDY_PATTERNS = [
    /computer science(?:\s+(?:and|&)\s+engineering)?/i,
    /electronics(?:\s+(?:and|&)\s+communication(?:s)?)?(?:\s+engineering)?/i,
    /software engineering/i,
    /data science/i,
    /artificial intelligence|machine learning/i,
    /information technology|information systems/i,
    /electrical(?:\s+(?:and|&)\s+electronics)?\s+engineering/i,
    /mechanical engineering/i,
    /computer engineering/i,
    /civil engineering/i,
    /aerospace engineering/i,
    /chemical engineering/i,
    /biomedical engineering/i,
    /business administration|management/i,
    /finance|accounting/i,
    /economics/i,
    /mathematics|statistics/i,
    /physics/i,
    /chemistry|biochemistry/i,
    /biology|biotechnology/i,
    /psychology/i,
    /graphic design|human-computer interaction|ux design/i
  ];

  const SECTION_HEADERS = {
    experience: /^(?:work\s+experience|professional\s+experience|employment\s+history|experience|career\s+history|work\s+history)\b/i,
    education: /^(?:education|academic\s+background|academic\s+history|academic\s+qualifications|degrees)\b/i,
    skills: /^(?:technical\s+skills|skills\s*(?:&|and)\s*technologies|core\s+competencies|skills|technologies|tools\s*(?:&|and)\s*frameworks)\b/i,
    summary: /^(?:professional\s+summary|executive\s+summary|summary|profile|about\s+me|objective|career\s+objective)\b/i,
    projects: /^(?:projects|personal\s+projects|key\s+projects|open\s+source|selected\s+projects)\b/i,
    otherTrailing: /^(?:certifications?|licenses?\s*(?:&|and)\s*certifications?|awards?|honors?|publications?|volunteering|languages|interests|references)\b/i,
    links: /^(?:links|websites|social|profiles)\b/i
  };

  const JOB_TITLE_KEYWORDS = /\b(?:engineer|developer|architect|sde|swe|programmer|manager|director|lead|principal|staff|intern|analyst|scientist|consultant|designer|specialist|coordinator|administrator|vp|cto|ceo|founder|associate)\b/i;
  const SCHOOL_KEYWORDS = /\b(?:university|college|institute|academy|school|polytechnic|iit|nit|iiit|bits|mit|stanford|berkeley|harvard)\b/i;

  function toTitleCaseWord(word) {
    if (!word) return '';
    if (/^[A-Z]{2,}$/.test(word)) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    return word;
  }

  class DeterministicResumeParser {
    /**
     * Parse raw resume text into structured profile entities.
     * @param {string} rawText - Plain text extracted from PDF or pasted by user
     * @returns {object} Structured profile payload compatible with applyParsedResume
     */
    static parse(rawText = "") {
      const defaultPersonal = {
        firstName: "", middleName: "", lastName: "", fullName: "",
        email: "", phone: "", location: "", city: "", state: "", postalCode: "", country: "", address: ""
      };
      if (!rawText || typeof rawText !== 'string') {
        return { personal: defaultPersonal, links: {}, experience: { items: [] }, education: { items: [] }, suggestedCustomFields: [] };
      }

      const cleanText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);

      const contact = this.extractContactInfo(cleanText, lines);
      const sections = this.segmentSections(lines);

      const experience = this.parseExperienceSection(sections.experience || []);
      const education = this.parseEducationSection(sections.education || []);
      const skills = this.parseSkillsSection(sections.skills || []);
      const summary = this.parseSummarySection(sections.summary || []);

      let yearsOfExperience = "";
      if (experience.items.length > 0) {
        yearsOfExperience = this.estimateYearsOfExperience(experience.items);
      }

      return {
        personal: {
          firstName: contact.firstName || "",
          middleName: contact.middleName || "",
          lastName: contact.lastName || "",
          fullName: contact.fullName || "",
          email: contact.email || "",
          phone: contact.phone || "",
          location: contact.location || "",
          city: contact.city || "",
          state: contact.state || "",
          postalCode: contact.postalCode || "",
          country: contact.country || "",
          address: contact.address || ""
        },
        links: {
          linkedin: contact.linkedin || "",
          github: contact.github || "",
          portfolio: contact.portfolio || "",
          twitter: contact.twitter || ""
        },
        experience: {
          currentCompany: experience.currentCompany || (experience.items[0]?.company || ""),
          currentTitle: experience.currentTitle || (experience.items[0]?.title || ""),
          yearsOfExperience: yearsOfExperience || "",
          skills: skills.join(", "),
          headline: summary ? summary.slice(0, 120) : (experience.items[0]?.title || ""),
          items: experience.items
        },
        education: {
          degree: education.degree || (education.items[0]?.degree || ""),
          fieldOfStudy: education.fieldOfStudy || (education.items[0]?.fieldOfStudy || ""),
          school: education.school || (education.items[0]?.school || ""),
          graduationYear: education.graduationYear || (education.items[0]?.graduationYear || ""),
          gpa: education.gpa || (education.items[0]?.gpa || ""),
          items: education.items
        },
        suggestedCustomFields: summary ? [
          { label: "Professional Summary", value: summary, keywords: ["summary", "about me", "bio", "objective"] }
        ] : []
      };
    }

    /**
     * Extract contact details: email, phone, links, location, and candidate name.
     */
    static extractContactInfo(fullText, lines) {
      const contact = {
        fullName: "",
        firstName: "",
        middleName: "",
        lastName: "",
        email: "",
        phone: "",
        linkedin: "",
        github: "",
        portfolio: "",
        twitter: "",
        location: "",
        city: "",
        state: "",
        postalCode: "",
        country: "",
        address: ""
      };

      // 1. Email extraction (heal spaced PDF kerning like "name . ext@domain.com" if encountered)
      const mailtoMatch = fullText.match(/mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i);
      const spacedEmailMatch = fullText.match(/([A-Za-z0-9_-]+(?:\s*\.\s*[A-Za-z0-9_-]+)*@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
      const strictEmailMatch = fullText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
      if (spacedEmailMatch && spacedEmailMatch[1].includes('.')) {
        contact.email = spacedEmailMatch[1].replace(/\s*\.\s*/g, '.').trim();
      } else if (strictEmailMatch) {
        contact.email = strictEmailMatch[0].trim();
      } else if (mailtoMatch) {
        contact.email = mailtoMatch[1].trim();
      }

      // 2. Phone extraction (prioritize full international +CC numbers and full 10+ digit phones)
      const phonePatterns = [
        // International: +91-6201413304, +1 (415) 555-0199, +44 7911 123456
        /\+\d{1,3}[-.\s]?(?:\(?\d{2,5}\)?[-.\s]?){1,3}\d{3,5}\b/,
        // North American bounded 10-digit: (415) 555-0199 or 415-555-0199
        /(?:^|[^\d-])(?:\(\s*([2-9]\d{2})\s*\)|([2-9]\d{2}))[-.\s]*([2-9]\d{2})[-.\s]*([0-9]{4})(?:\s*(?:#|x\.?|ext\.?|extension)\s*(\d+))?(?=$|[^\d])/m,
        // General 10-13 digit grouped phone (e.g. 980-000-0000 or 98000 00000)
        /(?:^|[^\d-])(\d{2,5}[-.\s]\d{3,5}[-.\s]\d{3,5}|\d{5}[-.\s]\d{5})(?=$|[^\d])/m,
        // Plain 10-digit mobile number (not part of longer digits)
        /(?:^|[^\d])([6-9]\d{9})(?=$|[^\d])/m
      ];

      for (const pat of phonePatterns) {
        const m = fullText.match(pat);
        if (m) {
          const candidate = (m[0] || "").replace(/^[\s|:;,.-]+/, "").trim();
          const digits = candidate.replace(/\D/g, "");
          // Guard against year ranges like 2018-2022
          if (/^(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}$/.test(candidate)) continue;
          if (digits.length >= 10 && digits.length <= 15) {
            contact.phone = candidate;
            break;
          }
        }
      }

      // 3. Links extraction (works on visible text AND extracted "Links: ..." PDF /URI metadata)
      const linkedinMatch = fullText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|profile)\/([a-zA-Z0-9_%-]+)/i);
      if (linkedinMatch) {
        contact.linkedin = linkedinMatch[0].startsWith("http") ? linkedinMatch[0] : `https://${linkedinMatch[0]}`;
      }

      const githubMatch = fullText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/i);
      if (githubMatch) {
        contact.github = githubMatch[0].startsWith("http") ? githubMatch[0] : `https://${githubMatch[0]}`;
      }

      const twitterMatch = fullText.match(/(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/i);
      if (twitterMatch) {
        contact.twitter = twitterMatch[0].startsWith("http") ? twitterMatch[0] : `https://${twitterMatch[0]}`;
      }

      const urlMatches = fullText.matchAll(/(?:https?:\/\/)?([a-zA-Z0-9][a-zA-Z0-9.-]{1,61}[a-zA-Z0-9]\.(?:com|org|io|dev|me|net|app|co|tech|in|np))(?:\/[^\s,|)]*)?/gi);
      for (const m of urlMatches) {
        const u = m[0].toLowerCase();
        const domain = m[1].toLowerCase();
        if (contact.email && contact.email.toLowerCase().includes(domain)) continue;
        if (!u.includes("linkedin.com") && !u.includes("github.com") && !u.includes("twitter.com") && !u.includes("x.com") && !u.includes("google.com") && !u.includes("gmail.com") && !u.includes("yahoo.com") && !u.includes("outlook.com")) {
          contact.portfolio = m[0].startsWith("http") ? m[0] : `https://${m[0]}`;
          break;
        }
      }

      // 4. Location extraction: restrict to header lines before body sections so Skills ("LLMs, AI") never match
      const headerLines = [];
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const lClean = lines[i].replace(/[:\-_#=*]+$/, "").trim();
        let isBodyHeader = false;
        for (const [secKey, regex] of Object.entries(SECTION_HEADERS)) {
          if (secKey !== 'links' && regex.test(lClean)) {
            isBodyHeader = true;
            break;
          }
        }
        if (isBodyHeader) break;
        headerLines.push(lines[i]);
      }

      const headerSegments = headerLines
        .flatMap(l => l.split(/[|•·]/))
        .map(s => s.trim())
        .filter(Boolean);

      const countryAlt = KNOWN_COUNTRIES
        .filter(c => c !== 'Remote')
        .map(c => c.replace(/\./g, '\\.'))
        .join('|');
      const usStateFullAlt = Object.values(US_STATES).join('|');

      const tryMatchLocation = (segment) => {
        if (!segment || segment.includes("@") || segment.includes("http") || /mailto:/i.test(segment)) return false;

        // Pattern A: "City, ST 94103" (STRICTLY validated against US_STATES)
        const usAbbrMatch = segment.match(/\b([A-Z][a-zA-Z .'-]{1,35}),\s*([A-Z]{2})\b(?:\s*(\d{5}(?:-\d{4})?))?/);
        if (usAbbrMatch) {
          const stCode = usAbbrMatch[2].toUpperCase();
          const cityCandidate = usAbbrMatch[1].trim();
          if (Object.prototype.hasOwnProperty.call(US_STATES, stCode) && !/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(cityCandidate)) {
            contact.city = cityCandidate;
            contact.state = stCode;
            contact.postalCode = usAbbrMatch[3] ? usAbbrMatch[3].trim() : "";
            contact.country = "United States";
            contact.location = `${contact.city}, ${contact.state}${contact.postalCode ? ' ' + contact.postalCode : ''}`;
            return true;
          }
        }

        // Pattern B: "City, State Full Name [ZIP]"
        const usFullMatch = segment.match(new RegExp(`\\b([A-Z][a-zA-Z .'-]{1,35}),\\s*(${usStateFullAlt})\\b(?:\\s*(\\d{5}(?:-\\d{4})?))?`, 'i'));
        if (usFullMatch) {
          contact.city = usFullMatch[1].trim();
          contact.state = usFullMatch[2].trim();
          contact.postalCode = usFullMatch[3] ? usFullMatch[3].trim() : "";
          contact.country = "United States";
          contact.location = `${contact.city}, ${contact.state}${contact.postalCode ? ' ' + contact.postalCode : ''}`;
          return true;
        }

        // Pattern C: "City, State, Country"
        const cityStateCountryMatch = segment.match(new RegExp(`\\b([A-Z][a-zA-Z .'-]{1,30}),\\s*([A-Z][a-zA-Z .'-]{1,30}),\\s*(${countryAlt})\\b`, 'i'));
        if (cityStateCountryMatch) {
          contact.city = cityStateCountryMatch[1].trim();
          contact.state = cityStateCountryMatch[2].trim();
          contact.country = cityStateCountryMatch[3].trim();
          contact.location = `${contact.city}, ${contact.state}, ${contact.country}`;
          return true;
        }

        // Pattern D: International "City, Country" (e.g. "Bengaluru, India", "London, UK")
        const intlMatch = segment.match(new RegExp(`\\b([A-Z][a-zA-Z .'-]{1,35}),\\s*(${countryAlt})\\b`, 'i'));
        if (intlMatch) {
          const cityCandidate = intlMatch[1].trim();
          if (!/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(cityCandidate)) {
            contact.city = cityCandidate;
            contact.country = intlMatch[2].trim();
            contact.location = `${contact.city}, ${contact.country}`;
            return true;
          }
        }
        return false;
      };

      for (const seg of headerSegments) {
        if (tryMatchLocation(seg)) break;
      }

      // If not found in header, scan fullText ONLY with strict US_STATES / Known Countries and tech guard
      if (!contact.location) {
        for (const l of lines) {
          if (/\b(?:LLMs|AI|React|Angular|Node\.js|Java|Python|SQL|AWS)\b/.test(l)) continue;
          if (tryMatchLocation(l)) break;
        }
      }

      // Infer country from phone calling code if location didn't provide one
      if (!contact.country && contact.phone) {
        if (/^\+91\b/.test(contact.phone)) contact.country = "India";
        else if (/^\+44\b/.test(contact.phone)) contact.country = "United Kingdom";
        else if (/^\+1\b/.test(contact.phone)) contact.country = "United States";
      }

      // 5. Name extraction (from top header lines)
      const nonNameWords = /^(?:resume|curriculum\s+vitae|cv|contact|profile|objective|summary|skills|education|experience|projects|links|bengaluru|bangalore|mumbai|delhi|hyderabad|remote|india|united\s+states|san\s+francisco|new\s+york|london|austin|seattle)$/i;
      for (let i = 0; i < Math.min(lines.length, 8); i++) {
        let candidateLine = lines[i].trim();
        if (!candidateLine) continue;
        // If name shares a top header line before a pipe separator, inspect left segment
        if (candidateLine.includes("|")) {
          const leftPart = candidateLine.split("|")[0].trim();
          if (leftPart) candidateLine = leftPart;
        }
        if (candidateLine.includes("@") || candidateLine.includes("http") || candidateLine.includes("www.") || /\d{3}/.test(candidateLine)) continue;
        if (nonNameWords.test(candidateLine) || JOB_TITLE_KEYWORDS.test(candidateLine)) continue;

        const words = candidateLine.split(/\s+/);
        if (words.length >= 2 && words.length <= 4 && !/\d/.test(candidateLine) && candidateLine.length < 50) {
          const isAllWordsPlausible = words.every(w => /^[A-Za-z][a-zA-Z.'-]*$/.test(w) && /^[A-Z]/.test(w));
          const allNonLocation = words.every(w => !nonNameWords.test(w));
          if (isAllWordsPlausible && allNonLocation) {
            const normalizedWords = words.map(toTitleCaseWord);
            contact.fullName = normalizedWords.join(" ");
            contact.firstName = normalizedWords[0];
            if (normalizedWords.length === 2) {
              contact.lastName = normalizedWords[1];
            } else if (normalizedWords.length === 3) {
              contact.middleName = normalizedWords[1];
              contact.lastName = normalizedWords[2];
            } else {
              contact.middleName = normalizedWords.slice(1, -1).join(" ");
              contact.lastName = normalizedWords[normalizedWords.length - 1];
            }
            break;
          }
        }
      }

      // Fallback: derive name from email prefix only when clearly segmented ("first.last@...")
      if (!contact.fullName && contact.email) {
        const prefix = contact.email.split("@")[0];
        const parts = prefix.split(/[._-]/).filter(p => /^[a-zA-Z]{2,}$/.test(p) && !/^(np|in|uk|us|dev|me|io|ai)$/i.test(p));
        if (parts.length >= 2) {
          const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
          contact.firstName = cap(parts[0]);
          contact.lastName = cap(parts[parts.length - 1]);
          contact.fullName = `${contact.firstName} ${contact.lastName}`;
        }
      }

      return contact;
    }

    /**
     * Segment document lines into categorized sections by detecting headers.
     */
    static segmentSections(lines) {
      const sections = {
        summary: [],
        experience: [],
        education: [],
        skills: [],
        projects: [],
        other: []
      };

      let currentSection = "other";

      for (const line of lines) {
        const clean = line.replace(/[:\-_#=*]+$/, "").trim();

        let detected = null;
        // Guard against category sub-labels inside Skills (e.g. "Languages: Java, Go" or "Core Competencies: Leadership, ...")
        const isInlineSkillCategory = currentSection === "skills" && /^[A-Za-z &\/+-]{2,35}:\s*.+/.test(line);
        if (!isInlineSkillCategory) {
          for (const [secKey, regex] of Object.entries(SECTION_HEADERS)) {
            if (regex.test(clean)) {
              detected = secKey;
              break;
            }
          }
        }

        if (detected) {
          currentSection = detected === 'otherTrailing' ? 'other' : detected;
          const remainingContent = clean.replace(SECTION_HEADERS[detected], "").replace(/^[:\s\-_–—]+/, "").trim();
          if (remainingContent && sections[currentSection]) {
            sections[currentSection].push(remainingContent);
          }
        } else if (currentSection && sections[currentSection]) {
          sections[currentSection].push(line);
        } else {
          sections.other.push(line);
        }
      }

      return sections;
    }

    /**
     * Parse role header text (with date already removed) into { title, company, location }.
     * Preserves intra-word hyphens such as "Elevate K-12".
     */
    static parseExperienceHeader(lineWithoutDate) {
      let rest = String(lineWithoutDate || "").trim();
      let location = "";

      // Extract trailing location after whitespace-framed dash or pipe (e.g. "– Bengaluru, India", "– Remote")
      const countryAlt = KNOWN_COUNTRIES.map(c => c.replace(/\./g, '\\.')).join('|');
      const trailingLocRe = new RegExp(
        `(?:\\s*[–—|]|\\s+-)\\s*((?:Remote|Hybrid|[A-Z][a-zA-Z .'-]+,\\s*(?:[A-Z]{2}|${countryAlt})))\\s*$`,
        'i'
      );
      const locMatch = rest.match(trailingLocRe);
      if (locMatch) {
        location = locMatch[1].trim();
        rest = rest.slice(0, locMatch.index).trim();
      }

      // Split ONLY on pipes, bullets, whitespace-padded dashes, commas, or " at " (never bare intra-word hyphens like K-12!)
      const parts = rest.split(/\s*(?:\||•|\s+[–—-]\s+|,\s*|\s+at\s+)\s*/i).map(s => s.trim()).filter(Boolean);

      // Re-attach trailing location if captured as a 3rd+ element
      if (!location && parts.length >= 3) {
        const last = parts[parts.length - 1];
        if (/^(?:Remote|Hybrid)$/i.test(last) || /,/.test(last) || Object.prototype.hasOwnProperty.call(US_STATES, last.toUpperCase())) {
          location = parts.pop();
        }
      }

      let title = "";
      let company = "";

      if (parts.length >= 2) {
        const p0IsTitle = JOB_TITLE_KEYWORDS.test(parts[0]);
        const p1IsTitle = JOB_TITLE_KEYWORDS.test(parts[1]);
        if (!p0IsTitle && p1IsTitle) {
          company = parts[0];
          title = parts[1];
        } else {
          title = parts[0];
          company = parts[1];
        }
      } else if (parts.length === 1) {
        if (JOB_TITLE_KEYWORDS.test(parts[0])) title = parts[0];
        else company = parts[0];
      }

      return { title, company, location };
    }

    /**
     * Parse the Experience section lines into individual role items.
     */
    static parseExperienceSection(expLines) {
      const items = [];
      let currentItem = null;

      for (let i = 0; i < expLines.length; i++) {
        const line = expLines[i].trim();
        if (!line) continue;

        const dateMatch = line.match(DATE_RANGE_REGEX);

        if (dateMatch) {
          if (currentItem) {
            items.push(this.finalizeExperienceItem(currentItem));
          }

          currentItem = {
            title: "",
            company: "",
            startDate: dateMatch[1] ? dateMatch[1].trim() : "",
            endDate: dateMatch[2] ? dateMatch[2].trim() : "",
            isCurrent: /present|current|now|till\s+date/i.test(dateMatch[2] || ""),
            location: "",
            descriptionLines: []
          };

          const lineWithoutDate = line.replace(dateMatch[0], "").trim().replace(/^[|\-,–—\s]+|[|\-,–—\s]+$/g, "");
          if (lineWithoutDate) {
            const header = this.parseExperienceHeader(lineWithoutDate);
            currentItem.title = header.title;
            currentItem.company = header.company;
            currentItem.location = header.location;
          }

          // Check previous line if header was split across lines
          if ((!currentItem.company || !currentItem.title) && i > 0 && expLines[i - 1]) {
            const prev = expLines[i - 1].trim();
            if (!prev.match(DATE_RANGE_REGEX) && !/^[•\-\*–—>]/.test(prev) && prev.length < 90) {
              const prevParsed = this.parseExperienceHeader(prev);
              if (!currentItem.title && prevParsed.title) currentItem.title = prevParsed.title;
              if (!currentItem.company && prevParsed.company) currentItem.company = prevParsed.company;
              if (!currentItem.title && !prevParsed.title) currentItem.title = prev;
              else if (!currentItem.company) currentItem.company = prevParsed.company || prev;
            }
          }

          // Check next line for location or company if still missing
          if (i + 1 < expLines.length) {
            const next = expLines[i + 1].trim();
            const isShortNonBullet = !next.match(DATE_RANGE_REGEX) && !/^[•\-\*–—>]/.test(next) && next.length < 70;
            if (isShortNonBullet && !currentItem.company) {
              const nextParsed = this.parseExperienceHeader(next);
              currentItem.company = nextParsed.company || next;
              if (!currentItem.location && nextParsed.location) currentItem.location = nextParsed.location;
              i++;
            } else if (isShortNonBullet && !currentItem.location && /^(?:Remote|Hybrid|[A-Z][a-zA-Z .'-]+,\s*[A-Za-z]{2,})/.test(next)) {
              currentItem.location = next;
              i++;
            }
          }
        } else if (currentItem) {
          if (/^[•●▪\-\*–—>]/.test(line)) {
            currentItem.descriptionLines.push(line.replace(/^[•●▪\-\*–—>]\s*/, "").trim());
          } else if (line.length > 0) {
            // Merge wrapped continuation line onto the active bullet/sentence instead of adding spurious bullet symbols
            const descCount = currentItem.descriptionLines.length;
            if (descCount > 0 && !/[.!?]$/.test(currentItem.descriptionLines[descCount - 1])) {
              currentItem.descriptionLines[descCount - 1] = `${currentItem.descriptionLines[descCount - 1]} ${line}`.trim();
            } else {
              currentItem.descriptionLines.push(line);
            }
          }
        }
      }

      if (currentItem) {
        items.push(this.finalizeExperienceItem(currentItem));
      }

      return {
        items,
        currentCompany: items[0]?.company || "",
        currentTitle: items[0]?.title || ""
      };
    }

    static finalizeExperienceItem(item) {
      const cleanedDescLines = item.descriptionLines.filter(Boolean);
      return {
        company: item.company || "Company",
        title: item.title || "Role",
        startDate: item.startDate || "",
        endDate: item.endDate || "",
        isCurrent: item.isCurrent,
        location: item.location || "",
        description: cleanedDescLines.length ? "• " + cleanedDescLines.join("\n• ") : ""
      };
    }

    /**
     * Parse the Education section lines into academic items.
     */
    static parseEducationSection(eduLines) {
      const items = [];
      let currentItem = null;

      for (let i = 0; i < eduLines.length; i++) {
        const line = eduLines[i].trim();
        if (!line) continue;

        let matchedDegree = "";
        for (const d of DEGREE_PATTERNS) {
          if (d.pattern.test(line)) {
            matchedDegree = d.degree;
            break;
          }
        }

        const isSchoolLine = SCHOOL_KEYWORDS.test(line);

        const allYears = Array.from(line.matchAll(/\b(19\d{2}|20\d{2})\b/g));
        const graduationYear = allYears.length > 0 ? allYears[allYears.length - 1][0] : "";

        const gpaMatch = line.match(/(?:GPA|CGPA|Grade)[:\s]*([0-9]\.\d{1,2}(?:\s*\/\s*(?:4|10)(?:\.0)?)?|\d{1,2}(?:\.\d+)?%)/i);

        let matchedField = "";
        for (const f of FIELD_OF_STUDY_PATTERNS) {
          const match = line.match(f);
          if (match) {
            matchedField = match[0]
              .split(/\s+/)
              .map(w => (/^(?:and|of|in)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
              .join(' ');
            break;
          }
        }

        // Fallback field-of-study capture after "<Degree>, <Major>" or "<Degree> in <Major>"
        if (!matchedField && matchedDegree) {
          const afterDeg = line.match(/(?:b\.?tech\.?|b\.?e\.?|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?tech\.?|m\.?e\.?|mba|ph\.?d\.?|bachelor(?:'s)?(?:\s+of\s+[a-z]+)?|master(?:'s)?(?:\s+of\s+[a-z]+)?)\s*(?:,|in|of|-|–|:)\s*([^|•\d\n]+)/i);
          if (afterDeg && afterDeg[1]) {
            const candidateMajor = afterDeg[1].replace(/\b(?:gpa|cgpa|grade)\b.*$/i, "").trim().replace(/[,\s-]+$/, "");
            if (candidateMajor.length >= 3 && candidateMajor.length <= 70) {
              matchedField = candidateMajor;
            }
          }
        }

        // Clean school line by stripping trailing date ranges and GPA blocks
        const cleanedSchoolText = line
          .replace(DATE_RANGE_REGEX, "")
          .replace(/(?:GPA|CGPA|Grade)[:\s]*[^\s|•]+/gi, "")
          .replace(/[|•,\-–—\s]+$/, "")
          .trim();

        if (isSchoolLine || matchedDegree) {
          if (currentItem && ((isSchoolLine && currentItem.school) || (matchedDegree && currentItem.degree))) {
            items.push(currentItem);
            currentItem = null;
          }

          if (!currentItem) {
            currentItem = {
              school: isSchoolLine ? cleanedSchoolText : "",
              degree: matchedDegree || "",
              fieldOfStudy: matchedField || "",
              graduationYear: graduationYear || "",
              gpa: gpaMatch ? gpaMatch[1] : ""
            };
          } else {
            if (isSchoolLine && !currentItem.school) currentItem.school = cleanedSchoolText;
            if (matchedDegree && !currentItem.degree) currentItem.degree = matchedDegree;
            if (matchedField && !currentItem.fieldOfStudy) currentItem.fieldOfStudy = matchedField;
            if (graduationYear && !currentItem.graduationYear) currentItem.graduationYear = graduationYear;
            if (gpaMatch && !currentItem.gpa) currentItem.gpa = gpaMatch[1];
          }
        } else if (currentItem) {
          if (graduationYear && !currentItem.graduationYear) currentItem.graduationYear = graduationYear;
          if (gpaMatch && !currentItem.gpa) currentItem.gpa = gpaMatch[1];
          if (matchedField && !currentItem.fieldOfStudy) currentItem.fieldOfStudy = matchedField;
        }
      }

      if (currentItem && (currentItem.school || currentItem.degree)) {
        items.push(currentItem);
      }

      return {
        items,
        school: items[0]?.school || "",
        degree: items[0]?.degree || "",
        fieldOfStudy: items[0]?.fieldOfStudy || "",
        graduationYear: items[0]?.graduationYear || "",
        gpa: items[0]?.gpa || ""
      };
    }

    /**
     * Parse skills section into a normalized array of skill keywords.
     */
    static parseSkillsSection(skillLines) {
      const skills = [];
      for (const rawLine of skillLines) {
        // Strip leading bullets and category prefixes like "• Generative AI: LLMs, MCP"
        const line = rawLine
          .replace(/^[•●▪\-\*–—>\s]+/, "")
          .replace(/^[A-Za-z][A-Za-z &\/+-]{1,35}:\s*/, "")
          .trim();
        if (!line) continue;

        const tokens = line.split(/[,;•●▪|\n]+/).map(s => s.trim()).filter(Boolean);
        for (const tok of tokens) {
          const cleanTok = tok.replace(/^[•●▪\-\*\s]+/, "").trim();
          if (cleanTok && cleanTok.length > 1 && cleanTok.length < 40 && !skills.includes(cleanTok)) {
            skills.push(cleanTok);
          }
        }
      }
      return skills;
    }

    /**
     * Parse summary section into a clean multi-sentence narrative.
     */
    static parseSummarySection(summaryLines) {
      return summaryLines.join(" ").replace(/\s+/g, " ").trim();
    }

    /**
     * Estimate total years of professional experience from earliest item to present.
     */
    static estimateYearsOfExperience(items) {
      if (!items || items.length === 0) return "";
      const currentYear = new Date().getFullYear();
      let earliestYear = currentYear;

      for (const item of items) {
        const m = (item.startDate || "").match(/\b(19\d{2}|20\d{2})\b/);
        if (m) {
          const y = parseInt(m[1], 10);
          if (y < earliestYear && y > 1980) {
            earliestYear = y;
          }
        }
      }

      const diff = currentYear - earliestYear;
      return diff > 0 ? `${diff}+ years` : "1 year";
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DeterministicResumeParser };
  }
  if (typeof window !== 'undefined') {
    window.DeterministicResumeParser = DeterministicResumeParser;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.DeterministicResumeParser = DeterministicResumeParser;
  }

})();
