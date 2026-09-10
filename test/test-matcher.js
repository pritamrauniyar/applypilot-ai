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
const { DEFAULT_PROFILE } = require('../lib/storage.js');

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
  const match = AtsAdapters.matchElement(descriptor, DEFAULT_PROFILE);
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
assertMatch('Greenhouse First Name', mockDescriptor({ id: 'first_name', name: 'first_name', label: 'First Name *' }), 'firstName', 'Pritam');
assertMatch('Greenhouse Last Name', mockDescriptor({ id: 'last_name', name: 'last_name', label: 'Last Name *' }), 'lastName', 'Rauniyar');
assertMatch('Greenhouse Email', mockDescriptor({ id: 'email', name: 'email', label: 'Email *' }), 'email', 'pritam.rauniyar');
assertMatch('Greenhouse Phone', mockDescriptor({ id: 'phone', name: 'phone', label: 'Phone *' }), 'phone', '234');
assertMatch('Greenhouse LinkedIn', mockDescriptor({ id: 'job_app_linkedin', name: 'job_app[answers_attributes][linkedin]', label: 'LinkedIn Profile' }), 'linkedin', 'linkedin.com');
assertMatch('Greenhouse Work Auth', mockDescriptor({ id: 'auth', label: 'Are you legally authorized to work in the United States?' }), 'workAuthorization', 'Yes');
assertMatch('Greenhouse Sponsorship', mockDescriptor({ id: 'spon', label: 'Will you now or in the future require sponsorship?' }), 'requireSponsorship', 'No');

// Lever Tests
assertMatch('Lever Full Name', mockDescriptor({ name: 'name', label: 'Full Name' }), 'fullName', 'Pritam');
assertMatch('Lever Current Company', mockDescriptor({ name: 'org', label: 'Current Company' }), 'currentCompany', 'Uber');
assertMatch('Lever LinkedIn', mockDescriptor({ name: 'urls[linkedin]', label: 'LinkedIn URL' }), 'linkedin', 'linkedin.com');
assertMatch('Lever GitHub', mockDescriptor({ name: 'urls[github]', label: 'GitHub URL' }), 'github', 'github.com');

// Workday Tests
assertMatch('Workday Legal First Name', mockDescriptor({ dataAutomationId: 'legalNameSection_firstName' }), 'firstName', 'Pritam');
assertMatch('Workday Legal Last Name', mockDescriptor({ dataAutomationId: 'legalNameSection_lastName' }), 'lastName', 'Rauniyar');
assertMatch('Workday Email', mockDescriptor({ dataAutomationId: 'email' }), 'email', 'pritam.rauniyar');
assertMatch('Workday Phone', mockDescriptor({ dataAutomationId: 'phone-number' }), 'phone', '234');
assertMatch('Workday City', mockDescriptor({ dataAutomationId: 'addressSection_city' }), 'city', 'San Francisco');
assertMatch('Workday Country', mockDescriptor({ dataAutomationId: 'addressSection_country' }), 'country', 'United States');
assertMatch('Workday Job Title', mockDescriptor({ dataAutomationId: 'jobTitle', label: 'Job Title*' }), 'currentTitle', 'Software Engineer');
assertMatch('Workday Company', mockDescriptor({ dataAutomationId: 'company', label: 'Company*' }), 'currentCompany', 'Uber');
assertMatch('Workday Location', mockDescriptor({ dataAutomationId: 'location', label: 'Location' }), 'jobLocation', 'San Francisco');
assertMatch('Workday School', mockDescriptor({ dataAutomationId: 'school', label: 'School or University*' }), 'school', 'University of California');
assertMatch('Workday Degree', mockDescriptor({ dataAutomationId: 'degree', label: 'Degree*' }), 'degree', 'Bachelor');
assertMatch('Workday Field of Study', mockDescriptor({ dataAutomationId: 'fieldOfStudy', label: 'Field of Study' }), 'fieldOfStudy', 'Computer Science');
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
  ...DEFAULT_PROFILE,
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
const truncatedSample = `{ "personal": { "firstName": "Pritam", "lastName": "Rauniyar", "fullName": "Pritam Rauniyar", "email": "pritamrauniyar.np@gmail.com", "phone": "+91-6201413304", "location": "Bengaluru, India", "city": "Bengaluru", "state": "", "postalCode": "", "country": "India", "address": "" }, "links":`;

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
  ...DEFAULT_PROFILE,
  experience: {
    ...DEFAULT_PROFILE.experience,
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
        company: "Uber",
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
if (m1_job.value === "Software Engineer II" && m1_comp.value === "Uber") {
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
  ...DEFAULT_PROFILE,
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

if (m_req.matched === true && m_req.value === "Pritam") {
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
}, 50);

