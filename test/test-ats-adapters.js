const test = require('node:test');
const assert = require('node:assert');

// Mock window and document
global.window = {
  location: {
    hostname: 'uber.wd1.myworkdayjobs.com'
  }
};
global.MouseEvent = class MouseEvent extends Event {};
global.KeyboardEvent = class KeyboardEvent extends Event {
  constructor(type, opts = {}) {
    super(type, opts);
    this.key = opts.key;
    this.keyCode = opts.keyCode;
  }
};

const { AtsAdapters, ComplexUIAdapters, calculateSim, isNinetyPercentMatch } = require('../content/ats-adapters.js');
const { DEFAULT_PROFILE } = require('../lib/storage.js');

test('AtsAdapters: calculateSim and isNinetyPercentMatch local utility', () => {
  // Empty or falsy
  assert.strictEqual(calculateSim('', 'uber'), 0);
  assert.strictEqual(calculateSim('uber', ''), 0);

  // Exact
  assert.strictEqual(calculateSim('Uber', 'uber'), 1.0);

  // Substring min/max ratio
  const simSub1 = calculateSim('Uber Technologies', 'Uber');
  assert.ok(simSub1 >= 0.9);

  // Token Jaccard
  const simJaccard = calculateSim('Software Engineer II Uber', 'Uber II Software Engineer');
  assert.ok(simJaccard >= 0.9);

  // Empty tokens
  assert.strictEqual(calculateSim('!!!', '???'), 0);

  // Levenshtein distance
  const simLev = calculateSim('Kubernetes', 'Kubernets');
  assert.ok(simLev >= 0.85);

  // Large length diff with low jaccard
  const simDiff = calculateSim('Go', 'Completely Unrelated String');
  assert.ok(simDiff < 0.5);

  // isNinetyPercentMatch
  assert.strictEqual(isNinetyPercentMatch('Uber', 'Uber Technologies Inc'), true);
  assert.strictEqual(isNinetyPercentMatch('Apple', 'Banana'), false);
});

test('AtsAdapters: ATS Portal Detection Flags (All 15 platforms)', () => {
  assert.strictEqual(AtsAdapters.detectPortalType('company.wd1.myworkdayjobs.com'), 'workday');
  assert.strictEqual(AtsAdapters.detectPortalType('boards.greenhouse.io'), 'greenhouse');
  assert.strictEqual(AtsAdapters.detectPortalType('jobs.lever.co'), 'lever');
  assert.strictEqual(AtsAdapters.detectPortalType('jobs.ashbyhq.com'), 'ashby');
  assert.strictEqual(AtsAdapters.detectPortalType('company.taleo.net'), 'taleo');
  assert.strictEqual(AtsAdapters.detectPortalType('jobs.smartrecruiters.com'), 'smartrecruiters');
  assert.strictEqual(AtsAdapters.detectPortalType('jobs.jobvite.com'), 'jobvite');
  assert.strictEqual(AtsAdapters.detectPortalType('company.bamboohr.com'), 'bamboohr');
  assert.strictEqual(AtsAdapters.detectPortalType('company.icims.com'), 'icims');
  assert.strictEqual(AtsAdapters.detectPortalType('career4.successfactors.com'), 'successfactors');
  assert.strictEqual(AtsAdapters.detectPortalType('company.avature.net'), 'avature');
  assert.strictEqual(AtsAdapters.detectPortalType('company.oraclecloud.com'), 'oracle');
  assert.strictEqual(AtsAdapters.detectPortalType('recruiting.paylocity.com'), 'paylocity');
  assert.strictEqual(AtsAdapters.detectPortalType('company.rippling-ats.com'), 'rippling');
  assert.strictEqual(AtsAdapters.detectPortalType('www.ziprecruiter.com'), 'ziprecruiter');
  assert.strictEqual(AtsAdapters.detectPortalType('randomsite.com'), 'generic');
});

