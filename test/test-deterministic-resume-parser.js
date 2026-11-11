// Unit tests for DeterministicResumeParser
// Validates offline, zero-AI resume text parsing into structured profile entities.

const test = require('node:test');
const assert = require('node:assert');
const { DeterministicResumeParser } = require('../lib/deterministic-resume-parser.js');

test('DeterministicResumeParser: Parses complete standard professional resume', () => {
  const resumeText = `
Pritam Rauniyar
San Francisco, CA 94103
pritam.rauniyar@example.com | (415) 555-0199
https://linkedin.com/in/pritamrauniyar | https://github.com/pritamrauniyar | https://pritamrauniyar.dev

PROFESSIONAL SUMMARY
Senior Distributed Systems Architect with 8+ years of engineering experience architecting fault-tolerant infrastructure and web applications.

WORK EXPERIENCE
Principal Engineer | Stripe | Jan 2022 - Present
San Francisco, CA
• Architected core payments orchestration processing $10B+ in annual volume.
• Led cross-functional team of 14 engineers building low-latency APIs.
• Reduced p99 response times by 35% through reactive caching.

Senior Software Engineer | Uber | Mar 2018 - Dec 2021
San Francisco, CA
• Designed real-time dispatch matching engine handling 100k queries/sec.
• Implemented Kafka-based event streaming pipeline with 99.999% availability.

EDUCATION
University of California, Berkeley
Bachelor of Science in Computer Science
2014 - 2018 | GPA: 3.85

SKILLS & TECHNOLOGIES
Languages: JavaScript, TypeScript, Python, Go, Rust, Java
Frameworks: Node.js, React, Express, FastAPI, Docker, Kubernetes, AWS, GCP, Redis, PostgreSQL
`;

  const parsed = DeterministicResumeParser.parse(resumeText);

  // 1. Personal & Contact Info
  assert.strictEqual(parsed.personal.fullName, 'Pritam Rauniyar');
  assert.strictEqual(parsed.personal.firstName, 'Pritam');
  assert.strictEqual(parsed.personal.lastName, 'Rauniyar');
  assert.strictEqual(parsed.personal.email, 'pritam.rauniyar@example.com');
  assert.strictEqual(parsed.personal.phone, '(415) 555-0199');
  assert.strictEqual(parsed.personal.city, 'San Francisco');
  assert.strictEqual(parsed.personal.state, 'CA');
  assert.strictEqual(parsed.personal.postalCode, '94103');
  assert.strictEqual(parsed.personal.country, 'United States');

  // 2. Links
  assert.ok(parsed.links.linkedin.includes('linkedin.com/in/pritamrauniyar'));
  assert.ok(parsed.links.github.includes('github.com/pritamrauniyar'));
  assert.ok(parsed.links.portfolio.includes('pritamrauniyar.dev'));

  // 3. Work Experience
  assert.strictEqual(parsed.experience.currentCompany, 'Stripe');
  assert.strictEqual(parsed.experience.currentTitle, 'Principal Engineer');
  assert.strictEqual(parsed.experience.items.length, 2);

  const exp1 = parsed.experience.items[0];
  assert.strictEqual(exp1.company, 'Stripe');
  assert.strictEqual(exp1.title, 'Principal Engineer');
  assert.strictEqual(exp1.isCurrent, true);
  assert.ok(exp1.startDate.includes('Jan 2022'));
  assert.ok(exp1.endDate.includes('Present'));
  assert.ok(exp1.description.includes('core payments orchestration'));

  const exp2 = parsed.experience.items[1];
  assert.strictEqual(exp2.company, 'Uber');
  assert.strictEqual(exp2.title, 'Senior Software Engineer');
  assert.strictEqual(exp2.isCurrent, false);
  assert.ok(exp2.startDate.includes('Mar 2018'));
  assert.ok(exp2.endDate.includes('Dec 2021'));
  assert.ok(exp2.description.includes('real-time dispatch'));

  // 4. Education
  assert.ok(parsed.education.school.includes('University of California, Berkeley'));
  assert.strictEqual(parsed.education.degree, 'Bachelor of Science (B.S.)');
  assert.strictEqual(parsed.education.fieldOfStudy, 'Computer Science');
  assert.strictEqual(parsed.education.graduationYear, '2018');
  assert.strictEqual(parsed.education.gpa, '3.85');

  // 5. Skills
  assert.ok(parsed.experience.skills.includes('JavaScript'));
  assert.ok(parsed.experience.skills.includes('TypeScript'));
  assert.ok(parsed.experience.skills.includes('Python'));
  assert.ok(parsed.experience.skills.includes('Kubernetes'));

  // 6. Summary custom field
  assert.strictEqual(parsed.suggestedCustomFields.length, 1);
  assert.strictEqual(parsed.suggestedCustomFields[0].label, 'Professional Summary');
  assert.ok(parsed.suggestedCustomFields[0].value.includes('Senior Distributed Systems Architect'));
});

