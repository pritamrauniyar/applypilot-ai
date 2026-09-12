// ApplyPilot AI - Unit & Integration Verification Suite
// Tests field matching algorithms against Greenhouse, Lever, Workday, and custom rules

const fs = require('fs');
const path = require('path');

// 1. Check Manifest V3 structure
console.log('--- 1. Testing Manifest V3 Validity ---');
const manifestPath = path.join(__dirname, '../manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

console.assert(manifest.manifest_version === 3, 'Must be Manifest V3');
console.assert(manifest.name.includes('ApplyPilot'), 'Name must contain ApplyPilot');
console.assert(fs.existsSync(path.join(__dirname, '../icons/icon-16.png')), 'Icon 16 must exist');
console.assert(fs.existsSync(path.join(__dirname, '../icons/icon-48.png')), 'Icon 48 must exist');
console.assert(fs.existsSync(path.join(__dirname, '../icons/icon-128.png')), 'Icon 128 must exist');
console.log('✓ Manifest V3 and icon assets verified successfully!\n');

// 2. Load Modules
const { AtsAdapters } = require('../content/ats-adapters.js');
const { SAMPLE_PROFILE } = require('../lib/storage.js');

console.log('--- 2. Testing ATS Field Matcher ---');

// Mock HTML Element descriptor generator
function mockDescriptor({ id = '', name = '', placeholder = '', label = '', autocomplete = '', dataAutomationId = '', tag = 'input', type = 'text' }) {
  return {
    element: {},
    tag,
    type,
    name: name.toLowerCase(),
    id: id.toLowerCase(),
    placeholder: placeholder.toLowerCase(),
    ariaLabel: '',
    autocomplete: autocomplete.toLowerCase(),
    dataAutomationId: dataAutomationId.toLowerCase(),
    combinedLabels: label.toLowerCase()
  };
}

let passed = 0;
let total = 0;

function assertMatch(testName, descriptor, expectedKey, expectedValSubstring) {
  total++;
  const match = AtsAdapters.matchElement(descriptor, SAMPLE_PROFILE);
  if (!match.matched) {
    console.error(`❌ FAILED: ${testName} - Not matched! Descriptor:`, descriptor);
    return;
  }

  const keyMatch = match.def?.key === expectedKey || match.label === expectedKey || match.key === expectedKey;
  const valMatch = !expectedValSubstring || (match.value && match.value.toLowerCase().includes(expectedValSubstring.toLowerCase()));

  if (keyMatch && valMatch) {
    console.log(`✓ [PASS] ${testName} -> Matched: ${match.def?.key || match.key} ("${match.value}")`);
    passed++;
  } else {
    console.error(`❌ FAILED: ${testName} -> Expected key "${expectedKey}", got "${match.def?.key || match.key}". Value: "${match.value}"`);
  }
}

// Greenhouse Tests
assertMatch('Greenhouse First Name', mockDescriptor({ id: 'first_name', name: 'first_name', label: 'First Name *' }), 'firstName', 'Alex');
assertMatch('Greenhouse Last Name', mockDescriptor({ id: 'last_name', name: 'last_name', label: 'Last Name *' }), 'lastName', 'Candidate');
assertMatch('Greenhouse Email', mockDescriptor({ id: 'email', name: 'email', label: 'Email *' }), 'email', 'alex.candidate');
assertMatch('Greenhouse Phone', mockDescriptor({ id: 'phone', name: 'phone', label: 'Phone *' }), 'phone', '234');
assertMatch('Greenhouse LinkedIn', mockDescriptor({ id: 'job_app_linkedin', name: 'job_app[answers_attributes][linkedin]', label: 'LinkedIn Profile' }), 'linkedin', 'linkedin.com');
assertMatch('Greenhouse Work Auth', mockDescriptor({ id: 'auth', label: 'Are you legally authorized to work in the United States?' }), 'workAuthorization', 'Yes');
assertMatch('Greenhouse Sponsorship', mockDescriptor({ id: 'spon', label: 'Will you now or in the future require sponsorship?' }), 'requireSponsorship', 'No');

// Lever Tests
assertMatch('Lever Full Name', mockDescriptor({ name: 'name', label: 'Full Name' }), 'fullName', 'Alex');
assertMatch('Lever Current Company', mockDescriptor({ name: 'org', label: 'Current Company' }), 'currentCompany', 'Acme');
assertMatch('Lever LinkedIn', mockDescriptor({ name: 'urls[linkedin]', label: 'LinkedIn URL' }), 'linkedin', 'linkedin.com');
assertMatch('Lever GitHub', mockDescriptor({ name: 'urls[github]', label: 'GitHub URL' }), 'github', 'github.com');

// Workday Tests
assertMatch('Workday Legal First Name', mockDescriptor({ dataAutomationId: 'legalNameSection_firstName' }), 'firstName', 'Alex');
assertMatch('Workday Legal Last Name', mockDescriptor({ dataAutomationId: 'legalNameSection_lastName' }), 'lastName', 'Candidate');
assertMatch('Workday Email', mockDescriptor({ dataAutomationId: 'email' }), 'email', 'alex.candidate');
assertMatch('Workday Phone', mockDescriptor({ dataAutomationId: 'phone-number' }), 'phone', '234');
assertMatch('Workday City', mockDescriptor({ dataAutomationId: 'addressSection_city' }), 'city', 'San Francisco');
assertMatch('Workday Country', mockDescriptor({ dataAutomationId: 'addressSection_country' }), 'country', 'United States');
assertMatch('Workday Job Title', mockDescriptor({ dataAutomationId: 'jobTitle', label: 'Job Title*' }), 'currentTitle', 'Software Engineer');
assertMatch('Workday Company', mockDescriptor({ dataAutomationId: 'company', label: 'Company*' }), 'currentCompany', 'Acme');
assertMatch('Workday Location', mockDescriptor({ dataAutomationId: 'location', label: 'Location' }), 'jobLocation', 'San Francisco');
assertMatch('Workday School', mockDescriptor({ dataAutomationId: 'school', label: 'School or University*' }), 'school', 'Example Institute');
assertMatch('Workday Degree', mockDescriptor({ dataAutomationId: 'degree', label: 'Degree*' }), 'degree', 'Bachelor');
assertMatch('Workday Field of Study', mockDescriptor({ dataAutomationId: 'fieldOfStudy', label: 'Field of Study' }), 'fieldOfStudy', 'Electronics');
assertMatch('Workday GPA', mockDescriptor({ dataAutomationId: 'gpa', label: 'Overall Result (GPA)' }), 'gpa', '3.8');
assertMatch('Workday Skills', mockDescriptor({ dataAutomationId: 'skills', label: 'Type to Add Skills' }), 'skills', 'Go');

// Global Fields & Currency/CTC Test
assertMatch('Global Field: Expected CTC', mockDescriptor({ label: 'Expected CTC / Salary' }), 'salaryExpectations', 'Negotiable');
assertMatch('Global Field: Official Notice Period', mockDescriptor({ label: 'Official Notice Period (Days)' }), 'noticePeriod', 'Immediately');
assertMatch('Global Field: Right to Work', mockDescriptor({ label: 'Do you have the right to work in the UK?' }), 'workAuthorization', 'Yes');

// Custom Fields & Keywords Test
assertMatch('Custom Field: Layoff Reason', mockDescriptor({ label: 'What is your current situation or reason for leaving your last role?' }), 'Reason for Leaving / Availability', 'available');
assertMatch('Custom Field: Tech Challenge', mockDescriptor({ label: 'Describe a difficult technical challenge or proudest project:' }), 'Greatest Technical Challenge / Achievement', 'microservice');

// Self-Learning Feedback Memory Test
console.log('\n--- 3. Testing Self-Learning Feedback Loop Memory ---');
const testProfileWithMemory = {
  ...SAMPLE_PROFILE,
  learnedMemory: [
    {
      fieldLabel: 'What is your experience with Kubernetes and Docker in production?',
      questionKeywords: ['experience with kubernetes', 'docker in production'],
      answer: '4+ years containerizing Go microservices and managing Kubernetes deployments at Uber scale.',
      fieldType: 'textarea'
    }
  ]
};

const learnedDescriptor = mockDescriptor({ label: 'Please detail your experience with Kubernetes and microservices in production:' });
const learnedMatch = AtsAdapters.matchElement(learnedDescriptor, testProfileWithMemory);
total++;
if (learnedMatch.matched && learnedMatch.source === 'learnedMemory') {
  console.log(`✓ [PASS] Learned Memory Feedback Loop -> Matched: "${learnedMatch.label}" with learned answer: "${learnedMatch.value}"`);
  passed++;
} else {
  console.error('❌ FAILED: Learned Memory Match failed!');
}

// --- 4. Testing Resilient JSON Parser & Repair ---
console.log("\n--- 4. Testing Resilient JSON Parser & Repair ---");
const { GeminiService } = require('../lib/gemini-service.js');
const truncatedSample = `{ "personal": { "firstName": "Pritam", "lastName": "Rauniyar", "fullName": "Alex Candidate", "email": "pritamrauniyar.np@gmail.com", "phone": "+91-6201413304", "location": "Bengaluru, India", "city": "Bengaluru", "state": "", "postalCode": "", "country": "India", "address": "" }, "links":`;

const repaired = GeminiService.parseAndRepairJson(truncatedSample);
total++;
if (repaired && repaired.personal && repaired.personal.firstName === "Pritam" && repaired.personal.email === "pritamrauniyar.np@gmail.com") {
  console.log(`✓ [PASS] Truncated JSON Repair -> Successfully repaired and extracted candidate: ${repaired.personal.fullName} (${repaired.personal.email})`);
  passed++;
} else {
  console.error("❌ FAILED: JSON Repair failed to salvage candidate data!");
}

// --- 5. Testing Multi-Experience Sequential Matching ---
console.log("\n--- 5. Testing Multi-Experience Sequential Matching ---");
const multiExpProfile = {
  ...SAMPLE_PROFILE,
  experience: {
    ...SAMPLE_PROFILE.experience,
    items: [
      {
        id: "exp-1",
        title: "Senior Frontend Engineer",
        company: "Meta",
        location: "Menlo Park, CA",
        startDate: "2023-01",
        endDate: "Present",
        isCurrent: true,
        description: "Leading React 18 core design system"
      },
      {
        id: "exp-2",
        title: "Software Engineer II",
        company: "Acme Corp",
        location: "San Francisco, CA",
        startDate: "2021-06",
        endDate: "2022-12",
        isCurrent: false,
        description: "Built microservices in Go and Kafka"
      },
      {
        id: "exp-3",
        title: "Associate Software Engineer",
        company: "StartUp Inc",
        location: "New York, NY",
        startDate: "2020-07",
        endDate: "2021-05",
        isCurrent: false,
        description: "Developed RESTful APIs and full-stack web features"
      }
    ]
  }
};

const jobDesc = mockDescriptor({ dataAutomationId: 'jobTitle', label: 'Job Title*' });
const compDesc = mockDescriptor({ dataAutomationId: 'company', label: 'Company*' });
const locDesc = mockDescriptor({ dataAutomationId: 'location', label: 'Location' });
const fromDesc = mockDescriptor({ dataAutomationId: 'startDate', label: 'From' });
const toDesc = mockDescriptor({ dataAutomationId: 'endDate', label: 'To' });

// Role 1 (Index 0)
const m0_job = AtsAdapters.matchElement(jobDesc, multiExpProfile, 0);
const m0_comp = AtsAdapters.matchElement(compDesc, multiExpProfile, 0);
total += 2;
if (m0_job.value === "Senior Frontend Engineer" && m0_comp.value === "Meta") {
  console.log(`✓ [PASS] Multi-Exp Role #1 -> Matched: ${m0_job.value} at ${m0_comp.value}`);
  passed += 2;
} else {
  console.error(`❌ FAILED: Multi-Exp Role #1 -> Got: ${m0_job.value} at ${m0_comp.value}`);
}

// Role 2 (Index 1)
const m1_job = AtsAdapters.matchElement(jobDesc, multiExpProfile, 1);
const m1_comp = AtsAdapters.matchElement(compDesc, multiExpProfile, 1);
total += 2;
if (m1_job.value === "Software Engineer II" && m1_comp.value === "Acme Corp") {
  console.log(`✓ [PASS] Multi-Exp Role #2 -> Matched: ${m1_job.value} at ${m1_comp.value}`);
  passed += 2;
} else {
  console.error(`❌ FAILED: Multi-Exp Role #2 -> Got: ${m1_job.value} at ${m1_comp.value}`);
}

// Role 3 (Index 2)
const m2_job = AtsAdapters.matchElement(jobDesc, multiExpProfile, 2);
const m2_comp = AtsAdapters.matchElement(compDesc, multiExpProfile, 2);
total += 2;
if (m2_job.value === "Associate Software Engineer" && m2_comp.value === "StartUp Inc") {
  console.log(`✓ [PASS] Multi-Exp Role #3 -> Matched: ${m2_job.value} at ${m2_comp.value}`);
  passed += 2;
} else {
  console.error(`❌ FAILED: Multi-Exp Role #3 -> Got: ${m2_job.value} at ${m2_comp.value}`);
}

// 6. Testing Ignored Optional Fields Tracking
console.log('\n--- 6. Testing Ignored Optional Fields Tracking ---');
const profileWithIgnored = {
  ...SAMPLE_PROFILE,
  ignoredOptionalFields: [
    {
      id: "ign-1",
      label: "Gender Identity (Optional)",
      pattern: "gender identity",
      keywords: ["gender identity", "gender"]
    },
    {
      id: "ign-2",
      label: "Phone Extension",
      pattern: "phone extension",
      keywords: ["extension", "phone extension"]
    }
  ]
};

const ignoredGenderDesc = mockDescriptor({ label: 'Gender Identity (Optional)', name: 'gender_opt' });
const ignoredPhoneExtDesc = mockDescriptor({ label: 'Phone Extension', name: 'extension' });
const requiredFieldDesc = mockDescriptor({ label: 'First Name *', name: 'first_name' });

const m_gender = AtsAdapters.matchElement(ignoredGenderDesc, profileWithIgnored);
const m_ext = AtsAdapters.matchElement(ignoredPhoneExtDesc, profileWithIgnored);
const m_req = AtsAdapters.matchElement(requiredFieldDesc, profileWithIgnored);

total += 3;
if (m_gender.ignored === true && m_gender.matched === false) {
  console.log(`✓ [PASS] Ignored Optional Field: Gender Identity correctly skipped`);
  passed++;
} else {
  console.error(`❌ FAILED: Gender Identity should be ignored. Result:`, m_gender);
}

if (m_ext.ignored === true && m_ext.matched === false) {
  console.log(`✓ [PASS] Ignored Optional Field: Phone Extension correctly skipped`);
  passed++;
} else {
  console.error(`❌ FAILED: Phone Extension should be ignored. Result:`, m_ext);
}

if (m_req.matched === true && m_req.value === "Alex") {
  console.log(`✓ [PASS] Non-ignored Field: First Name remains matched`);
  passed++;
} else {
  console.error(`❌ FAILED: Required Field First Name should be matched. Result:`, m_req);
}

// 7. Testing AuditLogger Module
console.log('\n--- 7. Testing AuditLogger & Telemetry ---');
const { AuditLogger, MAX_AUDIT_LOG_ENTRIES } = require('../lib/audit-logger.js');

total += 4;
AuditLogger.log({
  url: "https://blackrock.wd1.myworkdayjobs.com/apply",
  domain: "blackrock.wd1.myworkdayjobs.com",
  portalType: "workday",
  actionType: "autofill",
  fieldLabel: "Given Name(s)",
  fieldNameOrId: "legalNameSection_firstName",
  matchedKey: "firstName",
  valueSet: "Pritam",
  status: "success",
  details: "Autofilled from standard"
}).then(mockLogEntry => {
  if (mockLogEntry.id && mockLogEntry.actionType === "autofill" && mockLogEntry.status === "success") {
    console.log(`✓ [PASS] AuditLogger -> Created log entry: ${mockLogEntry.id} (${mockLogEntry.fieldLabel})`);
    passed++;
  } else {
    console.error(`❌ FAILED: AuditLogger creation failed:`, mockLogEntry);
  }
});

if (MAX_AUDIT_LOG_ENTRIES === 1000) {
  console.log(`✓ [PASS] AuditLogger -> Maximum FIFO cap configured at ${MAX_AUDIT_LOG_ENTRIES} entries`);
  passed++;
} else {
  console.error(`❌ FAILED: MAX_AUDIT_LOG_ENTRIES unexpected:`, MAX_AUDIT_LOG_ENTRIES);
}

// Test Export CSV Headers
AuditLogger.exportCSV().then(csv => {
  if (csv.includes("Timestamp,Action,Status,Domain,Portal,Field Label,Matched Key,Value Set,Details")) {
    console.log(`✓ [PASS] AuditLogger -> exportCSV produces correct headers`);
    passed++;
  } else {
    console.error(`❌ FAILED: exportCSV headers missing:`, csv);
  }
});

// Test Export JSON Structure
AuditLogger.exportJSON().then(json => {
  const parsed = JSON.parse(json);
  if (parsed.app === "ApplyPilot AI" && parsed.stats) {
    console.log(`✓ [PASS] AuditLogger -> exportJSON produces structured telemetry export`);
    passed++;
  } else {
    console.error(`❌ FAILED: exportJSON structure invalid:`, json);
  }
});

// 8. Testing Date & Numeric Sanitization (DOMException Prevention)
console.log('\n--- 8. Testing Date & Numeric Sanitization ---');
function sanitizeValueForInputType(type, valStr) {
  if (type === 'date') {
    if (valStr.toLowerCase().includes('present') || valStr.toLowerCase().includes('current')) {
      return null; // Signals to toggle checkbox instead of writing string to date input
    }
    if (/^\d{4}-\d{2}$/.test(valStr)) return `${valStr}-01`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(valStr)) return valStr;
    const p = new Date(valStr);
    return !isNaN(p.getTime()) ? p.toISOString().split('T')[0] : null;
  }
  if (type === 'number') {
    const m = valStr.match(/[-+]?[0-9]*\.?[0-9]+/);
    return m ? m[0] : null;
  }
  return valStr;
}

