// 90% Fuzzy / Semantic String Matching Utility
function calculateSim(str1, str2) {
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

  const len1 = s1.length;
  const len2 = s2.length;
  if (Math.abs(len1 - len2) > 3 && jaccard < 0.5) return jaccard;
  const dp = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0));
  for (let i = 0; i <= len1; i++) dp[i][0] = i;
  for (let j = 0; j <= len2; j++) dp[0][j] = j;
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return Math.max(jaccard, 1.0 - (dp[len1][len2] / Math.max(len1, len2)));
}

function isNinetyPercentMatch(str1, str2) {
  if (typeof is90PercentMatch === 'function') return is90PercentMatch(str1, str2);
  return calculateSim(str1, str2) >= 0.90;
}

// Detect Target Employer from Page / URL Context
function extractTargetCompany(contextUrl = "", pageTitle = "") {
  let host = "";
  try {
    if (contextUrl) {
      host = new URL(contextUrl).hostname.toLowerCase();
    } else if (typeof window !== 'undefined' && window.location?.hostname) {
      host = window.location.hostname.toLowerCase();
    }
  } catch (e) {}

  // Check subdomains (e.g. uber.wd1.myworkdayjobs.com -> uber, jobs.lever.co/stripe -> stripe)
  if (host.includes("myworkdayjobs.com")) {
    const parts = host.split('.');
    if (parts.length >= 3 && parts[0] !== 'www') return parts[0];
  }

  const title = (pageTitle || (typeof document !== 'undefined' ? document.title : "")).toLowerCase();
  const known = ["uber", "meta", "google", "microsoft", "apple", "amazon", "netflix", "stripe", "airbnb", "salesforce", "oracle", "american express"];
  for (const k of known) {
    if (host.includes(k) || title.includes(k) || (contextUrl && contextUrl.toLowerCase().includes(k))) {
      return k.charAt(0).toUpperCase() + k.slice(1);
    }
  }

  const match = host.match(/([a-z0-9\-]+)\.(?:com|org|net|io|co|ai)/);
  if (match && !["lever", "greenhouse", "ashbyhq", "myworkdayjobs", "workday", "taleo", "oraclecloud"].includes(match[1])) {
    return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  }

  return "";
}