test('AtsAdapters: extractTargetCompany from URL, domain, and title', () => {
  // 1. Workday subdomain extraction
  assert.strictEqual(AtsAdapters.extractTargetCompany('https://uber.wd1.myworkdayjobs.com/Careers').toLowerCase(), 'uber');
  
  // 2. Known company in title or host
  assert.strictEqual(AtsAdapters.extractTargetCompany('https://boards.greenhouse.io/stripe/jobs/123'), 'Stripe');
  assert.strictEqual(AtsAdapters.extractTargetCompany('https://careers.google.com/jobs', 'Google Careers - Senior Software Engineer'), 'Google');
  assert.strictEqual(AtsAdapters.extractTargetCompany('https://jobs.lever.co/netflix/123', 'Job at Netflix'), 'Netflix');

  // 3. Domain extraction fallback
  assert.strictEqual(AtsAdapters.extractTargetCompany('https://careers.airbnb.com/positions'), 'Airbnb');
  assert.strictEqual(AtsAdapters.extractTargetCompany('https://randomatsportal.com/job', ''), 'Randomatsportal');
  
  // Fallback to window.location
  window.location.hostname = 'uber.wd1.myworkdayjobs.com';
  assert.strictEqual(AtsAdapters.extractTargetCompany('', '').toLowerCase(), 'uber');
});

test('AtsAdapters: getElementDescriptor with all DOM accessibility patterns', () => {
  // Mock elements for document lookup
  const labelledByTarget = { innerText: 'Legal Given Name *' };
  const labelForTarget = { innerText: 'Your Primary Email (Required)' };

  global.document = {
    title: 'Workday Application - Uber',
    getElementById: (id) => id === 'lbl-first' ? labelledByTarget : null,
    querySelector: (sel) => sel.includes('email-input') ? labelForTarget : null,
    querySelectorAll: () => []
  };

  global.CSS = { escape: (s) => s };

  // 1. Field with aria-labelledby
  const el1 = {
    tagName: 'INPUT',
    id: 'first-name-input',
    getAttribute: (attr) => {
      if (attr === 'aria-labelledby') return 'lbl-first';
      if (attr === 'type') return 'text';
      return null;
    },
    hasAttribute: (attr) => attr === 'required',
    closest: () => null,
    previousElementSibling: null
  };
  const desc1 = AtsAdapters.getElementDescriptor(el1);
  assert.strictEqual(desc1.isRequired, true);
  assert.ok(desc1.combinedLabels.includes('legal given name'));

  // 2. Field with label[for="id"], autocomplete, data-automation-id, and previousElementSibling
  const prevSibling = {
    matches: () => true,
    innerText: 'Email Address'
  };
  const mockContainer = {
    getAttribute: (attr) => attr === 'data-automation-id' ? 'formField-email' : null,
    querySelector: () => ({ innerText: 'Contact Information' })
  };
  const el2 = {
    tagName: 'INPUT',
    id: 'email-input',
    parentElement: {
      closest: (sel) => mockContainer
    },
    getAttribute: (attr) => {
      if (attr === 'type') return 'email';
      if (attr === 'name') return 'email';
      if (attr === 'placeholder') return 'name@domain.com';
      if (attr === 'autocomplete') return 'email';
      if (attr === 'data-automation-id') return 'email-widget';
      if (attr === 'aria-label') return 'Personal Email';
      if (attr === 'title') return 'Email Title';
      return null;
    },
    hasAttribute: () => false,
    closest: (sel) => sel === 'label' ? { innerText: 'Parent Wrapped Label (Optional)' } : null,
    previousElementSibling: prevSibling
  };
  const desc2 = AtsAdapters.getElementDescriptor(el2);
  assert.strictEqual(desc2.isOptional, true);
  assert.ok(desc2.combinedLabels.includes('parent wrapped label'));
  assert.ok(desc2.combinedLabels.includes('personal email'));
  assert.ok(desc2.combinedLabels.includes('contact information'));
  assert.ok(desc2.combinedLabels.includes('email address'));
  assert.strictEqual(desc2.autocomplete, 'email');
  assert.strictEqual(desc2.dataAutomationId, 'email-widget formfield-email');
});