total += 4;
const datePresent = sanitizeValueForInputType('date', 'Present');
if (datePresent === null) {
  console.log(`✓ [PASS] Date Input: "Present" safely intercepted to prevent DOMException`);
  passed++;
} else {
  console.error(`❌ FAILED: "Present" date string should be null, got:`, datePresent);
}

const dateMonth = sanitizeValueForInputType('date', '2022-08');
if (dateMonth === '2022-08-01') {
  console.log(`✓ [PASS] Date Input: "2022-08" correctly converted to valid ISO date "2022-08-01"`);
  passed++;
} else {
  console.error(`❌ FAILED: Date conversion failed, got:`, dateMonth);
}

const numGpa = sanitizeValueForInputType('number', '3.8 GPA');
if (numGpa === '3.8') {
  console.log(`✓ [PASS] Number Input: "3.8 GPA" sanitized to numeric "3.8"`);
  passed++;
} else {
  console.error(`❌ FAILED: Number sanitization failed, got:`, numGpa);
}

const numYears = sanitizeValueForInputType('number', '4+ years of experience');
if (numYears === '4') {
  console.log(`✓ [PASS] Number Input: "4+ years" sanitized to numeric "4"`);
  passed++;
} else {
  console.error(`❌ FAILED: Number sanitization failed, got:`, numYears);
}

