// ApplyPilot AI - ATS Adapters & Form Identification Rules
// Highly tuned for Greenhouse, Lever, Workday, Ashby, and Generic Application Forms.

const AtsAdapters = {
  // Common standard field dictionary with multi-signal matching
  FIELD_DEFINITIONS: [
    {
      key: "firstName",
      category: "personal",
      subKey: "firstName",
      labels: ["first name", "given name", "forename", "first_name"],
      names: ["firstname", "first_name", "first-name", "givenname", "given-name"],
      autocomplete: ["given-name"],
      workdayId: ["legalnamesection_firstname", "firstname"]
    },
    {
      key: "lastName",
      category: "personal",
      subKey: "lastName",
      labels: ["last name", "surname", "family name", "last_name"],
      names: ["lastname", "last_name", "last-name", "familyname", "family-name"],
      autocomplete: ["family-name"],
      workdayId: ["legalnamesection_lastname", "lastname"]
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
      labels: ["current company", "most recent company", "company", "current employer", "organization"],
      names: ["org", "company", "current_company", "employer"],
      autocomplete: ["organization"],
      workdayId: ["currentcompany", "employer"]
    },
    {
      key: "currentTitle",
      category: "experience",
      subKey: "currentTitle",
      labels: ["current title", "current job title", "title", "most recent role"],
      names: ["title", "current_title", "job_title"],
      autocomplete: ["organization-title"],
      workdayId: ["jobtitle", "title"]
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
    }
  ],

  // Extract all text cues from an element
  getElementDescriptor(el) {
    const textSignals = [];

    // 1. Associated label via 'for' attribute
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label && label.innerText) textSignals.push(label.innerText.trim());
    }

    // 2. Parent label if input is wrapped
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.innerText) {
      textSignals.push(parentLabel.innerText.trim());
    }

    // 3. Preceding sibling or parent container heading
    const container = el.closest('.field, .form-group, .application-question, [data-automation-id], .css-1, .form-field');
    if (container) {
      const heading = container.querySelector('label, .label, .field-label, legend, span, h4, h5');
      if (heading && heading.innerText) textSignals.push(heading.innerText.trim());
    }

    // 4. Element attributes
    const name = el.getAttribute('name') || '';
    const id = el.getAttribute('id') || '';
    const placeholder = el.getAttribute('placeholder') || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const autocomplete = el.getAttribute('autocomplete') || '';
    const dataAutomationId = el.getAttribute('data-automation-id') || '';

    return {
      element: el,
      tag: el.tagName.toLowerCase(),
      type: (el.getAttribute('type') || 'text').toLowerCase(),
      name: name.toLowerCase(),
      id: id.toLowerCase(),
      placeholder: placeholder.toLowerCase(),
      ariaLabel: ariaLabel.toLowerCase(),
      autocomplete: autocomplete.toLowerCase(),
      dataAutomationId: dataAutomationId.toLowerCase(),
      combinedLabels: textSignals.join(' ').toLowerCase()
    };
  },

  // Match an element against standard fields, custom fields, and learned memory
  matchElement(descriptor, profile) {
    const combined = `${descriptor.combinedLabels} ${descriptor.name} ${descriptor.id} ${descriptor.placeholder} ${descriptor.ariaLabel} ${descriptor.dataAutomationId}`;

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
        const val = this.getProfileValue(profile, def.category, def.subKey);
        if (val) return { matched: true, source: "standard", def, value: val, confidence: 1.0 };
      }

      // Check Workday automation ID
      if (descriptor.dataAutomationId) {
        for (const wid of def.workdayId) {
          if (descriptor.dataAutomationId === wid || descriptor.dataAutomationId.includes(wid)) {
            const val = this.getProfileValue(profile, def.category, def.subKey);
            if (val) return { matched: true, source: "standard", def, value: val, confidence: 0.95 };
          }
        }
      }

      // Check exact name / ID match
      for (const n of def.names) {
        if (descriptor.name === n || descriptor.id === n) {
          const val = this.getProfileValue(profile, def.category, def.subKey);
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
          const val = this.getProfileValue(profile, def.category, def.subKey);
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

  // Helper to extract value safely from nested profile
  getProfileValue(profile, category, subKey) {
    if (!profile) return "";
    if (category === "personal") return profile.personal?.[subKey] || "";
    if (category === "links") return profile.links?.[subKey] || "";
    if (category === "experience") return profile.experience?.[subKey] || "";
    if (category === "education") return profile.education?.[subKey] || "";
    if (category === "presets") return profile.presets?.[subKey] || "";
    return "";
  }
};

if (typeof module !== 'undefined') {
  module.exports = { AtsAdapters };
}
