const test = require('node:test');
const assert = require('node:assert');

const { GeminiService } = require('../lib/gemini-service.js');
const { DEFAULT_PROFILE } = require('../lib/storage.js');

test('GeminiService: testApiKey validation and discovery', async () => {
  // 1. Missing or empty API key
  const emptyRes = await GeminiService.testApiKey('');
  assert.strictEqual(emptyRes.success, false);
  assert.ok(emptyRes.error.includes('enter an API key'));

  const origFetch = global.fetch;

  try {
    // 2. Success on v1beta with preferred gemini-3.6-flash
    global.fetch = async (url) => {
      if (url.includes('v1beta/models')) {
        return {
          ok: true,
          json: async () => ({
            models: [
              { name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] }
            ]
          })
        };
      }
      return { ok: false, json: async () => ({ error: { message: 'Not found' } }) };
    };

    const successRes = await GeminiService.testApiKey('valid-key');
    assert.strictEqual(successRes.success, true);
    assert.strictEqual(successRes.apiVersion, 'v1beta');
    assert.strictEqual(successRes.selectedModel, 'gemini-3.6-flash');
    assert.ok(successRes.message.includes('Connected successfully'));

    // 3. Fallback to v1 when v1beta returns error
    global.fetch = async (url) => {
      if (url.includes('v1beta')) {
        return { ok: false, json: async () => ({ error: { message: 'v1beta unsupported' } }) };
      }
      return {
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }
          ]
        })
      };
    };

    const v1Res = await GeminiService.testApiKey('valid-key');
    assert.strictEqual(v1Res.success, true);
    assert.strictEqual(v1Res.apiVersion, 'v1');
    assert.strictEqual(v1Res.selectedModel, 'gemini-3.5-flash');

    // 4. Both fail
    global.fetch = async () => ({
      ok: false,
      json: async () => ({ error: { message: 'Invalid API Key' } })
    });

    const failRes = await GeminiService.testApiKey('bad-key');
    assert.strictEqual(failRes.success, false);
    assert.ok(failRes.error.includes('Invalid API Key'));

    // 5. Network exception
    global.fetch = async () => { throw new Error('Network connection failed'); };
    const excRes = await GeminiService.testApiKey('key');
    assert.strictEqual(excRes.success, false);
    assert.ok(excRes.error.includes('Network connection failed'));

  } finally {
    global.fetch = origFetch;
  }
});

test('GeminiService: getSupportedModel priorities and caching', async () => {
  const origFetch = global.fetch;
  GeminiService.cachedWorkingModel = null;

  try {
    // 1. Priority 1: gemini-3.6-flash
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        models: [
          { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] }
        ]
      })
    });
    const m1 = await GeminiService.getSupportedModel('key');
    assert.strictEqual(m1.model, 'gemini-3.6-flash');
    assert.strictEqual(m1.apiVersion, 'v1beta');

    // Cached model reuse
    const cached = await GeminiService.getSupportedModel('key');
    assert.strictEqual(cached.model, 'gemini-3.6-flash');

    // Invalidate cache for next test
    GeminiService.cachedWorkingModel = null;

    // 2. Priority 2: Candidate models (e.g. gemini-3.7-flash)
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        models: [
          { name: 'models/gemini-3.7-flash', supportedGenerationMethods: ['generateContent'] }
        ]
      })
    });
    const m2 = await GeminiService.getSupportedModel('key');
    assert.strictEqual(m2.model, 'gemini-3.7-flash');

    // Invalidate cache
    GeminiService.cachedWorkingModel = null;

    // 3. Priority 3: any modern flash model
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        models: [
          { name: 'models/gemini-custom-flash', supportedGenerationMethods: ['generateContent'] }
        ]
      })
    });
    const m3 = await GeminiService.getSupportedModel('key');
    assert.strictEqual(m3.model, 'gemini-custom-flash');

    // Invalidate cache
    GeminiService.cachedWorkingModel = null;

    // 4. Exception fallback
    global.fetch = async () => { throw new Error('API down'); };
    const mFallback = await GeminiService.getSupportedModel('key');
    assert.strictEqual(mFallback.model, 'gemini-3.6-flash');

  } finally {
    global.fetch = origFetch;
  }
});