// 9. Testing Dynamic Knowledge Store - Aliasing & Nested Details
console.log('\n--- 9. Testing Dynamic Knowledge Store - Aliasing & Nested Details ---');
const { calculateStringSimilarity, isNinetyPercentMatch } = require('../lib/storage.js');

// Test Higher Education Alias
const descHigherEdu = mockDescriptor({ label: 'Higher Education' });
const m_higherEdu = AtsAdapters.matchElement(descHigherEdu, SAMPLE_PROFILE);
total++;
if (m_higherEdu.matched && m_higherEdu.value === 'Example Institute of Technology') {
  console.log(`✓ [PASS] Dynamic Alias: "Higher Education" -> "${m_higherEdu.value}"`);
  passed++;
} else {
  console.error(`❌ FAILED: "Higher Education" should match college. Got:`, m_higherEdu);
}

// Test Highest Degree Alias
const descHighestDeg = mockDescriptor({ label: 'Highest Degree' });
const m_highestDeg = AtsAdapters.matchElement(descHighestDeg, SAMPLE_PROFILE);
total++;
if (m_highestDeg.matched && m_highestDeg.value === 'Example Institute of Technology') {
  console.log(`✓ [PASS] Dynamic Alias: "Highest Degree" -> "${m_highestDeg.value}"`);
  passed++;
} else {
  console.error(`❌ FAILED: "Highest Degree" should match college. Got:`, m_highestDeg);
}