var AtsAdapters = {
  // Common standard field dictionary with multi-signal matching
  FIELD_DEFINITIONS: [
    {
      key: "firstName",
      category: "personal",
      subKey: "firstName",
      labels: ["first name", "given name", "forename", "first_name", "given name(s)", "given names"],
      names: ["firstname", "first_name", "first-name", "givenname", "given-name"],
      autocomplete: ["given-name"],
      workdayId: ["legalnamesection_firstname", "firstname", "givenname"]
    },
    {
      key: "middleName",
      category: "personal",
      subKey: "middleName",
      labels: ["middle name", "middle initial", "middle", "second name", "additional name"],
      names: ["middlename", "middle_name", "middle-name", "middleinitial", "middle_initial"],
      autocomplete: ["additional-name"],
      workdayId: ["legalnamesection_middlename", "middlename"]
    },
    {
      key: "lastName",
      category: "personal",
      subKey: "lastName",
      labels: ["last name", "surname", "family name", "last_name", "family name(s)", "family names"],
      names: ["lastname", "last_name", "last-name", "familyname", "family-name"],
      autocomplete: ["family-name"],
      workdayId: ["legalnamesection_lastname", "lastname", "familyname"]
    },
    {
      key: "fullName",
      category: "personal",
      subKey: "fullName",
      labels: ["full name", "your name", "name", "candidate name"],
      names: ["name", "fullname", "full_name", "candidate_name"],
      autocomplete: ["name"],
      workdayId: ["legalnamesection_name"]
    },
    {
      key: "email",
      category: "personal",
      subKey: "email",
      labels: ["email", "email address", "e-mail"],
      names: ["email", "email_address", "emailaddress"],
      autocomplete: ["email"],
      workdayId: ["email", "emailaddress"]
    },
    {
      key: "phone",
      category: "personal",
      subKey: "phone",
      labels: ["phone", "phone number", "mobile", "cell", "telephone"],
      names: ["phone", "phonenumber", "phone_number", "mobile", "cell_phone"],
      autocomplete: ["tel", "tel-national"],
      workdayId: ["phone-number", "phonenumber"]
    },
    {
      key: "address",
      category: "personal",
      subKey: "address",
      labels: ["street address", "address line 1", "address", "home address"],
      names: ["address", "address1", "street_address", "address_line_1"],
      autocomplete: ["street-address", "address-line1"],
      workdayId: ["addresssection_addressline1", "addressline1"]
    },
    {
      key: "city",
      category: "personal",
      subKey: "city",
      labels: ["city", "town", "municipality"],
      names: ["city", "town"],
      autocomplete: ["address-level2"],
      workdayId: ["addresssection_city", "city"]
    },
    {
      key: "state",
      category: "personal",
      subKey: "state",
      labels: ["state", "province", "region", "state / province"],
      names: ["state", "province", "region"],
      autocomplete: ["address-level1"],
      workdayId: ["addresssection_countrysubdivision", "state"]
    },
    {
      key: "postalCode",
      category: "personal",
      subKey: "postalCode",
      labels: ["zip", "postal code", "zip code", "post code", "pincode", "pin code"],
      names: ["zip", "zipcode", "postal_code", "postalcode", "postcode", "pincode"],
      autocomplete: ["postal-code"],
      workdayId: ["addresssection_postalcode", "postalcode"]
    },
    {
      key: "country",
      category: "personal",
      subKey: "country",
      labels: ["country", "country / region", "country of residence", "nationality", "country/region"],
      names: ["country", "country_code", "countrycode", "candidate_country"],
      autocomplete: ["country", "country-name"],
      workdayId: ["addresssection_country", "country"]
    },
    {
      key: "linkedin",
      category: "links",
      subKey: "linkedin",
      labels: ["linkedin", "linkedin profile", "linkedin url"],
      names: ["linkedin", "urls[linkedin]", "job_application[answers_attributes][linkedin]"],
      autocomplete: ["url"],
      workdayId: ["linkedin"]
    },
    {
      key: "github",
      category: "links",
      subKey: "github",
      labels: ["github", "github profile", "github url", "git"],
      names: ["github", "urls[github]"],
      autocomplete: ["url"],
      workdayId: ["github"]
    },
    {
      key: "portfolio",
      category: "links",
      subKey: "portfolio",
      labels: ["portfolio", "website", "personal site", "personal website", "portfolio url", "other website"],
      names: ["portfolio", "website", "urls[portfolio]", "urls[other]"],
      autocomplete: ["url"],
      workdayId: ["portfolio", "website"]
    },
    {
      key: "currentCompany",
      category: "experience",
      subKey: "currentCompany",
      labels: ["company", "current company", "most recent company", "current employer", "organization", "company name"],
      names: ["company", "org", "current_company", "employer", "company_name"],
      autocomplete: ["organization"],
      workdayId: ["company", "currentcompany", "employer", "organization"]
    },
    {
      key: "currentTitle",
      category: "experience",
      subKey: "currentTitle",
      labels: ["job title", "current title", "title", "current job title", "most recent role", "position", "current role"],
      names: ["job_title", "title", "current_title", "jobtitle", "position", "role"],
      autocomplete: ["organization-title"],
      workdayId: ["jobtitle", "title", "position"]
    },
    {
      key: "jobLocation",
      category: "experience",
      subKey: "location",
      labels: ["location", "job location", "company location", "office location"],
      names: ["job_location", "company_location", "location"],
      autocomplete: [],
      workdayId: ["location", "joblocation"]
    },
    {
      key: "currentlyWorkHere",
      category: "experience",
      subKey: "isCurrent",
      labels: ["i currently work here", "current employer", "current job", "present"],
      names: ["currently_work_here", "is_current", "currentlyworkhere"],
      autocomplete: [],
      workdayId: ["currentlyworkhere", "iscurrent"]
    },
    {
      key: "roleDescription",
      category: "experience",
      subKey: "description",
      labels: ["role description", "job description", "responsibilities", "description", "summary of duties"],
      names: ["role_description", "job_description", "description", "responsibilities"],
      autocomplete: [],
      workdayId: ["roledescription", "description", "jobdescription"]
    },
    {
      key: "startDate",
      category: "experience",
      subKey: "startDate",
      labels: ["from", "start date", "from date", "starting date", "commenced"],
      names: ["start_date", "from_date", "from", "startdate"],
      autocomplete: [],
      workdayId: ["startdate", "fromdate", "from"]
    },
    {
      key: "endDate",
      category: "experience",
      subKey: "endDate",
      labels: ["to", "end date", "to date", "ending date"],
      names: ["end_date", "to_date", "to", "enddate"],
      autocomplete: [],
      workdayId: ["enddate", "todate", "to"]
    },
    {
      key: "skills",
      category: "experience",
      subKey: "skills",
      labels: ["skills", "type to add skills", "key skills", "technical skills"],
      names: ["skills", "skill", "technologies"],
      autocomplete: [],
      workdayId: ["skills", "skillsearch", "skillssection"]
    },
    {
      key: "yearsOfExperience",
      category: "experience",
      subKey: "yearsOfExperience",
      labels: ["years of experience", "total years of experience", "years of relevant experience"],
      names: ["years_experience", "total_experience", "yoe"],
      autocomplete: [],
      workdayId: ["experience"]
    },
    {
      key: "workAuthorization",
      category: "presets",
      subKey: "workAuthorization",
      labels: [
        "authorized to work",
        "legally authorized to work",
        "legal right to work",
        "right to work",
        "work authorization",
        "eligible to work",
        "permission to work",
        "authorized to work in"
      ],
      names: ["authorized_to_work", "work_auth", "legal_authorization", "right_to_work"],
      autocomplete: [],
      workdayId: ["work_authorization"]
    },
    {
      key: "requireSponsorship",
      category: "presets",
      subKey: "requireSponsorship",
      labels: [
        "require sponsorship",
        "sponsorship now or in the future",
        "will you now or in the future require sponsorship",
        "visa sponsorship",
        "require visa"
      ],
      names: ["sponsorship", "require_sponsorship", "visa_sponsorship"],
      autocomplete: [],
      workdayId: ["sponsorship"]
    },
    {
      key: "noticePeriod",
      category: "presets",
      subKey: "noticePeriod",
      labels: [
        "notice period",
        "official notice period",
        "serving notice period",
        "notice period (days)",
        "availability",
        "earliest start date",
        "start date",
        "when can you start"
      ],
      names: ["notice_period", "start_date", "availability", "noticeperiod"],
      autocomplete: [],
      workdayId: ["notice_period", "startdate"]
    },
    {
      key: "salaryExpectations",
      category: "presets",
      subKey: "salaryExpectations",
      labels: [
        "salary expectation",
        "desired salary",
        "expected compensation",
        "compensation expectation",
        "target salary",
        "expected ctc",
        "current ctc",
        "fixed ctc",
        "ctc",
        "remuneration",
        "gross salary",
        "annual compensation",
        "desired compensation",
        "expected salary"
      ],
      names: ["salary", "desired_salary", "compensation", "expected_salary", "ctc", "expected_ctc", "current_ctc", "remuneration"],
      autocomplete: [],
      workdayId: ["salary", "compensation"]
    },
    {
      key: "willingToRelocate",
      category: "presets",
      subKey: "willingToRelocate",
      labels: ["willing to relocate", "relocation", "open to relocation"],
      names: ["relocate", "relocation", "willing_to_relocate"],
      autocomplete: [],
      workdayId: ["relocation"]
    },
    {
      key: "gender",
      category: "presets",
      subKey: "gender",
      labels: ["gender", "gender identity"],
      names: ["gender", "gender_identity"],
      autocomplete: ["sex"],
      workdayId: ["gender"]
    },
    {
      key: "veteranStatus",
      category: "presets",
      subKey: "veteranStatus",
      labels: ["veteran status", "are you a veteran", "military status", "protected veteran"],
      names: ["veteran", "veteran_status", "military"],
      autocomplete: [],
      workdayId: ["veteran"]
    },
    {
      key: "disabilityStatus",
      category: "presets",
      subKey: "disabilityStatus",
      labels: ["disability status", "disability", "do you have a disability"],
      names: ["disability", "disability_status"],
      autocomplete: [],
      workdayId: ["disability"]
    },
    {
      key: "school",
      category: "education",
      subKey: "school",
      labels: ["school or university", "school", "university", "college", "institution", "school name", "educational institution"],
      names: ["school", "university", "college", "institution", "school_name"],
      autocomplete: ["school"],
      workdayId: ["school", "university", "schoolsearch", "schoolname", "college"]
    },
    {
      key: "degree",
      category: "education",
      subKey: "degree",
      labels: ["degree", "degree level", "degree*", "level of education", "type of degree"],
      names: ["degree", "degree_level", "education_level"],
      autocomplete: [],
      workdayId: ["degree", "degreelevel", "educationdegree"]
    },
    {
      key: "fieldOfStudy",
      category: "education",
      subKey: "fieldOfStudy",
      labels: ["field of study", "major", "specialization", "area of study", "department", "discipline"],
      names: ["field_of_study", "major", "fieldofstudy", "specialization"],
      autocomplete: [],
      workdayId: ["fieldofstudy", "major", "studyfield"]
    },
    {
      key: "gpa",
      category: "education",
      subKey: "gpa",
      labels: ["overall result (gpa)", "overall result", "gpa", "grade point average", "cumulative gpa", "cgpa", "grade"],
      names: ["gpa", "overall_result", "cgpa", "grade"],
      autocomplete: [],
      workdayId: ["gpa", "overallresult", "grade"]
    },
    {
      key: "graduationYear",
      category: "education",
      subKey: "graduationYear",
      labels: ["to (actual or expected)", "graduation date", "graduation year", "end date", "to"],
      names: ["graduation_year", "graduation_date", "end_date", "to"],
      autocomplete: [],
      workdayId: ["enddate", "todate", "graduationyear"]
    }
  ],

  // Multi-tier Section Index Resolver for repeating application sections
  resolveElementSectionIndex(el, category = "experience", profile = null) {
    if (!el) return 0;

    // Tier 1: Explicit regex number extraction from heading, legend, container, name, id, or aria-label
    const container = el.closest ? el.closest('fieldset, [data-automation-id*="workExperience"], [data-automation-id*="education"], [data-automation-id*="experience"], .work-experience-item, .experience-section, .education-section, [data-testid*="experience"], [data-testid*="education"], .experience-card, .education-card, [role="group"], .form-section, .card') : null;

    let headingText = "";
    if (container && container.querySelector) {
      const legend = container.querySelector('legend, h1, h2, h3, h4, h5, .card-title, .section-title, [data-automation-id*="title"]');
      if (legend) headingText = (legend.innerText || legend.textContent || "").trim();
    }
    if (!headingText && el.closest) {
      let prev = el.previousElementSibling;
      while (prev && !headingText) {
        if (/^H[1-6]$/.test(prev.tagName) || (prev.classList && (prev.classList.contains('section-header') || prev.classList.contains('card-header')))) {
          headingText = (prev.innerText || prev.textContent || '').trim();
        }
        prev = prev.previousElementSibling;
      }
    }

    const autoId = (el.getAttribute && (el.getAttribute('data-automation-id') || '')) || '';
    const containerAutoId = (container && container.getAttribute && container.getAttribute('data-automation-id')) || '';
    const nameAttr = (el.getAttribute && (el.getAttribute('name') || '')) || '';
    const idAttr = (el.getAttribute && (el.getAttribute('id') || '')) || '';
    const ariaLabel = (el.getAttribute && (el.getAttribute('aria-label') || '')) || '';

    // Tier 1a: Check human heading/legend text FIRST (1-based, e.g. "Work Experience 2", "Experience #2")
    if (headingText) {
      const heading1Based = headingText.match(/(?:work\s*experience|job|employment|experience|position|education|school|degree|project|reference)[^0-9\n\r]{0,15}#?\s*([1-9]\d*)(?:[-_.\s\]\)]|\b)/i);
      if (heading1Based && heading1Based[1]) {
        const num = parseInt(heading1Based[1], 10);
        if (num >= 1 && num <= 20) return num - 1;
      }
    }

    // Tier 1b: Check bracket/array index notation in name/id (0-based, e.g. experience[1], experiences[2])
    const bracketMatch = `${nameAttr} ${idAttr}`.match(/(?:experience|education|project|job)s?[\[\._-]([0-9]+)[\]\._-]/i);
    if (bracketMatch && bracketMatch[1]) {
      const num = parseInt(bracketMatch[1], 10);
      if (num >= 0 && num <= 20) return num;
    }

    // Tier 1c: Check Workday automation ID or trailing suffix (0-based, e.g. workExperienceSection-1)
    const trailingAuto = `${containerAutoId} ${autoId}`.match(/[-_]([0-9]+)$/);
    if (trailingAuto && trailingAuto[1]) {
      const num = parseInt(trailingAuto[1], 10);
      if (num > 0) return num;
    }

    // Tier 1d: Check remaining text signals for explicit 1-based numbering
    const otherSignals = `${ariaLabel} ${autoId}`;
    const explicit1Based = otherSignals.match(/(?:work\s*experience|job|employment|experience|position|education|school|degree|project|reference)[^0-9\n\r]{0,15}#?\s*([1-9]\d*)(?:[-_.\s\]\)]|\b)/i);
    if (explicit1Based && explicit1Based[1]) {
      const num = parseInt(explicit1Based[1], 10);
      if (num >= 1 && num <= 20) return num - 1;
    }

    // Tier 2: Sibling Company / Title matching against Profile items
    if (profile && category === "experience" && container && container.querySelectorAll) {
      const compInput = container.querySelector('input[data-automation-id*="company"], input[name*="company" i], input[id*="company" i], input[placeholder*="company" i]');
      const titleInput = container.querySelector('input[data-automation-id*="title" i], input[name*="title" i], input[id*="title" i], input[placeholder*="title" i], input[data-automation-id*="jobTitle" i]');
      const compVal = compInput ? (compInput.value || "").trim().toLowerCase() : "";
      const titleVal = titleInput ? (titleInput.value || "").trim().toLowerCase() : "";

      if ((compVal || titleVal) && profile.experience?.items && profile.experience.items.length > 1) {
        for (let i = 0; i < profile.experience.items.length; i++) {
          const item = profile.experience.items[i];
          const itemComp = (item.company || "").toLowerCase();
          const itemTitle = (item.title || "").toLowerCase();
          if (compVal && itemComp && (compVal.includes(itemComp) || itemComp.includes(compVal))) {
            return i;
          }
          if (titleVal && itemTitle && (titleVal.includes(itemTitle) || itemTitle.includes(titleVal))) {
            return i;
          }
        }
      }
    }

    // Tier 3: Global Document Card Enumeration
    if (typeof document !== 'undefined') {
      const nodeContains = (parent, child) => {
        if (!parent || !child) return false;
        if (parent === child) return true;
        if (typeof parent.contains === 'function') return parent.contains(child);
        let cur = child.parentElement;
        while (cur) {
          if (cur === parent) return true;
          cur = cur.parentElement;
        }
        return false;
      };

      const selector = category === "education"
        ? '[data-automation-id*="education"], .education-item, .education-card, .education-section, [data-testid*="education"]'
        : '[data-automation-id*="workExperience"], [data-automation-id*="experience"], .work-experience-item, .experience-card, .experience-section, [data-testid*="experience"]';

      const allCards = Array.from(document.querySelectorAll(selector));
      if (allCards.length > 1) {
        const foundIdx = allCards.findIndex(c => nodeContains(c, el));
        if (foundIdx >= 0) return foundIdx;
      }

      // If cards are fieldsets
      if (container && container.tagName === 'FIELDSET') {
        const allFieldsets = Array.from(document.querySelectorAll('fieldset'));
        const fieldsetsWithSameCategory = allFieldsets.filter(fs => {
          const txt = (fs.innerText || fs.textContent || '').toLowerCase();
          return category === "education"
            ? (txt.includes('education') || txt.includes('degree') || txt.includes('school'))
            : (txt.includes('experience') || txt.includes('employer') || txt.includes('job'));
        });
        if (fieldsetsWithSameCategory.length > 1) {
          const fsIdx = fieldsetsWithSameCategory.findIndex(fs => nodeContains(fs, el));
          if (fsIdx >= 0) return fsIdx;
        }
      }

      // Tier 4: Field Repetition Enumeration
      if (el.tagName === 'TEXTAREA') {
        const allTextareas = Array.from(document.querySelectorAll('textarea'));
        const descTextareas = allTextareas.filter(t => {
          const desc = `${t.getAttribute('data-automation-id') || ''} ${t.getAttribute('name') || ''} ${t.getAttribute('id') || ''} ${t.getAttribute('placeholder') || ''}`.toLowerCase();
          return /description|responsibilities|duties|summary/i.test(desc);
        });
        if (descTextareas.length > 1) {
          const tIdx = descTextareas.indexOf(el);
          if (tIdx >= 0) return tIdx;
        }
      }
    }

    return 0;
  },

  // Universal Semantic Parent-Scope Detector (Work Experience, Education, Projects, References)
  detectParentScope(el, textSignals = [], sectionIndex = null, profile = null) {
    if (!el) return (sectionIndex !== null && sectionIndex > 0) ? `Work Experience ${sectionIndex + 1}` : "Personal Information";

    const container = el.closest ? el.closest('fieldset, [data-automation-id*="workExperience"], [data-automation-id*="education"], [data-automation-id*="experience"], .work-experience-item, .experience-section, .education-section, [data-testid*="experience"], [data-testid*="education"], .experience-card, .education-card, [role="group"], .form-section, .card') : null;

    let headingText = "";
    if (container && container.querySelector) {
      const legend = container.querySelector('legend, h1, h2, h3, h4, h5, .card-title, .section-title, [data-automation-id*="title"]');
      if (legend && (legend.innerText || legend.textContent)) {
        headingText = (legend.innerText || legend.textContent).trim();
      }
    }

    if (!headingText && el.closest) {
      let prev = el.previousElementSibling;
      while (prev && !headingText) {
        if (/^H[1-6]$/.test(prev.tagName) || (prev.classList && (prev.classList.contains('section-header') || prev.classList.contains('card-header')))) {
          headingText = (prev.innerText || prev.textContent || '').trim();
        }
        prev = prev.previousElementSibling;
      }
    }

    const nameOrId = `${el.name || ''} ${el.id || ''} ${(el.getAttribute && el.getAttribute('name')) || ''} ${(el.getAttribute && el.getAttribute('id')) || ''}`;
    const autoId = (el.getAttribute && (el.getAttribute('data-automation-id') || '')) || '';
    const containerAutoId = (container && container.getAttribute && container.getAttribute('data-automation-id')) || '';
    const containerNameOrId = container ? `${container.name || ''} ${container.id || ''} ${(container.getAttribute && container.getAttribute('name')) || ''} ${(container.getAttribute && container.getAttribute('id')) || ''}` : '';
    const signalsText = Array.isArray(textSignals) ? textSignals.join(' ') : String(textSignals || '');
    const combined = `${headingText} ${nameOrId} ${autoId} ${containerNameOrId} ${containerAutoId} ${container?.className || ""} ${signalsText}`.toLowerCase();

    // Determine category
    let category = "personal";
    if (combined.includes("work experience") || combined.includes("job experience") || combined.includes("employment history") || combined.includes("work history") || combined.includes("experience") || combined.includes("role description") || combined.includes("job title") || combined.includes("employer") || combined.includes("responsibilities")) {
      category = "experience";
    } else if (combined.includes("education") || combined.includes("academic") || combined.includes("school") || combined.includes("university") || combined.includes("degree") || combined.includes("field of study") || combined.includes("gpa")) {
      category = "education";
    } else if (combined.includes("project")) {
      category = "project";
    } else if (combined.includes("reference")) {
      category = "reference";
    }

    if (category === "personal") {
      return (sectionIndex !== null && sectionIndex > 0) ? `Section ${sectionIndex + 1}` : "Personal Information";
    }

    // Resolve accurate sectionIndex (0-based)
    let resolvedIndex = (sectionIndex !== null && sectionIndex !== undefined && sectionIndex >= 0) ? sectionIndex : null;
    if (resolvedIndex === null) {
      resolvedIndex = this.resolveElementSectionIndex(el, category, profile);
    } else {
      // Even if sectionIndex was passed as 0, check if the element has an explicit number in heading/attributes
      const explicitIdx = this.resolveElementSectionIndex(el, category, profile);
      if (explicitIdx > 0 && resolvedIndex === 0) {
        resolvedIndex = explicitIdx;
      }
    }

    if (category === "experience") return `Work Experience ${resolvedIndex + 1}`;
    if (category === "education") return `Education ${resolvedIndex + 1}`;
    if (category === "project") return `Project ${resolvedIndex + 1}`;
    if (category === "reference") return `Reference ${resolvedIndex + 1}`;

    return resolvedIndex > 0 ? `Section ${resolvedIndex + 1}` : "Personal Information";
  },

  // Extract all text cues from an element
  getElementDescriptor(el) {
    const textSignals = [];

    // 1. Aria-labelledby (Workday's primary accessible pattern)
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        if (id) {
          const lbl = document.getElementById(id);
          if (lbl) {
            const txt = (lbl.innerText || lbl.textContent || '').trim();
            if (txt) textSignals.push(txt);
          }
        }
      }
    }

    // 2. Associated label via 'for' attribute
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) {
        const txt = (label.innerText || label.textContent || '').trim();
        if (txt) textSignals.push(txt);
      }
    }

    // 3. Parent label if input is wrapped in <label>
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const txt = (parentLabel.innerText || parentLabel.textContent || '').trim();
      if (txt) textSignals.push(txt);
    }

    // 4. Parent container heading or formfield (CRITICAL: check parentElement so el doesn't self-match)
    const container = el.parentElement?.closest('[data-automation-id*="formField"], [data-automation-id*="FormField"], [data-uxi-formfield="true"], .field, .form-group, .application-question, [class*="formField"], [class*="form-field"], [class*="formItem"], .css-1');
    if (container) {
      const heading = container.querySelector('label, .label, .field-label, legend, span[id*="label"], [data-automation-id*="label"], [class*="Label"], h4, h5');
      if (heading) {
        const txt = (heading.innerText || heading.textContent || '').trim();
        if (txt) textSignals.push(txt);
      }
    }

    // 5. Preceding sibling label or span
    let prev = el.previousElementSibling;
    while (prev) {
      if (prev.matches && prev.matches('label, span, div, p')) {
        const txt = (prev.innerText || prev.textContent || '').trim();
        if (txt && txt.length > 0 && txt.length < 80) {
          textSignals.push(txt);
          break;
        }
      }
      prev = prev.previousElementSibling;
    }

    // 6. Aria-label / Title
    const ariaLabel = el.getAttribute('aria-label') || '';
    if (ariaLabel) textSignals.push(ariaLabel.trim());
    const title = el.getAttribute('title') || '';
    if (title) textSignals.push(title.trim());

    // 7. Element attributes
    const name = el.getAttribute('name') || '';
    const id = el.getAttribute('id') || '';
    const placeholder = el.getAttribute('placeholder') || '';
    const autocomplete = el.getAttribute('autocomplete') || '';
    const dataAutomationId = el.getAttribute('data-automation-id') || el.getAttribute('data-uxi-element-id') || '';
    const containerAutomationId = container?.getAttribute('data-automation-id') || container?.getAttribute('data-uxi-element-id') || '';
    const fullAutomationId = `${dataAutomationId} ${containerAutomationId}`.trim().toLowerCase();

    const isRequired = !!(
      (el.hasAttribute && el.hasAttribute('required')) ||
      (el.getAttribute && el.getAttribute('aria-required') === 'true') ||
      textSignals.some(s => s.includes('*') || /\brequired\b/i.test(s))
    );
    const isOptional = !isRequired || textSignals.some(s => /\boptional\b/i.test(s));

    return {
      element: el,
      tag: el.tagName.toLowerCase(),
      type: (el.getAttribute('type') || 'text').toLowerCase(),
      name: name.toLowerCase(),
      id: id.toLowerCase(),
      placeholder: placeholder.toLowerCase(),
      ariaLabel: ariaLabel.toLowerCase(),
      autocomplete: autocomplete.toLowerCase(),
      dataAutomationId: fullAutomationId,
      combinedLabels: textSignals.join(' ').toLowerCase(),
      isRequired,
      isOptional,
      parentScope: this.detectParentScope(el, textSignals)
    };
  },

  // Match an element against standard fields, custom fields, and learned memory
  matchElement(descriptor, profile, sectionIndex = 0) {
    if (!profile) return { matched: false, descriptor };

    const combined = `${descriptor.combinedLabels} ${descriptor.name} ${descriptor.id} ${descriptor.placeholder} ${descriptor.ariaLabel} ${descriptor.dataAutomationId}`;

    // 0. Check Ignored Optional Fields first (user explicitly skipped or ignored)
    if (profile.ignoredOptionalFields && profile.ignoredOptionalFields.length) {
      for (const ign of profile.ignoredOptionalFields) {
        const pattern = (ign.pattern || ign.label || "").toLowerCase().trim();
        if (pattern && pattern.length >= 2 && combined.includes(pattern)) {
          return {
            matched: false,
            ignored: true,
            label: ign.label || pattern,
            reason: "User marked this field to be ignored"
          };
        }
        for (const kw of (ign.keywords || [])) {
          const cleanKw = String(kw).toLowerCase().trim();
          if (cleanKw && cleanKw.length >= 2 && combined.includes(cleanKw)) {
            return {
              matched: false,
              ignored: true,
              label: ign.label || cleanKw,
              reason: "User marked this field to be ignored"
            };
          }
        }
      }
    }

    // 0b. Check Predictive Ignored Fields from Behavioral Feedback Loop
    if (profile.fieldInteractionStats && !descriptor.isRequired) {
      for (const [key, stats] of Object.entries(profile.fieldInteractionStats)) {
        if (stats.predictedIgnored && stats.confidence >= 0.7) {
          const pLabel = (stats.label || key).toLowerCase();
          if (combined.includes(pLabel) || isNinetyPercentMatch(descriptor.combinedLabels, pLabel)) {
            return {
              matched: false,
              ignored: true,
              predicted: true,
              label: stats.label || pLabel,
              reason: `Predicted ignored (skipped ${stats.skippedCount} times in past applications)`
            };
          }
        }
      }
    }

    // 1. Check Company-Specific Dynamic Rules first (e.g. Prior employment / Former employee queries)
    if (profile.dynamicFields && profile.dynamicFields.length) {
      const currentTargetCompany = extractTargetCompany(descriptor.url, descriptor.pageTitle);
      const isCompanyQuestion = combined.includes("worked at") || combined.includes("worked for") || 
                                combined.includes("former employee") || combined.includes("previously employed") ||
                                combined.includes("previous employee") || combined.includes("worked here before");

      for (const df of profile.dynamicFields) {
        if (df.companyRules && (isCompanyQuestion || df.category === "Company-Specific")) {
          let isMatch = false;
          for (const alias of (df.aliases || [])) {
            const cleanAlias = String(alias).toLowerCase().trim();
            if (cleanAlias.length >= 2 && (combined.includes(cleanAlias) || isNinetyPercentMatch(descriptor.combinedLabels, cleanAlias))) {
              isMatch = true;
              break;
            }
          }

          if (isMatch) {
            let resolvedValue = df.companyRules.default || "No";
            let companyRuleFound = false;

            for (const [compKey, ruleVal] of Object.entries(df.companyRules)) {
              if (compKey.toLowerCase() === "default") continue;
              if (isNinetyPercentMatch(currentTargetCompany, compKey) || combined.includes(compKey.toLowerCase())) {
                resolvedValue = ruleVal;
                companyRuleFound = true;
                break;
              }
            }

            if (!companyRuleFound && currentTargetCompany && profile.experience?.items) {
              for (const exp of profile.experience.items) {
                if (exp.company && isNinetyPercentMatch(currentTargetCompany, exp.company)) {
                  resolvedValue = "Yes";
                  break;
                }
              }
            }

            return {
              matched: true,
              source: "dynamicField",
              key: df.canonicalKey || df.label,
              value: resolvedValue,
              label: df.label,
              confidence: 0.95
            };
          }
        }
      }
    }

    // 2. Check Standard Fields by specificity (Handles Workday automation IDs, Lever names, Greenhouse IDs, and multi-experience sectionIndex)
    const matches = [];

    for (const def of this.FIELD_DEFINITIONS) {
      // Check autocomplete match (highest accuracy)
      if (descriptor.autocomplete && def.autocomplete.includes(descriptor.autocomplete)) {
        const val = this.getProfileValue(profile, def.category, def.subKey, sectionIndex);
        if (val) return { matched: true, source: "standard", def, value: val, confidence: 1.0 };
      }

      // Check Workday automation ID
      if (descriptor.dataAutomationId) {
        for (const wid of def.workdayId) {
          if (descriptor.dataAutomationId === wid || descriptor.dataAutomationId.includes(wid)) {
            const val = this.getProfileValue(profile, def.category, def.subKey, sectionIndex);
            if (val) return { matched: true, source: "standard", def, value: val, confidence: 0.95 };
          }
        }
      }

      // Check exact name / ID match
      for (const n of def.names) {
        if (descriptor.name === n || descriptor.id === n) {
          const val = this.getProfileValue(profile, def.category, def.subKey, sectionIndex);
          if (val) return { matched: true, source: "standard", def, value: val, confidence: 0.95 };
        }
      }

      // Check label phrase matches with word boundaries
      for (const lbl of def.labels) {
        if (lbl === "state" && (descriptor.combinedLabels.includes("united states") || descriptor.combinedLabels.includes("statement"))) {
          if (!descriptor.combinedLabels.includes("state /") && !descriptor.combinedLabels.includes("state/")) {
            continue;
          }
        }

        if ((lbl === "degree" || lbl === "degree*") && (descriptor.combinedLabels.includes("higher degree") || descriptor.combinedLabels.includes("highest degree"))) {
          continue;
        }

        if (lbl === "name" && (descriptor.combinedLabels.includes("middle") || descriptor.combinedLabels.includes("first") || descriptor.combinedLabels.includes("last") || descriptor.combinedLabels.includes("company") || descriptor.combinedLabels.includes("school") || descriptor.combinedLabels.includes("employer") || descriptor.combinedLabels.includes("organization"))) {
          continue;
        }

        const isShort = lbl.length <= 5;
        const regex = new RegExp(isShort ? `\\b${lbl}\\b` : lbl, 'i');

        if (regex.test(descriptor.combinedLabels) || regex.test(descriptor.ariaLabel) || regex.test(descriptor.placeholder)) {
          const val = this.getProfileValue(profile, def.category, def.subKey, sectionIndex);
          if (val) {
            matches.push({
              matched: true,
              source: "standard",
              def,
              value: val,
              matchLength: lbl.length,
              confidence: 0.85
            });
          }
        }
      }
    }

    if (matches.length > 0) {
      matches.sort((a, b) => b.matchLength - a.matchLength);
      return matches[0];
    }

    // 3. Check Dynamic Knowledge Store (Aliases, Nested Entities & Learned Fields)
    if (profile.dynamicFields && profile.dynamicFields.length) {
      for (const df of profile.dynamicFields) {
        let isAliasMatch = false;

        for (const alias of (df.aliases || [])) {
          const cleanAlias = String(alias).toLowerCase().trim();
          if (cleanAlias.length >= 2 && (combined.includes(cleanAlias) || isNinetyPercentMatch(descriptor.combinedLabels, cleanAlias))) {
            isAliasMatch = true;
            break;
          }
        }

        if (isAliasMatch) {
          let resolvedValue = df.value;

          // Universal Hierarchical Parent-Context & Nested Details Resolution
          if (df.nestedDetails && typeof df.nestedDetails === 'object') {
            const parentScope = this.detectParentScope(descriptor.element, descriptor.combinedLabels, sectionIndex, profile) || descriptor.parentScope;

            // 1. Direct Parent Scope lookup (e.g. df.nestedDetails["Work Experience 2"] or ["Education 1"])
            if (df.nestedDetails[parentScope] && typeof df.nestedDetails[parentScope] === 'object') {
              for (const [subKey, subVal] of Object.entries(df.nestedDetails[parentScope])) {
                if (subVal && (combined.includes(subKey.toLowerCase()) || isNinetyPercentMatch(descriptor.combinedLabels, subKey))) {
                  resolvedValue = subVal;
                  break;
                }
              }
            }
            // 2. Direct Container Entity (e.g. df.label === parentScope or canonicalKey matches parentScope)
            else if (df.label === parentScope || (df.canonicalKey && df.canonicalKey.includes(parentScope.toLowerCase().replace(/[^a-z0-9]/g, '_')))) {
              for (const [subKey, subVal] of Object.entries(df.nestedDetails)) {
                if (subVal && (combined.includes(subKey.toLowerCase()) || isNinetyPercentMatch(descriptor.combinedLabels, subKey))) {
                  resolvedValue = subVal;
                  break;
                }
              }
            }
            // 3. Section-indexed numeric fallback (e.g. df.nestedDetails["1"] or df.nestedDetails[String(sectionIndex + 1)])
            else if (df.nestedDetails[String(sectionIndex + 1)] && typeof df.nestedDetails[String(sectionIndex + 1)] === 'object') {
              for (const [subKey, subVal] of Object.entries(df.nestedDetails[String(sectionIndex + 1)])) {
                if (subVal && (combined.includes(subKey.toLowerCase()) || isNinetyPercentMatch(descriptor.combinedLabels, subKey))) {
                  resolvedValue = subVal;
                  break;
                }
              }
            }
            // 4. Role descriptions specific handler
            else if (df.canonicalKey === "experience.role_descriptions" || df.category === "Work Experience") {
              const expSectionKey = `Work Experience ${sectionIndex + 1}`;
              if (df.nestedDetails[expSectionKey]?.roleDescription) {
                resolvedValue = df.nestedDetails[expSectionKey].roleDescription;
              } else if (df.nestedDetails[String(sectionIndex + 1)]?.roleDescription) {
                resolvedValue = df.nestedDetails[String(sectionIndex + 1)].roleDescription;
              } else if (sectionIndex === 0 && df.nestedDetails["Work Experience 1"]?.roleDescription) {
                resolvedValue = df.nestedDetails["Work Experience 1"].roleDescription;
              } else {
                resolvedValue = "";
              }
            }
            // 5. Semantic field name fallbacks (major, degree, gpa, etc.)
            else if (combined.includes("major") || combined.includes("field of study") || combined.includes("discipline") || combined.includes("specialization")) {
              resolvedValue = df.nestedDetails.major || df.nestedDetails.fieldOfStudy || resolvedValue;
            } else if (combined.includes("degree") && !combined.includes("highest degree") && !combined.includes("degree level") && df.nestedDetails.degree) {
              resolvedValue = df.nestedDetails.degree;
            } else if ((combined.includes("gpa") || combined.includes("grade")) && df.nestedDetails.gpa) {
              resolvedValue = df.nestedDetails.gpa;
            } else if ((combined.includes("graduation") || combined.includes("year")) && df.nestedDetails.graduationYear) {
              resolvedValue = df.nestedDetails.graduationYear;
            } else if ((combined.includes("institution") || combined.includes("university") || combined.includes("college") || combined.includes("school")) && df.nestedDetails.institution) {
              resolvedValue = df.nestedDetails.institution;
            }
          }

          if (resolvedValue !== undefined && resolvedValue !== "") {
            return {
              matched: true,
              source: "dynamicField",
              key: df.canonicalKey || df.label,
              value: resolvedValue,
              label: df.label,
              confidence: df.stats?.confidence || 0.95
            };
          }
        }
      }
    }

    // 4. Check Learned Memory from AI Feedback Loop (user approved previously)
    if (profile.learnedMemory && profile.learnedMemory.length) {
      for (const item of profile.learnedMemory) {
        if (!item) continue;
        for (const kw of item.questionKeywords || []) {
          if (combined.includes(kw.toLowerCase())) {
            return {
              matched: true,
              source: "learnedMemory",
              key: item.fieldLabel,
              value: item.answer,
              label: item.fieldLabel,
              confidence: 0.95
            };
          }
        }
      }
    }

    // 5. Check Custom Fields
    if (profile.customFields && profile.customFields.length) {
      for (const field of profile.customFields) {
        if (!field) continue;
        for (const kw of field.keywords || []) {
          if (kw && combined.includes(kw.toLowerCase())) {
            return {
              matched: true,
              source: "customField",
              key: field.label,
              value: field.value,
              label: field.label,
              confidence: 0.9
            };
          }
        }
      }
    }

    return { matched: false, descriptor };
  },

  // Helper to extract value safely from nested profile, supporting sequential items
  getProfileValue(profile, category, subKey, index = 0) {
    if (!profile) return "";
    if (category === "personal") return profile.personal?.[subKey] || "";
    if (category === "links") return profile.links?.[subKey] || "";
    if (category === "experience") {
      const items = profile.experience?.items || [];
      if (items.length > index) {
        const item = items[index];
        if (subKey === "currentCompany" || subKey === "company") return item.company || profile.experience?.currentCompany || "";
        if (subKey === "currentTitle" || subKey === "title") return item.title || profile.experience?.currentTitle || "";
        if (subKey === "location" || subKey === "jobLocation") return item.location || profile.experience?.location || profile.personal?.location || "";
        if (subKey === "isCurrent" || subKey === "currentlyWorkHere") return item.isCurrent !== undefined ? item.isCurrent : (index === 0);
        if (subKey === "roleDescription" || subKey === "description") return item.description || "";
        if (subKey === "startDate" || subKey === "fromDate") return item.startDate || "";
        if (subKey === "endDate" || subKey === "toDate") return item.endDate || (item.isCurrent ? "Present" : "");
      }
      if (subKey === "location" || subKey === "jobLocation") return profile.experience?.location || profile.personal?.location || profile.personal?.city || "";
      if (subKey === "isCurrent" || subKey === "currentlyWorkHere") return true;
      if (subKey === "roleDescription" || subKey === "description") return "";
      return profile.experience?.[subKey] || "";
    }
    if (category === "education") {
      const items = profile.education?.items || [];
      if (items.length > index) {
        const item = items[index];
        if (subKey === "school") return item.school || profile.education?.school || "";
        if (subKey === "degree") return item.degree || profile.education?.degree || "";
        if (subKey === "fieldOfStudy") return item.fieldOfStudy || profile.education?.fieldOfStudy || "";
        if (subKey === "graduationYear") return item.graduationYear || profile.education?.graduationYear || "";
        if (subKey === "gpa") return item.gpa || profile.education?.gpa || "";
      }
      if (subKey === "graduationYear") return profile.education?.graduationYear || "";
      return profile.education?.[subKey] || "";
    }
    if (category === "presets") return profile.presets?.[subKey] || "";
    return "";
  },

  // Detect ATS portal type from URL or hostname
  detectPortalType(hostOrUrl = "") {
    const str = String(hostOrUrl || (typeof window !== 'undefined' ? window.location?.hostname : "")).toLowerCase();
    if (str.includes("myworkdayjobs.com") || str.includes("workday")) return "workday";
    if (str.includes("greenhouse.io")) return "greenhouse";
    if (str.includes("lever.co")) return "lever";
    if (str.includes("ashbyhq.com")) return "ashby";
    if (str.includes("taleo.net") || str.includes("taleo")) return "taleo";
    if (str.includes("smartrecruiters.com")) return "smartrecruiters";
    if (str.includes("jobvite.com")) return "jobvite";
    if (str.includes("bamboohr.com")) return "bamboohr";
    if (str.includes("icims.com")) return "icims";
    if (str.includes("successfactors.com")) return "successfactors";
    if (str.includes("avature.net")) return "avature";
    if (str.includes("oraclecloud.com") || str.includes("oracle")) return "oracle";
    if (str.includes("paylocity.com")) return "paylocity";
    if (str.includes("rippling-ats.com") || str.includes("rippling")) return "rippling";
    if (str.includes("ziprecruiter.com")) return "ziprecruiter";
    return "generic";
  },

  // Detect if current page is an applicant tracking system or career application form
  isJobApplicationPage(url = "", doc = null) {
    const targetUrl = String(url || (typeof window !== 'undefined' ? window.location?.href : "")).toLowerCase();
    let hostname = "";
    let pathname = "";
    try {
      if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
        const parsed = new URL(targetUrl);
        hostname = parsed.hostname.toLowerCase();
        pathname = parsed.pathname.toLowerCase();
      } else {
        hostname = (typeof window !== 'undefined' ? window.location?.hostname : "") || "";
        pathname = (typeof window !== 'undefined' ? window.location?.pathname : "") || targetUrl;
      }
    } catch (e) {
      hostname = (typeof window !== 'undefined' ? window.location?.hostname : "") || "";
      pathname = targetUrl;
    }

    // 1. Explicit Exclusions: Non-job entertainment, video, media, social, messaging, and search platforms
    const excludedHosts = [
      "youtube.com", "youtu.be", "netflix.com", "twitch.tv", "spotify.com",
      "reddit.com", "twitter.com", "x.com", "instagram.com", "facebook.com",
      "tiktok.com", "pinterest.com", "wikipedia.org", "chatgpt.com", "claude.ai",
      "github.com", "gitlab.com", "stackoverflow.com", "quora.com", "vimeo.com"
    ];
    for (const ex of excludedHosts) {
      if (hostname === ex || hostname.endsWith("." + ex)) {
        // Unless it's an explicit career subdomain like careers.youtube.com or jobs.netflix.com
        if (!hostname.startsWith("careers.") && !hostname.startsWith("jobs.")) {
          return false;
        }
      }
    }

    // General search and portal domains unless explicit careers subdomain/path
    if (hostname === "google.com" || hostname.endsWith(".google.com") || hostname === "amazon.com" || hostname.endsWith(".amazon.com") || hostname.includes("bing.com") || hostname.includes("yahoo.com")) {
      if (!hostname.startsWith("careers.") && !hostname.startsWith("jobs.") && !pathname.includes("/careers") && !pathname.includes("/jobs")) {
        return false;
      }
    }

    // 2. Known ATS Portals (Workday, Greenhouse, Lever, Ashby, Taleo, iCIMS, SmartRecruiters, etc.)
    const portal = this.detectPortalType(hostname || targetUrl);
    if (portal && portal !== "generic") {
      return true;
    }

    // 3. Career Subdomains (e.g. careers.uber.com, jobs.apple.com, apply.workable.com)
    if (
      hostname.startsWith("careers.") ||
      hostname.startsWith("career.") ||
      hostname.startsWith("jobs.") ||
      hostname.startsWith("job.") ||
      hostname.startsWith("apply.") ||
      hostname.startsWith("hiring.") ||
      hostname.startsWith("talent.")
    ) {
      return true;
    }

    // 4. Career and Job Application URL Paths
    const careerPathRegex = /\/(?:careers?|jobs?|apply|application|openings|positions|vacanc(?:y|ies)|job-detail|job-postings?)(?:[\/?#\-_\d]|$)/i;
    if (careerPathRegex.test(pathname) || careerPathRegex.test(targetUrl)) {
      return true;
    }

    // 5. Test/Simulation environment
    if (targetUrl.includes("test-forms.html") || (hostname === "localhost" && (pathname.includes("job") || pathname.includes("career") || pathname.includes("apply") || pathname.includes("test-form")))) {
      return true;
    }

    // 6. DOM Heuristics: Check document for actual job application indicators
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (d) {
      // (a) ATS specific container attributes
      if (d.querySelector && d.querySelector(
        '[data-automation-id*="workExperience"], [data-automation-id*="education"], [data-automation-id*="application"], [data-automation-id*="candidate"], #application-form, .application-form, .job-application, form[action*="job"], form[action*="apply"], form[action*="career"], [class*="jobApplication"], [id*="jobApplication"]'
      )) {
        return true;
      }

      // (b) File upload for resume / CV
      if (d.querySelectorAll) {
        const fileInputs = Array.from(d.querySelectorAll('input[type="file"]'));
        for (const fi of fileInputs) {
          const desc = `${fi.id || ''} ${fi.name || ''} ${(fi.getAttribute && fi.getAttribute('aria-label')) || ''} ${(fi.getAttribute && fi.getAttribute('placeholder')) || ''}`.toLowerCase();
          if (desc.includes("resume") || desc.includes("cv") || desc.includes("curriculum")) {
            return true;
          }
        }
      }

      // (c) Form fields check: at least 2 fields matching job application cues (e.g. name + email + resume/work auth/experience/linkedin)
      if (d.querySelectorAll) {
        const inputs = Array.from(d.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'));
        let matchedJobFields = 0;
        let hasCareerSpecificField = false;

        for (const el of inputs.slice(0, 30)) {
          const desc = this.getElementDescriptor ? this.getElementDescriptor(el) : {};
          const lbl = `${desc.combinedLabels || ''} ${desc.name || ''} ${desc.id || ''} ${desc.placeholder || ''}`.toLowerCase();

          // Career specific cues
          if (
            lbl.includes("resume") || lbl.includes("curriculum vitae") ||
            lbl.includes("work authorization") || lbl.includes("sponsorship") ||
            lbl.includes("linkedin") || lbl.includes("portfolio") ||
            lbl.includes("years of experience") || lbl.includes("expected salary") ||
            lbl.includes("notice period") || lbl.includes("role description") ||
            lbl.includes("graduation year") || lbl.includes("cover letter")
          ) {
            hasCareerSpecificField = true;
            matchedJobFields++;
          } else if (
            lbl.includes("first name") || lbl.includes("last name") ||
            lbl.includes("email") || lbl.includes("phone") ||
            lbl.includes("degree") || lbl.includes("company") ||
            lbl.includes("job title") || lbl.includes("school")
          ) {
            matchedJobFields++;
          }

          if (hasCareerSpecificField && matchedJobFields >= 2) {
            return true;
          }
        }
      }
    }

    return false;
  },

  // Extract target employer company
  extractTargetCompany(contextUrl = "", pageTitle = "") {
    return extractTargetCompany(contextUrl, pageTitle);
  },

  // Detect Complex UI Elements across modern ATS platforms (Rich text, comboboxes, multi-tag, segmented pills, switches, split dates/phones/salaries, sliders, cascading)
  detectComplexElement(el) {
    if (!el) return null;
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    const type = el.type ? el.type.toLowerCase() : "";
    const name = el.name ? el.name.toLowerCase() : "";
    const id = el.id ? el.id.toLowerCase() : "";
    const placeholder = el.placeholder ? el.placeholder.toLowerCase() : "";
    const ariaLabel = el.getAttribute ? (el.getAttribute('aria-label') || '').toLowerCase() : "";
    const role = el.getAttribute ? (el.getAttribute('role') || '').toLowerCase() : "";
    const autoId = el.getAttribute ? (el.getAttribute('data-automation-id') || el.getAttribute('data-uxi-element-id') || '').toLowerCase() : "";
    const isContentEditable = !!(el.isContentEditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true'));

    // 1. Rich Text / ContentEditable Editors (ProseMirror, Quill, Draft.js, Slate, CKEditor, Trix)
    if (
      isContentEditable || tag === 'trix-editor' ||
      (el.classList && (
        el.classList.contains('ProseMirror') ||
        el.classList.contains('ql-editor') ||
        el.classList.contains('public-DraftEditor-content') ||
        el.classList.contains('ck-content') ||
        el.classList.contains('tox-edit-area')
      )) ||
      (el.getAttribute && el.getAttribute('data-slate-editor') === 'true')
    ) {
      return {
        isComplex: true,
        type: "rich_text"
      };
    }

    // 2. Custom Styled Comboboxes & Autocomplete Dropdowns (Headless UI, React-Select, Select2, Ashby, Workday)
    if (
      role === 'combobox' ||
      (el.getAttribute && el.getAttribute('aria-haspopup') === 'listbox') ||
      (el.classList && el.classList.contains('select2-selection')) ||
      (el.closest && el.closest('.select2-container, [class*="react-select"], [class*="Select-control"], [class*="ant-select"]'))
    ) {
      return {
        isComplex: true,
        type: "custom_combobox",
        container: el.closest ? (el.closest('.select2-container, [class*="react-select"], [class*="Select-control"], [role="combobox"]') || el) : el
      };
    }

    // 3. Multi-tag / Tokenized Skill/Chip Inputs
    const container = el.closest ? el.closest('.tags, .tag-input, .select2, .select2-container, .tokenfield, [data-role="tagsinput"], [class*="tag"], [class*="pill"]') : null;
    const isTagPlaceholder = placeholder.includes("press enter") || placeholder.includes("add skill") || placeholder.includes("type and press") || placeholder.includes("comma separated") || placeholder.includes("add tag");
    const isTagSignal = ariaLabel.includes("skill") || name.includes("skill") || placeholder.includes("skill") || autoId.includes("skill") || (container && container.className && container.className.includes("tag"));
    if (tag === "input" && (isTagPlaceholder || isTagSignal)) {
      let addBtn = null;
      if (el.parentElement) {
        addBtn = el.parentElement.querySelector('button, [role="button"], .add-btn, .btn-add');
      }
      return {
        isComplex: true,
        type: "multi_tag_input",
        trigger: addBtn ? "button" : "enter",
        button: addBtn
      };
    }

    // 4. Segmented Radio Button Groups / Button-Group Pills (e.g. Yes/No pills, Work Auth buttons)
    if (
      role === 'radiogroup' ||
      (el.classList && el.classList.contains('btn-group')) ||
      (el.matches && el.matches('[class*="segmented"], [class*="toggle-group"]')) ||
      (tag === 'fieldset' && el.querySelector && el.querySelector('button, [role="radio"]'))
    ) {
      return {
        isComplex: true,
        type: "segmented_radiogroup"
      };
    }

    // 5. Custom Styled Switch / Checkbox
    if (
      role === 'switch' ||
      (role === 'checkbox' && tag !== 'input') ||
      (el.classList && (el.classList.contains('switch') || el.classList.contains('toggle-switch')))
    ) {
      return {
        isComplex: true,
        type: "custom_switch"
      };
    }

    // 6. Split Date Inputs (Month + Year inputs or dropdown pairs)
    if (name.includes('month') || id.includes('month') || autoId.includes('month')) {
      const parent = el.parentElement || (el.closest && el.closest('.field, .form-group, [class*="date"]'));
      const yearSibling = parent && parent.querySelector ? parent.querySelector('input[name*="year"], select[name*="year"], [data-automation-id*="year"], input[placeholder*="year"]') : null;
      if (yearSibling) {
        return {
          isComplex: true,
          type: "split_date",
          role: "month",
          monthEl: el,
          yearEl: yearSibling
        };
      }
    }

    // 7. Split Phone Input with Country Code Selector (intl-tel-input, React Phone)
    if (type === 'tel' || name.includes('phone')) {
      const parent = el.parentElement || (el.closest && el.closest('.field, .form-group, .iti'));
      const countryEl = parent && parent.querySelector ? parent.querySelector('select[name*="country"], .iti__selected-flag, [aria-haspopup="listbox"]') : null;
      if (countryEl) {
        return {
          isComplex: true,
          type: "split_phone",
          countryCodeEl: countryEl,
          numberEl: el
        };
      }
    }

    // 8. Split Salary Fields (Currency + Amount + Period)
    if (name.includes('salary') || name.includes('compensation') || placeholder.includes('salary')) {
      const parent = el.parentElement || (el.closest && el.closest('.field, .form-group'));
      const currEl = parent && parent.querySelector ? parent.querySelector('select[name*="curr"], select[name*="currency"]') : null;
      const freqEl = parent && parent.querySelector ? parent.querySelector('select[name*="freq"], select[name*="period"]') : null;
      if (currEl || freqEl) {
        return {
          isComplex: true,
          type: "split_salary",
          amountEl: el,
          currencyEl: currEl,
          frequencyEl: freqEl
        };
      }
    }

    // 9. Cascading / Dependent Dropdowns
    if (tag === "select") {
      const isCascading = (el.hasAttribute && (el.hasAttribute('data-cascade') || el.hasAttribute('data-dependent'))) ||
                          name.includes("state") || name.includes("province") || name.includes("major");
      if (isCascading) {
        return {
          isComplex: true,
          type: "cascading_dropdown",
          role: name.includes("state") ? "state" : (name.includes("major") ? "major" : "dependent")
        };
      }
    }

    // 10. Slider / Star / Scale Rating
    if (type === 'range' || role === 'slider' || (el.classList && el.classList.contains('rating-bar'))) {
      return {
        isComplex: true,
        type: "slider_rating"
      };
    }

    return null;
  },

  // Calculate deep fill metrics (Compulsory vs Optional, Filled vs Unfilled, User Edits)
  calculateFillMetrics(descriptors = [], matchResults = []) {
    const stats = {
      totalFields: descriptors.length,
      compulsoryTotal: 0,
      compulsoryFilled: 0,
      compulsoryUnfilled: 0,
      optionalTotal: 0,
      optionalFilled: 0,
      optionalUnfilled: 0,
      ignoredCount: 0,
      overallFillRate: "0%"
    };

    for (let i = 0; i < descriptors.length; i++) {
      const desc = descriptors[i];
      const match = matchResults[i] || { matched: false };
      const isReq = !!desc.isRequired;
      const isFilled = !!(match.matched && match.value);
      const isIgnored = !!match.ignored;

      if (isIgnored) stats.ignoredCount++;

      if (isReq) {
        stats.compulsoryTotal++;
        if (isFilled) stats.compulsoryFilled++;
        else stats.compulsoryUnfilled++;
      } else {
        stats.optionalTotal++;
        if (isFilled) stats.optionalFilled++;
        else stats.optionalUnfilled++;
      }
    }

    const totalToFill = stats.compulsoryTotal + (stats.optionalTotal - stats.ignoredCount);
    const totalFilled = stats.compulsoryFilled + stats.optionalFilled;
    if (totalToFill > 0) {
      stats.overallFillRate = `${Math.round((totalFilled / totalToFill) * 100)}%`;
    }
    stats.compulsoryRate = stats.compulsoryTotal > 0 ? `${Math.round((stats.compulsoryFilled / stats.compulsoryTotal) * 100)}%` : "100%";

    return stats;
  }
};

// Universal Interaction Handlers for Complex UI Components
const ComplexUIAdapters = {
  // 1. Fill Rich Text & ContentEditable Editors
  async fillContentEditable(element, text) {
    if (!element) return false;
    const cleanText = text !== undefined && text !== null ? String(text) : "";
    try {
      if (element.focus) element.focus();
      if (typeof document !== 'undefined' && document.queryCommandSupported && document.queryCommandSupported('insertText')) {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, cleanText);
      } else {
        element.textContent = cleanText;
      }
    } catch (e) {
      element.textContent = cleanText;
    }

    try {
      if (typeof InputEvent !== 'undefined') {
        element.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: cleanText, bubbles: true }));
        element.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: cleanText, bubbles: true }));
      } else if (element.dispatchEvent) {
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (element.dispatchEvent) {
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    } catch (e) {}
    return true;
  },

  // 2. Fill Custom Styled Comboboxes & Autocomplete Dropdowns
  async fillCustomCombobox(element, query) {
    if (!element) return false;
    const queryStr = String(query || "").trim();
    try {
      if (element.focus) element.focus();
      if (element.click) element.click();
    } catch (e) {}

    const inputEl = element.tagName === 'INPUT' ? element : (element.querySelector ? element.querySelector('input') : null);
    if (inputEl) {
      try {
        inputEl.value = queryStr;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      } catch (e) {}
    }

    if (typeof setTimeout !== 'undefined') {
      await new Promise(r => setTimeout(r, 40));
    }

    const options = typeof document !== 'undefined'
      ? Array.from(document.querySelectorAll('[role="option"], .select2-results__option, div[class*="option"], li[class*="option"]'))
      : [];

    let bestOption = null;
    if (options.length > 0) {
      const qLower = queryStr.toLowerCase();
      bestOption = options.find(opt => (opt.innerText || opt.textContent || '').trim().toLowerCase() === qLower) ||
                   options.find(opt => (opt.innerText || opt.textContent || '').trim().toLowerCase().includes(qLower));

      if (!bestOption && typeof is90PercentMatch === 'function') {
        bestOption = options.find(opt => is90PercentMatch((opt.innerText || opt.textContent || '').trim(), queryStr));
      }
    }

    if (bestOption) {
      try {
        if (typeof MouseEvent !== 'undefined') {
          bestOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        }
        bestOption.click();
        if (typeof MouseEvent !== 'undefined') {
          bestOption.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        }
      } catch (e) {}
    } else if (inputEl) {
      try {
        if (typeof KeyboardEvent !== 'undefined') {
          inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
        } else if (inputEl.dispatchEvent) {
          const ev = new Event('keydown', { bubbles: true });
          ev.key = 'Enter';
          inputEl.dispatchEvent(ev);
        }
      } catch (e) {}
    }

    try {
      if (element.dispatchEvent) {
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    } catch (e) {}
    return true;
  },

  // 3. Fill Multi-Tag / Skill Token Inputs
  async fillMultiTagInput(element, tags) {
    if (!element) return false;
    const tagList = Array.isArray(tags) ? tags : String(tags).split(/[,;]+/).map(t => t.trim()).filter(Boolean);

    for (const tag of tagList) {
      try {
        if (element.focus) element.focus();
        element.value = tag;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));

        if (element.parentElement) {
          const addBtn = element.parentElement.querySelector('button, [role="button"], .add-btn, .btn-add');
          if (addBtn) addBtn.click();
        }
      } catch (e) {}

      if (typeof setTimeout !== 'undefined') {
        await new Promise(r => setTimeout(r, 20));
      }
    }
    return true;
  },

  // 4. Fill Segmented Button Controls & Pill Toggles
  async fillSegmentedGroup(container, targetValue) {
    if (!container) return false;
    const targetStr = String(targetValue || "").trim().toLowerCase();
    const buttons = container.querySelectorAll ? Array.from(container.querySelectorAll('button, [role="radio"], label, input[type="radio"]')) : [];

    let bestBtn = buttons.find(b => {
      const txt = (b.innerText || b.textContent || b.value || (b.getAttribute && b.getAttribute('aria-label')) || '').trim().toLowerCase();
      return txt === targetStr || (targetStr === 'yes' && (txt === 'true' || txt === '1')) || (targetStr === 'no' && (txt === 'false' || txt === '0'));
    });

    if (!bestBtn) {
      bestBtn = buttons.find(b => {
        const txt = (b.innerText || b.textContent || b.value || (b.getAttribute && b.getAttribute('aria-label')) || '').trim().toLowerCase();
        return txt.includes(targetStr) || (targetStr.length > 2 && targetStr.includes(txt));
      });
    }

    if (bestBtn) {
      try {
        if (bestBtn.tagName === 'INPUT' && bestBtn.type === 'radio') {
          bestBtn.checked = true;
          bestBtn.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          bestBtn.click();
          if (bestBtn.getAttribute && bestBtn.getAttribute('role') === 'radio') {
            buttons.forEach(b => b.setAttribute && b.setAttribute('aria-checked', 'false'));
            bestBtn.setAttribute('aria-checked', 'true');
          }
        }
        bestBtn.dispatchEvent(new Event('input', { bubbles: true }));
        bestBtn.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {}
      return true;
    }
    return false;
  },

  // 5. Fill Custom Styled Checkboxes & Switches
  async fillCustomSwitch(element, targetBool) {
    if (!element) return false;
    const desired = Boolean(targetBool);
    const isCurrentlyChecked = (element.getAttribute && element.getAttribute('aria-checked') === 'true') ||
                               element.checked === true ||
                               (element.classList && (element.classList.contains('active') || element.classList.contains('checked')));

    if (isCurrentlyChecked !== desired) {
      try {
        element.click();
        if (element.setAttribute) {
          element.setAttribute('aria-checked', desired ? 'true' : 'false');
        }
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {}
    }
    return true;
  },

  // 6. Fill Split Date Inputs (Month + Year)
  async fillSplitDate(monthEl, yearEl, dateStr) {
    if (!dateStr) return false;
    const str = String(dateStr).trim();
    let year = "";
    let monthNum = "";
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    let monthName = "";

    const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})/);
    if (isoMatch) {
      year = isoMatch[1];
      const mIdx = parseInt(isoMatch[2], 10) - 1;
      monthNum = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
      monthName = monthNames[mIdx] || "";
    } else {
      const yearMatch = str.match(/\b(19\d{2}|20\d{2})\b/);
      if (yearMatch) year = yearMatch[0];
      for (let i = 0; i < monthNames.length; i++) {
        if (new RegExp('\\b' + monthNames[i], 'i').test(str) || new RegExp('\\b' + monthNames[i].slice(0, 3), 'i').test(str)) {
          monthNum = String(i + 1).padStart(2, '0');
          monthName = monthNames[i];
          break;
        }
      }
    }

    if (yearEl && year) {
      try {
        if (yearEl.tagName === 'SELECT') {
          const opt = Array.from(yearEl.options || []).find(o => o.value === year || o.text.includes(year));
          if (opt) yearEl.value = opt.value;
        } else {
          yearEl.value = year;
        }
        yearEl.dispatchEvent(new Event('input', { bubbles: true }));
        yearEl.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {}
    }

    if (monthEl && (monthNum || monthName)) {
      try {
        if (monthEl.tagName === 'SELECT') {
          const opt = Array.from(monthEl.options || []).find(o =>
            o.value === monthNum || o.value === String(parseInt(monthNum, 10)) ||
            (monthName && (o.text.toLowerCase().includes(monthName.toLowerCase()) || o.text.toLowerCase().includes(monthName.slice(0, 3).toLowerCase())))
          );
          if (opt) monthEl.value = opt.value;
        } else {
          monthEl.value = monthNum;
        }
        monthEl.dispatchEvent(new Event('input', { bubbles: true }));
        monthEl.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {}
    }
    return true;
  },

  // 7. Fill Split International Phone Fields
  async fillSplitPhone(countryCodeEl, numberEl, phoneStr) {
    if (!phoneStr) return false;
    const str = String(phoneStr).trim();
    let dialCode = "";
    let nationalNumber = "";

    const dialMatch = str.match(/^\+?(\d{1,3})[-.\s(]?/);
    if (dialMatch) {
      dialCode = dialMatch[1].startsWith('+') ? dialMatch[1] : `+${dialMatch[1]}`;
      nationalNumber = str.replace(/^\+?\d{1,3}[-.\s(]*/, '').replace(/\D/g, '');
    } else {
      nationalNumber = str.replace(/\D/g, '');
    }

    if (countryCodeEl && dialCode) {
      try {
        if (countryCodeEl.tagName === 'SELECT') {
          const opt = Array.from(countryCodeEl.options || []).find(o => o.value.includes(dialCode) || o.text.includes(dialCode));
          if (opt) {
            countryCodeEl.value = opt.value;
            countryCodeEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else if (countryCodeEl.click) {
          countryCodeEl.click();
          if (typeof document !== 'undefined') {
            const codeOpt = Array.from(document.querySelectorAll('[role="option"], li, div')).find(o => (o.innerText || o.textContent || '').includes(dialCode));
            if (codeOpt) codeOpt.click();
          }
        }
      } catch (e) {}
    }

    if (numberEl && nationalNumber) {
      try {
        numberEl.value = nationalNumber;
        numberEl.dispatchEvent(new Event('input', { bubbles: true }));
        numberEl.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {}
    }
    return true;
  },

  // 8. Fill Split Salary Fields
  async fillSplitSalary(currEl, amtEl, freqEl, salaryStr) {
    if (!salaryStr) return false;
    const str = String(salaryStr).trim();
    const numMatch = str.match(/[\d,.]+/);
    const amount = numMatch ? numMatch[0].replace(/,/g, '') : "";

    let currency = "USD";
    if (str.includes("₹") || /inr|lpa/i.test(str)) currency = "INR";
    else if (str.includes("€") || /eur/i.test(str)) currency = "EUR";
    else if (str.includes("£") || /gbp/i.test(str)) currency = "GBP";
    else if (str.includes("$") || /usd/i.test(str)) currency = "USD";

    let freq = "Annual";
    if (/month|monthly/i.test(str)) freq = "Monthly";
    else if (/hour|hourly/i.test(str)) freq = "Hourly";

    if (amtEl && amount) {
      try {
        amtEl.value = amount;
        amtEl.dispatchEvent(new Event('input', { bubbles: true }));
        amtEl.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {}
    }

    if (currEl && currEl.tagName === 'SELECT') {
      try {
        const opt = Array.from(currEl.options || []).find(o => o.value.includes(currency) || o.text.includes(currency));
        if (opt) {
          currEl.value = opt.value;
          currEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } catch (e) {}
    }

    if (freqEl && freqEl.tagName === 'SELECT') {
      try {
        const opt = Array.from(freqEl.options || []).find(o => o.value.toLowerCase().includes(freq.toLowerCase()) || o.text.toLowerCase().includes(freq.toLowerCase()));
        if (opt) {
          freqEl.value = opt.value;
          freqEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } catch (e) {}
    }
    return true;
  },

  // 9. Fill Cascading / Dependent Dropdowns
  async fillCascadingDropdown(parentEl, childEl, parentVal, childVal) {
    if (!parentEl) return false;
    try {
      if (parentEl.tagName === 'SELECT') {
        const opt = Array.from(parentEl.options || []).find(o => o.text.toLowerCase().includes(String(parentVal).toLowerCase()) || o.value.toLowerCase().includes(String(parentVal).toLowerCase()));
        if (opt) {
          parentEl.value = opt.value;
          parentEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    } catch (e) {}

    if (!childEl) return true;

    if (typeof setTimeout !== 'undefined') {
      await new Promise(r => setTimeout(r, 60));
    }

    try {
      if (childEl.tagName === 'SELECT') {
        const childOpt = Array.from(childEl.options || []).find(o => o.text.toLowerCase().includes(String(childVal).toLowerCase()) || o.value.toLowerCase().includes(String(childVal).toLowerCase()));
        if (childOpt) {
          childEl.value = childOpt.value;
          childEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    } catch (e) {}
    return true;
  },

  // 10. Fill Slider / Star / Scale Rating
  async fillSliderRating(element, ratingValue) {
    if (!element) return false;
    const num = parseFloat(ratingValue);
    if (!isNaN(num)) {
      try {
        element.value = num;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } catch (e) {}
    }
    return false;
  }
};

AtsAdapters.ComplexUIAdapters = ComplexUIAdapters;

// Export for Chrome Extension content scripts (window / globalThis) and Node test runner (module.exports)
if (typeof window !== 'undefined') {
  window.AtsAdapters = AtsAdapters;
  window.ComplexUIAdapters = ComplexUIAdapters;
}
if (typeof globalThis !== 'undefined') {
  globalThis.AtsAdapters = AtsAdapters;
  globalThis.ComplexUIAdapters = ComplexUIAdapters;
}
if (typeof module !== 'undefined') {
  module.exports = { AtsAdapters, ComplexUIAdapters, calculateSim, isNinetyPercentMatch };
}
