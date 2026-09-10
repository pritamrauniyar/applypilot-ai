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

console.log(`\n========================================`);
console.log(`Summary: ${passed}/${total} Tests Passed (${Math.round(passed/total * 100)}%)`);
console.log(`========================================\n`);

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}