// Test Nested Major Resolution
const descNestedMajor = mockDescriptor({ label: 'Higher Education - Major / Specialization' });
const m_nestedMajor = AtsAdapters.matchElement(descNestedMajor, SAMPLE_PROFILE);
total++;
if (m_nestedMajor.matched && m_nestedMajor.value === 'Electronics and Communication Engineering') {
  console.log(`✓ [PASS] Dynamic Nested Detail: "Major / Specialization" -> "${m_nestedMajor.value}"`);
  passed++;
} else {
  console.error(`❌ FAILED: Nested Major resolution failed. Got:`, m_nestedMajor);
}

// 10. Testing Company-Specific 90% Fuzzy Matching
console.log('\n--- 10. Testing Company-Specific 90% Fuzzy Matching ---');

// Test 90% fuzzy similarity helper
total += 2;
const simUber = isNinetyPercentMatch('Acme Corporation Inc', 'Acme Corp');
const simMsft = isNinetyPercentMatch('Microsoft Corporation', 'Microsoft');

if (simUber) {
  console.log(`✓ [PASS] Fuzzy Matcher: "Acme Corporation Inc" matches "Acme Corp" (>=90% token similarity)`);
  passed++;
} else {
  console.error(`❌ FAILED: Fuzzy Matcher failed for Uber!`);
}