test('AtsAdapters: matchElement with predictive ignore, keywords ignore, and autocomplete', () => {
  const profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));

  // 1. Ignored by keyword in ignoredOptionalFields
  profile.ignoredOptionalFields = [
    { label: 'Ethnicity', keywords: ['ethnicity', 'race identity'] }
  ];
  const descIgn = {
    isRequired: false,
    combinedLabels: 'please select your race identity or ethnicity',
    name: 'race_identity'
  };
  const resIgn = AtsAdapters.matchElement(descIgn, profile);
  assert.strictEqual(resIgn.ignored, true);
  assert.strictEqual(resIgn.matched, false);

  // 2. Predictive ignore from fieldInteractionStats
  profile.fieldInteractionStats = {
    phone_extension: {
      label: 'Phone Extension',
      predictedIgnored: true,
      confidence: 0.85,
      skippedCount: 3
    }
  };
  const descPred = {
    isRequired: false,
    combinedLabels: 'phone extension or office ext',
    name: 'ext'
  };
  const resPred = AtsAdapters.matchElement(descPred, profile);
  assert.strictEqual(resPred.ignored, true);
  assert.strictEqual(resPred.predicted, true);

  // 3. Autocomplete matching
  const descAuto = {
    autocomplete: 'given-name',
    combinedLabels: 'name',
    name: 'fname'
  };
  const resAuto = AtsAdapters.matchElement(descAuto, profile);
  assert.strictEqual(resAuto.matched, true);
  assert.strictEqual(resAuto.value, 'Pritam');
});

test('AtsAdapters: matchElement company employer check and nested details', () => {
  const profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  profile.experience.items = [
    { company: 'Uber', title: 'Software Engineer II' }
  ];

  // 1. Former employee check where company is Uber -> resolves to "Yes" automatically
  const descCompany = {
    combinedLabels: 'have you ever worked at uber or any of its subsidiaries?',
    name: 'former_emp'
  };
  const resCompany = AtsAdapters.matchElement(descCompany, profile);
  assert.strictEqual(resCompany.matched, true);
  assert.strictEqual(resCompany.value, 'Yes');

  // 2. Nested details: Degree, GPA, Graduation Year, Institution with non-standard names
  const descDegree = {
    combinedLabels: 'higher education degree level obtained',
    name: 'custom_field_education_degree'
  };
  const resDegree = AtsAdapters.matchElement(descDegree, profile);
  assert.strictEqual(resDegree.matched, true);
  assert.strictEqual(resDegree.value, 'Bachelor of Technology');

  const descGpa = {
    combinedLabels: 'higher education cumulative gpa grade',
    name: 'custom_field_education_gpa'
  };
  const resGpa = AtsAdapters.matchElement(descGpa, profile);
  assert.strictEqual(resGpa.matched, true);
  assert.strictEqual(resGpa.value, '3.8');

  const descGradYear = {
    combinedLabels: 'higher education graduation year completed',
    name: 'custom_field_education_grad_year'
  };
  const resGradYear = AtsAdapters.matchElement(descGradYear, profile);
  assert.strictEqual(resGradYear.matched, true);
  assert.strictEqual(resGradYear.value, '2020');

  const descInst = {
    combinedLabels: 'higher education university institution attended',
    name: 'custom_field_education_institution'
  };
  const resInst = AtsAdapters.matchElement(descInst, profile);
  assert.strictEqual(resInst.matched, true);
  assert.strictEqual(resInst.value, 'Motilal Nehru National Institute Of Technology');
});