test('GeminiService: requestWithFallback error handling and fast-fails', async () => {
  const origFetch = global.fetch;

  // 1. Missing API Key
  await assert.rejects(
    async () => GeminiService.requestWithFallback({}, ''),
    /Missing Gemini API Key/
  );

  try {
    // 2. Auth error 400 fast fail
    global.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'API_KEY_INVALID' } })
    });
    await assert.rejects(
      async () => GeminiService.requestWithFallback({}, 'bad-key'),
      /Invalid Gemini API Key/
    );

    // 3. Permission error 403
    global.fetch = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'Generative Language API has not been used' } })
    });
    await assert.rejects(
      async () => GeminiService.requestWithFallback({}, 'key'),
      /Google API Permission Error/
    );

    // 4. Rate limit 429
    global.fetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'RESOURCE_EXHAUSTED' } })
    });
    await assert.rejects(
      async () => GeminiService.requestWithFallback({}, 'key'),
      /rate limit hit/
    );

    // 5. Binary PDF error
    global.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'application/pdf is not supported for generateContent with inlineData' } })
    });
    await assert.rejects(
      async () => GeminiService.requestWithFallback({}, 'key'),
      /does not support binary PDF/
    );

    // 6. 404 model not found fallback to next model
    let attemptCount = 0;
    global.fetch = async (url) => {
      attemptCount++;
      if (url.includes('gemini-3.6-flash')) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { message: 'models/gemini-3.6-flash is not found' } })
        };
      }
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Response from fallback' }] } }]
        })
      };
    };

    const res404 = await GeminiService.generate('test prompt', 'key', '', 'gemini-3.6-flash');
    assert.strictEqual(res404, 'Response from fallback');
    assert.ok(attemptCount > 1, 'Should have fallen back after 404');

  } finally {
    global.fetch = origFetch;
  }
});

test('GeminiService: parseAndRepairJson resilient JSON engine', () => {
  // 1. Direct valid JSON with markdown fence
  const rawWithFences = '```json\n{"personal": {"firstName": "Pritam"}}\n```';
  const parsed1 = GeminiService.parseAndRepairJson(rawWithFences);
  assert.strictEqual(parsed1.personal.firstName, 'Pritam');

  // 2. Truncated JSON repair (missing closing braces/quotes and unclosed brackets)
  const truncated = '{"personal": {"firstName": "Pritam"}, "skills": ["Go", "Kafka"';
  const repaired = GeminiService.parseAndRepairJson(truncated);
  assert.strictEqual(repaired.personal.firstName, 'Pritam');
  assert.strictEqual(repaired.skills[0], 'Go');
  assert.strictEqual(repaired.skills.length, 1);

  // 3. Fallback regex extraction when structure is corrupted
  const corrupted = 'Random text before {"personal": {"firstName": "Pritam", "email": "p@test.com"}} random text after';
  const fallbackRes = GeminiService.parseAndRepairJson(corrupted);
  assert.strictEqual(fallbackRes.personal.firstName, 'Pritam');
  assert.strictEqual(fallbackRes.personal.email, 'p@test.com');

  // 4. Completely invalid text throws error
  assert.throws(
    () => GeminiService.parseAndRepairJson('Non-JSON gibberish without personal block'),
    /Could not parse resume data into JSON/
  );
});

test('GeminiService: parseResumeText & normalization', async () => {
  const origFetch = global.fetch;

  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                personal: { fullName: "Pritam Rauniyar", email: "pritam@example.com" },
                links: { github: "https://github.com/pritamrauniyar" },
                experience: {
                  items: [
                    {
                      company: "Uber",
                      title: "Software Engineer II",
                      startDate: "2022-08",
                      endDate: "Present",
                      description: "Distributed Systems"
                    }
                  ]
                },
                education: {
                  items: [
                    {
                      school: "MNNIT",
                      degree: "B.Tech",
                      fieldOfStudy: "ECE",
                      graduationYear: "2020",
                      gpa: "3.8"
                    }
                  ]
                }
              })
            }]
          }
        }]
      })
    });

    const parsed = await GeminiService.parseResumeText('Resume text for Pritam Rauniyar', 'key');
    assert.strictEqual(parsed.personal.fullName, 'Pritam Rauniyar');
    assert.strictEqual(parsed.experience.currentCompany, 'Uber');
    assert.strictEqual(parsed.experience.currentTitle, 'Software Engineer II');
    assert.strictEqual(parsed.experience.items[0].isCurrent, true);
    assert.strictEqual(parsed.education.school, 'MNNIT');
    assert.strictEqual(parsed.education.degree, 'B.Tech');

  } finally {
    global.fetch = origFetch;
  }
});