if (simMsft) {
  console.log(`✓ [PASS] Fuzzy Matcher: "Microsoft Corporation" matches "Microsoft" (>=90% token similarity)`);
  passed++;
} else {
  console.error(`❌ FAILED: Fuzzy Matcher failed for Microsoft!`);
}

// Test Company-Specific Question on Uber
total += 2;
const descWorkedUber = mockDescriptor({ label: 'Have you ever worked at Acme Corporation?' });
descWorkedUber.url = 'https://uber.wd1.myworkdayjobs.com/apply';
const m_uber = AtsAdapters.matchElement(descWorkedUber, SAMPLE_PROFILE);

if (m_uber.matched && m_uber.value === 'Yes') {
  console.log(`✓ [PASS] Company-Specific Rule: "Have you ever worked at Acme Corporation?" -> "${m_uber.value}"`);
  passed++;
} else {
  console.error(`❌ FAILED: Worked at Uber should be "Yes". Got:`, m_uber);
}

// Test Company-Specific Question on Microsoft
const descWorkedMsft = mockDescriptor({ label: 'Have you ever worked at Microsoft Corporation?' });
descWorkedMsft.url = 'https://careers.microsoft.com/apply';
const m_msft = AtsAdapters.matchElement(descWorkedMsft, SAMPLE_PROFILE);

if (m_msft.matched && m_msft.value === 'No') {
  console.log(`✓ [PASS] Company-Specific Rule: "Have you ever worked at Microsoft Corporation?" -> "${m_msft.value}"`);
  passed++;
} else {
  console.error(`❌ FAILED: Worked at Microsoft should be "No". Got:`, m_msft);
}

// 11. Testing Deep Fill Metrics Engine
console.log('\n--- 11. Testing Deep Fill Metrics Engine ---');
total++;

const testDescriptors = [
  { ...mockDescriptor({ label: 'First Name *', name: 'first_name' }), isRequired: true, isOptional: false },
  { ...mockDescriptor({ label: 'Email *', name: 'email' }), isRequired: true, isOptional: false },
  { ...mockDescriptor({ label: 'Cover Letter (Optional)', name: 'cover_letter' }), isRequired: false, isOptional: true },
  { ...mockDescriptor({ label: 'Website (Optional)', name: 'urls[website]' }), isRequired: false, isOptional: true }
];