test('DeterministicResumeParser: Handles edge cases (empty text, name fallback from email, minimal sections)', () => {
  // Empty input
  const emptyRes = DeterministicResumeParser.parse('');
  assert.deepStrictEqual(emptyRes.personal, {
    firstName: '', middleName: '', lastName: '', fullName: '',
    email: '', phone: '', location: '', city: '', state: '', postalCode: '', country: '', address: ''
  });
  assert.deepStrictEqual(emptyRes.experience.items, []);
  assert.deepStrictEqual(emptyRes.education.items, []);

  // Name derived from email prefix when resume has no clear heading name
  const minimalText = `
Contact me at alex.morgan@testdomain.org
Phone: 555-888-9999
Education: Harvard University, Master of Science in Data Science, 2020
Skills: Python, SQL
`;
  const parsedMin = DeterministicResumeParser.parse(minimalText);
  assert.strictEqual(parsedMin.personal.email, 'alex.morgan@testdomain.org');
  assert.strictEqual(parsedMin.personal.firstName, 'Alex');
  assert.strictEqual(parsedMin.personal.lastName, 'Morgan');
  assert.strictEqual(parsedMin.personal.fullName, 'Alex Morgan');
  assert.strictEqual(parsedMin.education.degree, 'Master of Science (M.S.)');
  assert.strictEqual(parsedMin.education.fieldOfStudy, 'Data Science');
  assert.strictEqual(parsedMin.education.graduationYear, '2020');
});

