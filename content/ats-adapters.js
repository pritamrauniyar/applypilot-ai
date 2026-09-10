// ApplyPilot AI - ATS Adapters & Form Identification Rules
// Highly tuned for Greenhouse, Lever, Workday, Ashby, and Generic Application Forms.

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
      labels: ["job title", "current title", "title", "current job title", "most recent role", "position", "role"],
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
      subKey: "headline",
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
      isOptional
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

    // 1. Check Learned Memory from AI Feedback Loop first (user approved previously)
    if (profile.learnedMemory && profile.learnedMemory.length) {
      for (const item of profile.learnedMemory) {
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

    // 2. Check Custom Fields
    if (profile.customFields && profile.customFields.length) {
      for (const field of profile.customFields) {
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

    // 3. Check Standard Fields by specificity (longer matching phrases first to avoid false positives)
    // For example: "authorized to work in the United States" should match workAuthorization, not state!
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
        // Special guard: "state" shouldn't match "United States"
        if (lbl === "state" && (descriptor.combinedLabels.includes("united states") || descriptor.combinedLabels.includes("statement"))) {
          if (!descriptor.combinedLabels.includes("state /") && !descriptor.combinedLabels.includes("state/")) {
            continue;
          }
        }

        // Use word boundary regex for short labels to avoid substring accidents
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
              matchLength: lbl.length, // Longer, more specific phrases take precedence
              confidence: 0.85
            });
          }
        }
      }
    }

    if (matches.length > 0) {
      // Pick the match with the longest/most specific phrase
      matches.sort((a, b) => b.matchLength - a.matchLength);
      return matches[0];
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
        if (subKey === "roleDescription" || subKey === "description") return item.description || profile.experience?.headline || "";
        if (subKey === "startDate" || subKey === "fromDate") return item.startDate || "";
        if (subKey === "endDate" || subKey === "toDate") return item.endDate || (item.isCurrent ? "Present" : "");
      }
      if (subKey === "location" || subKey === "jobLocation") return profile.experience?.location || profile.personal?.location || profile.personal?.city || "";
      if (subKey === "isCurrent" || subKey === "currentlyWorkHere") return true;
      if (subKey === "roleDescription" || subKey === "description") return profile.experience?.headline || "";
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
  }
};

// Export for Chrome Extension content scripts (window / globalThis) and Node test runner (module.exports)
if (typeof window !== 'undefined') {
  window.AtsAdapters = AtsAdapters;
}
if (typeof globalThis !== 'undefined') {
  globalThis.AtsAdapters = AtsAdapters;
}
if (typeof module !== 'undefined') {
  module.exports = { AtsAdapters };
}