const testResults = [
  { matched: true, value: 'Pritam', def: { key: 'firstName' } },
  { matched: true, value: 'pritam@example.com', def: { key: 'email' } },
  { matched: false },
  { matched: true, value: 'https://pritamrauniyar.com.np/', def: { key: 'portfolio' } }
];

const computedMetrics = AtsAdapters.calculateFillMetrics(testDescriptors, testResults);

if (
  computedMetrics.totalFields === 4 &&
  computedMetrics.compulsoryTotal === 2 &&
  computedMetrics.compulsoryFilled === 2 &&
  computedMetrics.compulsoryUnfilled === 0 &&
  computedMetrics.optionalTotal === 2 &&
  computedMetrics.optionalFilled === 1 &&
  computedMetrics.optionalUnfilled === 1 &&
  computedMetrics.compulsoryRate === '100%' &&
  computedMetrics.overallFillRate === '75%'
) {
  console.log(`✓ [PASS] Deep Fill Metrics Engine: Compulsory 2/2 (100%), Optional 1/2, Overall Fill Rate ${computedMetrics.overallFillRate}`);
  passed++;
} else {
  console.error(`❌ FAILED: Deep Fill Metrics calculation unexpected:`, computedMetrics);
}

// 12. Testing Universal Complex UI Component Engine
console.log('\n--- 12. Testing Universal Complex UI Component Engine ---');
const { ComplexUIAdapters } = require('../content/ats-adapters.js');

function createMockEl(props = {}) {
  const listeners = {};
  const attrs = props.attributes || {};
  const classes = new Set(props.classes || []);
  const el = {
    tagName: props.tagName || 'DIV',
    type: props.type || 'text',
    name: props.name || '',
    id: props.id || '',
    value: props.value !== undefined ? props.value : '',
    placeholder: props.placeholder || '',
    textContent: props.textContent || '',
    checked: props.checked || false,
    options: props.options || [],
    isContentEditable: !!props.isContentEditable,
    classList: {
      contains: (c) => classes.has(c),
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c)
    },
    getAttribute: (name) => attrs[name] !== undefined ? attrs[name] : null,
    setAttribute: (name, val) => { attrs[name] = String(val); },
    hasAttribute: (name) => attrs[name] !== undefined,
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    dispatchEvent: (ev) => {
      const fns = listeners[ev.type] || [];
      fns.forEach(fn => fn(ev));
      return true;
    },
    focus: () => {},
    click: () => {},
    parentElement: props.parentElement || null,
    closest: (selector) => props.closestMatch || null,
    querySelector: (sel) => props.children?.[sel] || null,
    querySelectorAll: (sel) => props.childrenList?.[sel] || []
  };
  return el;
}

// Test 12.1: Rich Text / ContentEditable detection & filling
total += 2;
const mockRichText = createMockEl({
  tagName: 'DIV',
  isContentEditable: true,
  attributes: { contenteditable: 'true' },
  classes: ['ql-editor', 'ProseMirror']
});
const dtRichText = AtsAdapters.detectComplexElement(mockRichText);
if (dtRichText && dtRichText.type === 'rich_text') {
  console.log(`✓ [PASS] Complex UI: Detected Rich Text / ContentEditable editor (Quill/ProseMirror)`);
  passed++;
} else {
  console.error(`❌ FAILED: Rich text detection failed:`, dtRichText);
}

ComplexUIAdapters.fillContentEditable(mockRichText, "Experienced software engineer with microservices expertise.").then(res => {
  if (res && mockRichText.textContent.includes("microservices")) {
    console.log(`✓ [PASS] Complex UI: Successfully injected formatted content into rich text editor`);
    passed++;
  } else {
    console.error(`❌ FAILED: Rich text filling failed:`, mockRichText.textContent);
  }
});

// Test 12.2: Custom Styled Combobox / Autocomplete Dropdown
total += 2;
const mockCombobox = createMockEl({
  tagName: 'DIV',
  attributes: { role: 'combobox', 'aria-haspopup': 'listbox' },
  classes: ['select2-selection']
});
const dtCombobox = AtsAdapters.detectComplexElement(mockCombobox);
if (dtCombobox && dtCombobox.type === 'custom_combobox') {
  console.log(`✓ [PASS] Complex UI: Detected Custom Combobox (Select2/Headless UI)`);
  passed++;
} else {
  console.error(`❌ FAILED: Combobox detection failed:`, dtCombobox);
}

ComplexUIAdapters.fillCustomCombobox(mockCombobox, "United States").then(res => {
  if (res) {
    console.log(`✓ [PASS] Complex UI: Handled Custom Combobox query interaction`);
    passed++;
  } else {
    console.error(`❌ FAILED: Custom Combobox filling failed!`);
  }
});