test('AtsAdapters: ComplexUIAdapters all branches and edge cases', async () => {
  // 1. fillCustomCombobox fallback when option is clicked
  let clickedOption = null;
  const mockOption = {
    textContent: 'United States',
    dispatchEvent: () => {},
    click: () => { clickedOption = 'United States'; }
  };
  global.document = {
    querySelectorAll: () => [mockOption]
  };
  const mockBox = {
    focus: () => {},
    click: () => {},
    querySelector: () => ({ dispatchEvent: () => {} }),
    dispatchEvent: () => {}
  };
  await ComplexUIAdapters.fillCustomCombobox(mockBox, 'United States');
  assert.strictEqual(clickedOption, 'United States');

  // 1b. fillCustomCombobox Enter key fallback when no option matches
  global.document = { querySelectorAll: () => [] };
  let enterKeySent = false;
  const mockInput = {
    value: '',
    dispatchEvent: (e) => { if (e.key === 'Enter') enterKeySent = true; }
  };
  const mockBoxFallback = {
    focus: () => {},
    click: () => {},
    querySelector: () => mockInput,
    dispatchEvent: () => {}
  };
  await ComplexUIAdapters.fillCustomCombobox(mockBoxFallback, 'Custom Value');
  assert.strictEqual(enterKeySent, true);

  // 2. fillMultiTagInput with comma-separated string
  let tagsAdded = [];
  const mockTagEl = {
    focus: () => {},
    value: '',
    dispatchEvent: (e) => {},
    parentElement: {
      querySelector: () => ({ click: () => { tagsAdded.push(mockTagEl.value); } })
    }
  };
  await ComplexUIAdapters.fillMultiTagInput(mockTagEl, 'Go, Kafka, Docker');
  assert.strictEqual(tagsAdded.length, 3);

  // 3. fillSegmentedGroup with radio input elements
  const radioYes = {
    tagName: 'INPUT',
    type: 'radio',
    value: 'yes',
    checked: false,
    dispatchEvent: () => {}
  };
  const segmentedDiv = {
    querySelectorAll: () => [radioYes]
  };
  await ComplexUIAdapters.fillSegmentedGroup(segmentedDiv, 'Yes');
  assert.strictEqual(radioYes.checked, true);

  // 4. fillCustomSwitch toggle from checked to unchecked
  let switchClicked = false;
  const switchEl = {
    checked: true,
    getAttribute: () => 'true',
    setAttribute: () => {},
    click: () => { switchClicked = true; },
    dispatchEvent: () => {}
  };
  await ComplexUIAdapters.fillCustomSwitch(switchEl, false);
  assert.strictEqual(switchClicked, true);

  // 5. fillSplitDate with month names as select and year select
  const yearOpt = { value: '2022', text: '2022' };
  const mockYearSelect = {
    tagName: 'SELECT',
    options: [yearOpt],
    dispatchEvent: () => {}
  };
  const monthOpt = { value: '08', text: 'August' };
  const mockMonthSelect = {
    tagName: 'SELECT',
    options: [monthOpt],
    dispatchEvent: () => {}
  };
  await ComplexUIAdapters.fillSplitDate(mockMonthSelect, mockYearSelect, 'August 2022');
  assert.strictEqual(mockYearSelect.value, '2022');
  assert.strictEqual(mockMonthSelect.value, '08');

  // 6. fillSplitSalary with frequencies and currencies (INR, EUR, GBP)
  const currSelect = {
    tagName: 'SELECT',
    options: [{ value: 'EUR', text: 'EUR (€)' }, { value: 'INR', text: 'INR (₹)' }],
    dispatchEvent: () => {}
  };
  const freqSelect = {
    tagName: 'SELECT',
    options: [{ value: 'Monthly', text: 'Per Month' }, { value: 'Hourly', text: 'Per Hour' }],
    dispatchEvent: () => {}
  };
  const amtInput = {
    value: '',
    dispatchEvent: () => {}
  };

  await ComplexUIAdapters.fillSplitSalary(currSelect, amtInput, freqSelect, '€8,500 monthly');
  assert.strictEqual(currSelect.value, 'EUR');
  assert.strictEqual(amtInput.value, '8500');
  assert.strictEqual(freqSelect.value, 'Monthly');

  await ComplexUIAdapters.fillSplitSalary(currSelect, amtInput, freqSelect, '₹1200 hourly');
  assert.strictEqual(currSelect.value, 'INR');
  assert.strictEqual(freqSelect.value, 'Hourly');

  // 7. fillCascadingDropdown
  const parentSelect = {
    tagName: 'SELECT',
    options: [{ value: 'CA', text: 'California' }],
    dispatchEvent: () => {}
  };
  const childSelect = {
    tagName: 'SELECT',
    options: [{ value: 'SF', text: 'San Francisco' }],
    dispatchEvent: () => {}
  };
  const cascadeRes = await ComplexUIAdapters.fillCascadingDropdown(parentSelect, childSelect, 'California', 'San Francisco');
  assert.strictEqual(cascadeRes, true);
  assert.strictEqual(parentSelect.value, 'CA');
  assert.strictEqual(childSelect.value, 'SF');

  // 8. fillSliderRating invalid input
  const invalidSlider = await ComplexUIAdapters.fillSliderRating(null, '5');
  assert.strictEqual(invalidSlider, false);
  const nanSlider = await ComplexUIAdapters.fillSliderRating({}, 'not-a-number');
  assert.strictEqual(nanSlider, false);
});