test('DeterministicResumeParser: Accurately parses international resume format (India, +91, B.Tech, K-12, Sept, PDF Links, LLMs guard)', () => {
  const realResumeText = `
Pritam Rauniyar
Bengaluru, India | pritamrauniyar.np@gmail.com | +91-6201413304
LinkedIn | Portfolio
Objective
Full-stack engineer with 4+ years building scalable, multi-tier, high-volume backend services (Java, Go) and web applications, seeking to grow technical ownership and leadership on distributed, user-centric systems.
Skills
• Languages: Java, TypeScript, JavaScript, Go, C++, C, SQL
• Backend & APIs: Java/Spring Boot, RESTful APIs, gRPC, Kafka, MySQL, DynamoDB
• Frontend Frameworks & Libraries: React.js, Angular.js, Node.js, Fusion.js, RxJS, Semantic HTML, CSS
• Generative AI: LLMs, AI Agents, MCP, Agentic Workflows, Tool Calling, Prompt Engineering
• Cloud & Engineering: AWS, Azure AD B2C, CI/CD, Git/GitLab, Jira, Postman, Grafana
• Core Competencies: Technical Leadership, Cross-Functional Collaboration, Mentorship, Problem Solving, Technical Ownership
Education
Motilal Nehru National Institute of Technology (NIT) Allahabad    Aug 2018 – May 2022
B.Tech, Electronics and Communication
Professional Experience
Software Engineer II, Uber – Bengaluru, India    Nov 2025 – Present
• Corporate Billing Integration: Designed and drove end-to-end delivery (backend services in Go, frontend in
FusionJs, HTML/CSS) of billing integration for 3,000 ad accounts linked with 30K+ restaurants.
• New-to-Brand Targeting: Led the design and delivery of NTB targeting generating $27M+ revenue.
Software Development Engineer, Elevate K-12 – Remote    June 2023 – Sept 2025
• Architecture & Performance: Led development of a multi-tier Angular microservice backed by Java/Spring services.
SDE, Ola Electric Technologies – Bengaluru, India    June 2022 – April 2023
• Customer Purchase Experience: Designed and built React-based UI flows for customer onboarding.
Links: https://linkedin.com/in/pritamrauniyar | https://pritamrauniyar.com.np
`;

  const parsed = DeterministicResumeParser.parse(realResumeText);

  // Personal & Contact (never truncated, never misclassifies "LLMs, AI" as US state)
  assert.strictEqual(parsed.personal.fullName, 'Pritam Rauniyar');
  assert.strictEqual(parsed.personal.firstName, 'Pritam');
  assert.strictEqual(parsed.personal.lastName, 'Rauniyar');
  assert.strictEqual(parsed.personal.email, 'pritamrauniyar.np@gmail.com');
  assert.strictEqual(parsed.personal.phone, '+91-6201413304');
  assert.strictEqual(parsed.personal.city, 'Bengaluru');
  assert.strictEqual(parsed.personal.state, '');
  assert.strictEqual(parsed.personal.country, 'India');
  assert.strictEqual(parsed.personal.location, 'Bengaluru, India');

  // Extracted hyperlinks from PDF Link annotations
  assert.strictEqual(parsed.links.linkedin, 'https://linkedin.com/in/pritamrauniyar');
  assert.strictEqual(parsed.links.portfolio, 'https://pritamrauniyar.com.np');

  // Education cleanly strips date range from school and extracts degree & major
  assert.strictEqual(parsed.education.school, 'Motilal Nehru National Institute of Technology (NIT) Allahabad');
  assert.strictEqual(parsed.education.degree, 'Bachelor of Technology / Engineering (B.Tech / B.E.)');
  assert.strictEqual(parsed.education.fieldOfStudy, 'Electronics and Communication');
  assert.strictEqual(parsed.education.graduationYear, '2022');

  // All 3 roles parsed sequentially without corrupting "Elevate K-12" or "Sept 2025"
  assert.strictEqual(parsed.experience.currentTitle, 'Software Engineer II');
  assert.strictEqual(parsed.experience.currentCompany, 'Uber');
  assert.strictEqual(parsed.experience.items.length, 3);

  assert.strictEqual(parsed.experience.items[0].company, 'Uber');
  assert.strictEqual(parsed.experience.items[0].location, 'Bengaluru, India');
  assert.strictEqual(parsed.experience.items[0].isCurrent, true);
  assert.ok(parsed.experience.items[0].description.includes('frontend in FusionJs, HTML/CSS'));

  assert.strictEqual(parsed.experience.items[1].company, 'Elevate K-12');
  assert.strictEqual(parsed.experience.items[1].title, 'Software Development Engineer');
  assert.strictEqual(parsed.experience.items[1].location, 'Remote');
  assert.strictEqual(parsed.experience.items[1].startDate, 'June 2023');
  assert.strictEqual(parsed.experience.items[1].endDate, 'Sept 2025');

  assert.strictEqual(parsed.experience.items[2].company, 'Ola Electric Technologies');
  assert.strictEqual(parsed.experience.items[2].title, 'SDE');
  assert.strictEqual(parsed.experience.items[2].location, 'Bengaluru, India');

  // Skills stripped of category labels while preserving compound skills
  assert.ok(parsed.experience.skills.includes('Java/Spring Boot'));
  assert.ok(parsed.experience.skills.includes('CI/CD'));
  assert.ok(parsed.experience.skills.includes('LangChain') === false);
  assert.ok(!parsed.experience.skills.includes('Generative AI:'));
});

test('DeterministicResumeParser: Handles ALL CAPS name and PDF kerning space around dot in email', () => {
  const spacedPdf = `
PRITAM RAUNIYAR
San Francisco, CA 94105 | pritamrauniyar . np@gmail.com | +1 (415) 555-0199
`;
  const parsed = DeterministicResumeParser.parse(spacedPdf);
  assert.strictEqual(parsed.personal.firstName, 'Pritam');
  assert.strictEqual(parsed.personal.lastName, 'Rauniyar');
  assert.strictEqual(parsed.personal.email, 'pritamrauniyar.np@gmail.com');
  assert.strictEqual(parsed.personal.phone, '+1 (415) 555-0199');
  assert.strictEqual(parsed.personal.city, 'San Francisco');
  assert.strictEqual(parsed.personal.state, 'CA');
});