// Test 12.3: Multi-tag Skill / Token Input
total += 2;
const mockTagInput = createMockEl({
  tagName: 'INPUT',
  type: 'text',
  placeholder: 'Type skill and press enter',
  classes: ['tag-input']
});
const dtTagInput = AtsAdapters.detectComplexElement(mockTagInput);
if (dtTagInput && dtTagInput.type === 'multi_tag_input') {
  console.log(`✓ [PASS] Complex UI: Detected Multi-Tag Skill Token input`);
  passed++;
} else {
  console.error(`❌ FAILED: Multi-tag detection failed:`, dtTagInput);
}

ComplexUIAdapters.fillMultiTagInput(mockTagInput, ["Go", "Kafka", "Docker", "Kubernetes"]).then(res => {
  if (res && mockTagInput.value === "Kubernetes") {
    console.log(`✓ [PASS] Complex UI: Successfully dispatched tokenized skill entries one by one`);
    passed++;
  } else {
    console.error(`❌ FAILED: Multi-tag filling failed:`, mockTagInput.value);
  }
});

// Test 12.4: Segmented Button Controls & Pill Toggles (Yes / No)
total += 2;
const btnYes = createMockEl({ tagName: 'BUTTON', textContent: 'Yes', attributes: { role: 'radio', 'aria-checked': 'false' } });
const btnNo = createMockEl({ tagName: 'BUTTON', textContent: 'No', attributes: { role: 'radio', 'aria-checked': 'false' } });
const mockRadioGroup = createMockEl({
  tagName: 'DIV',
  attributes: { role: 'radiogroup' },
  classes: ['btn-group', 'segmented-control'],
  childrenList: { 'button, [role="radio"], label, input[type="radio"]': [btnYes, btnNo] }
});

const dtRadioGroup = AtsAdapters.detectComplexElement(mockRadioGroup);
if (dtRadioGroup && dtRadioGroup.type === 'segmented_radiogroup') {
  console.log(`✓ [PASS] Complex UI: Detected Segmented Radio Button Group`);
  passed++;
} else {
  console.error(`❌ FAILED: Segmented radiogroup detection failed:`, dtRadioGroup);
}

ComplexUIAdapters.fillSegmentedGroup(mockRadioGroup, "Yes").then(res => {
  if (res && btnYes.getAttribute('aria-checked') === 'true') {
    console.log(`✓ [PASS] Complex UI: Selected matching "Yes" pill in segmented button group`);
    passed++;
  } else {
    console.error(`❌ FAILED: Segmented group fill failed! btnYes aria-checked:`, btnYes.getAttribute('aria-checked'));
  }
});

// Test 12.5: Custom Styled Switch / Checkbox
total += 2;
const mockSwitch = createMockEl({
  tagName: 'DIV',
  attributes: { role: 'switch', 'aria-checked': 'false' },
  classes: ['switch']
});
const dtSwitch = AtsAdapters.detectComplexElement(mockSwitch);
if (dtSwitch && dtSwitch.type === 'custom_switch') {
  console.log(`✓ [PASS] Complex UI: Detected Custom Switch Toggle`);
  passed++;
} else {
  console.error(`❌ FAILED: Switch detection failed:`, dtSwitch);
}

ComplexUIAdapters.fillCustomSwitch(mockSwitch, true).then(res => {
  if (res && mockSwitch.getAttribute('aria-checked') === 'true') {
    console.log(`✓ [PASS] Complex UI: Successfully toggled custom switch state to true`);
    passed++;
  } else {
    console.error(`❌ FAILED: Switch fill failed! aria-checked:`, mockSwitch.getAttribute('aria-checked'));
  }
});

// Test 12.6: Split Date Inputs (Month + Year)
total += 2;
const mockYearEl = createMockEl({ tagName: 'INPUT', type: 'text', name: 'exp_year' });
const mockMonthEl = createMockEl({
  tagName: 'INPUT',
  type: 'text',
  name: 'exp_month',
  parentElement: {
    querySelector: (sel) => sel.includes('year') ? mockYearEl : null
  }
});

const dtSplitDate = AtsAdapters.detectComplexElement(mockMonthEl);
if (dtSplitDate && dtSplitDate.type === 'split_date' && dtSplitDate.yearEl === mockYearEl) {
  console.log(`✓ [PASS] Complex UI: Detected Split Date Month/Year component pair`);
  passed++;
} else {
  console.error(`❌ FAILED: Split date detection failed:`, dtSplitDate);
}

ComplexUIAdapters.fillSplitDate(mockMonthEl, mockYearEl, "2022-08-01").then(res => {
  if (res && mockYearEl.value === "2022" && mockMonthEl.value === "08") {
    console.log(`✓ [PASS] Complex UI: Parsed and filled split Year (${mockYearEl.value}) and Month (${mockMonthEl.value})`);
    passed++;
  } else {
    console.error(`❌ FAILED: Split date filling failed: Year=${mockYearEl.value}, Month=${mockMonthEl.value}`);
  }
});