test('GeminiService: parseResumeFile with Image and PDF fallbacks', async () => {
  const origFetch = global.fetch;

  try {
    // 1. Image parsing via multimodal inlineData
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                personal: { fullName: "Pritam Rauniyar" }
              })
            }]
          }
        }]
      })
    });

    const imgParsed = await GeminiService.parseResumeFile('base64image...', 'image/png', 'key');
    assert.strictEqual(imgParsed.personal.fullName, 'Pritam Rauniyar');

    // 2. PDF extraction via mock PdfExtractor
    global.self = {
      PdfExtractor: {
        extractText: async () => 'Extracted candidate text from PDF resume with plenty of content'
      }
    };
    const b64 = Buffer.from('fake pdf content').toString('base64');
    const pdfParsed = await GeminiService.parseResumeFile(b64, 'application/pdf', 'key');
    assert.strictEqual(pdfParsed.personal.fullName, 'Pritam Rauniyar');

    // 3. Scanned PDF with no text throws
    global.self = {
      PdfExtractor: {
        extractText: async () => ''
      }
    };
    await assert.rejects(
      async () => GeminiService.parseResumeFile('emptybase64', 'application/pdf', 'key'),
      /No readable text found in this PDF/
    );

  } finally {
    global.fetch = origFetch;
  }
});

test('GeminiService: answerOpenEndedQuestion, suggestFieldAnswer, and refineKnowledgeBase', async () => {
  const origFetch = global.fetch;

  try {
    // Mock response for generate
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: "I engineered high-throughput Kafka streaming pipelines and microservices at Uber scale."
            }]
          }
        }]
      })
    });

    // 1. answerOpenEndedQuestion
    const answer = await GeminiService.answerOpenEndedQuestion({
      question: "Describe your greatest engineering accomplishment",
      jobTitle: "Senior Distributed Systems Engineer",
      companyName: "Google",
      userProfile: DEFAULT_PROFILE,
      apiKey: "test-key"
    });
    assert.ok(answer.includes("Uber scale"));

    // 2. suggestFieldAnswer
    const suggestion = await GeminiService.suggestFieldAnswer({
      fieldLabel: "Preferred Cloud Platform",
      fieldType: "select",
      options: ["AWS", "GCP", "Azure"],
      userProfile: DEFAULT_PROFILE,
      apiKey: "test-key"
    });
    assert.ok(suggestion);

    // 3. refineKnowledgeBase
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                updatedFields: [
                  {
                    id: "df-1",
                    canonicalKey: "education.highest",
                    label: "Higher Education",
                    value: "Motilal Nehru National Institute Of Technology"
                  }
                ],
                recommendedIgnored: ["gender"]
              })
            }]
          }
        }]
      })
    });

    const refinement = await GeminiService.refineKnowledgeBase({
      pendingItems: [{ type: 'user_correction', field: 'Higher Education', value: 'MNNIT' }],
      profile: DEFAULT_PROFILE,
      apiKey: 'test-key'
    });
    assert.ok(refinement);
    assert.strictEqual(refinement.updatedFields.length, 1);
    assert.strictEqual(refinement.updatedFields[0].label, 'Higher Education');

    // Empty pending items returns null
    const emptyRefinement = await GeminiService.refineKnowledgeBase({
      pendingItems: [],
      profile: DEFAULT_PROFILE,
      apiKey: 'test-key'
    });
    assert.strictEqual(emptyRefinement, null);

  } finally {
    global.fetch = origFetch;
  }
});