test('AtsAdapters: middleName matching vs fullName protection and nested work experience role descriptions', async (t) => {
  const profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  profile.personal.firstName = "Pritam";
  profile.personal.middleName = "";
  profile.personal.lastName = "Rauniyar";
  profile.personal.fullName = "Pritam Rauniyar";

  // 1. Element with label "Middle Name" must match middleName, NOT fullName!
  const middleDesc = {
    tag: 'input',
    type: 'text',
    name: 'middle_name',
    id: 'applicant_middle_name',
    placeholder: 'Middle name',
    ariaLabel: 'Middle Name',
    autocomplete: 'additional-name',
    dataAutomationId: 'legalnamesection_middlename',
    combinedLabels: 'middle name',
    isRequired: false,
    isOptional: true
  };

  const matchMiddle = AtsAdapters.matchElement(middleDesc, profile);
  // Since middleName is empty in profile, it should NOT match fullName with "Pritam Rauniyar"!
  assert.strictEqual(matchMiddle.matched, false);

  // If middleName has a value, it matches middleName
  profile.personal.middleName = "Kumar";
  const matchMiddleWithVal = AtsAdapters.matchElement(middleDesc, profile);
  assert.strictEqual(matchMiddleWithVal.matched, true);
  assert.strictEqual(matchMiddleWithVal.value, "Kumar");
  assert.strictEqual(matchMiddleWithVal.def.key, "middleName");

  // 2. Element with label "Full Name" matches fullName
  const fullDesc = {
    tag: 'input',
    type: 'text',
    name: 'full_name',
    id: 'name',
    placeholder: 'Full name',
    ariaLabel: 'Full Name',
    autocomplete: 'name',
    dataAutomationId: 'legalnamesection_name',
    combinedLabels: 'full name',
    isRequired: true,
    isOptional: false
  };
  const matchFull = AtsAdapters.matchElement(fullDesc, profile);
  assert.strictEqual(matchFull.matched, true);
  assert.strictEqual(matchFull.def.key, "fullName");

  // 3. Work Experience Role Description: should NOT fall back to headline when description is empty!
  profile.dynamicFields = [];
  profile.experience.headline = "Senior Technical Architect & Engineer";
  profile.experience.items = [
    { id: "exp-1", company: "Uber", title: "SWE II", description: "" },
    { id: "exp-2", company: "Meta", title: "SWE I", description: "Engineered scalable microservices." }
  ];

  const roleDescElem = {
    tag: 'textarea',
    type: 'textarea',
    name: 'role_description',
    id: 'role_description',
    placeholder: 'Job responsibilities and accomplishments',
    ariaLabel: 'Role Description',
    autocomplete: '',
    dataAutomationId: 'roledescription',
    combinedLabels: 'role description',
    isRequired: false,
    isOptional: true
  };

  // Section 0 has empty description -> must NOT return headline, must return matched: false or empty!
  const matchRole0 = AtsAdapters.matchElement(roleDescElem, profile, 0);
  assert.strictEqual(matchRole0.matched, false);

  // Section 1 has description -> returns role description for section 1
  const matchRole1 = AtsAdapters.matchElement(roleDescElem, profile, 1);
  assert.strictEqual(matchRole1.matched, true);
  assert.strictEqual(matchRole1.value, "Engineered scalable microservices.");

  // 4. Nested dynamic fields resolution under experience.role_descriptions
  profile.dynamicFields = [
    {
      id: "df-exp-role-descriptions",
      category: "Work Experience",
      canonicalKey: "experience.role_descriptions",
      label: "Work Experience Role Descriptions",
      aliases: ["role description", "job description", "responsibilities"],
      value: "Role 1 fallback",
      nestedDetails: {
        "Work Experience 1": { roleDescription: "Nested description for job 1" },
        "Work Experience 2": { roleDescription: "Nested description for job 2" }
      }
    }
  ];

  // Remove standard items to test dynamic field fallback
  profile.experience.items = [];
  const dynRole0 = AtsAdapters.matchElement(roleDescElem, profile, 0);
  assert.strictEqual(dynRole0.matched, true);
  assert.strictEqual(dynRole0.value, "Nested description for job 1");

  const dynRole1 = AtsAdapters.matchElement(roleDescElem, profile, 1);
  assert.strictEqual(dynRole1.matched, true);
  assert.strictEqual(dynRole1.value, "Nested description for job 2");
});