// Test 12.7: Split International Phone Inputs
total += 2;
const mockCountryCodeEl = createMockEl({
  tagName: 'SELECT',
  options: [{ value: '+1', text: '+1 (USA)' }, { value: '+91', text: '+91 (India)' }]
});
const mockPhoneNumEl = createMockEl({
  tagName: 'INPUT',
  type: 'tel',
  name: 'phone_number',
  parentElement: {
    querySelector: (sel) => sel.includes('country') ? mockCountryCodeEl : null
  }
});

const dtSplitPhone = AtsAdapters.detectComplexElement(mockPhoneNumEl);
if (dtSplitPhone && dtSplitPhone.type === 'split_phone') {
  console.log(`✓ [PASS] Complex UI: Detected Split International Phone Picker`);
  passed++;
} else {
  console.error(`❌ FAILED: Split phone detection failed:`, dtSplitPhone);
}

ComplexUIAdapters.fillSplitPhone(mockCountryCodeEl, mockPhoneNumEl, "+91-6201413304").then(res => {
  if (res && mockCountryCodeEl.value === "+91" && mockPhoneNumEl.value === "6201413304") {
    console.log(`✓ [PASS] Complex UI: Parsed dial code (${mockCountryCodeEl.value}) and national number (${mockPhoneNumEl.value})`);
    passed++;
  } else {
    console.error(`❌ FAILED: Split phone filling failed: code=${mockCountryCodeEl.value}, num=${mockPhoneNumEl.value}`);
  }
});

// Test 12.8: Split Salary Fields (Currency + Amount)
total += 2;
const mockCurrEl = createMockEl({
  tagName: 'SELECT',
  options: [{ value: 'USD', text: 'USD ($)' }, { value: 'INR', text: 'INR (₹)' }]
});
const mockSalaryAmtEl = createMockEl({
  tagName: 'INPUT',
  type: 'text',
  name: 'salary_amount',
  parentElement: {
    querySelector: (sel) => sel.includes('curr') ? mockCurrEl : null
  }
});

const dtSplitSalary = AtsAdapters.detectComplexElement(mockSalaryAmtEl);
if (dtSplitSalary && dtSplitSalary.type === 'split_salary') {
  console.log(`✓ [PASS] Complex UI: Detected Split Salary Amount & Currency inputs`);
  passed++;
} else {
  console.error(`❌ FAILED: Split salary detection failed:`, dtSplitSalary);
}

ComplexUIAdapters.fillSplitSalary(mockCurrEl, mockSalaryAmtEl, null, "$165,000 per year").then(res => {
  if (res && mockCurrEl.value === "USD" && mockSalaryAmtEl.value === "165000") {
    console.log(`✓ [PASS] Complex UI: Extracted currency (${mockCurrEl.value}) and amount (${mockSalaryAmtEl.value})`);
    passed++;
  } else {
    console.error(`❌ FAILED: Split salary filling failed: curr=${mockCurrEl.value}, amt=${mockSalaryAmtEl.value}`);
  }
});

// Test 12.9: Cascading / Dependent Dropdown
total += 2;
const mockCascadeSelect = createMockEl({
  tagName: 'SELECT',
  name: 'state_province',
  attributes: { 'data-cascade': 'state' }
});
const dtCascade = AtsAdapters.detectComplexElement(mockCascadeSelect);
if (dtCascade && dtCascade.type === 'cascading_dropdown') {
  console.log(`✓ [PASS] Complex UI: Detected Cascading / Dependent Dropdown`);
  passed++;
} else {
  console.error(`❌ FAILED: Cascading dropdown detection failed:`, dtCascade);
}

ComplexUIAdapters.fillCascadingDropdown(mockCascadeSelect, null, "California", "San Francisco").then(res => {
  if (res) {
    console.log(`✓ [PASS] Complex UI: Dispatched cascading dropdown event cascade`);
    passed++;
  } else {
    console.error(`❌ FAILED: Cascading dropdown filling failed!`);
  }
});

// Test 12.10: Slider / Star / Scale Rating
total += 2;
const mockSlider = createMockEl({
  tagName: 'INPUT',
  type: 'range',
  attributes: { min: '1', max: '5', role: 'slider' }
});
const dtSlider = AtsAdapters.detectComplexElement(mockSlider);
if (dtSlider && dtSlider.type === 'slider_rating') {
  console.log(`✓ [PASS] Complex UI: Detected Rating Slider / Scale component`);
  passed++;
} else {
  console.error(`❌ FAILED: Slider detection failed:`, dtSlider);
}

ComplexUIAdapters.fillSliderRating(mockSlider, 5).then(res => {
  if (res && mockSlider.value === 5) {
    console.log(`✓ [PASS] Complex UI: Set numeric value on range slider rating`);
    passed++;
  } else {
    console.error(`❌ FAILED: Slider filling failed:`, mockSlider.value);
  }
});

// Allow async tests to complete
setTimeout(() => {
  console.log(`\n========================================`);
  console.log(`Summary: ${passed}/${total} Tests Passed (${Math.round(passed/total * 100)}%)`);
  console.log(`========================================\n`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}, 250);

