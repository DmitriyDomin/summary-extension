const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const ApiService = require('../api-service.js');

const realFetch = global.fetch;
beforeEach(() => {
  delete global.chrome;
});
afterEach(() => {
  global.fetch = realFetch;
  delete global.chrome;
});

const respond = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, statusText: 'x', json: async () => body });

test('OpenAI success returns the trimmed text', async () => {
  global.fetch = respond(200, { choices: [{ message: { content: '  hello  ' } }] });
  assert.strictEqual(await new ApiService().getOpenAIResponse('k', 'm', 'p'), 'hello');
});

test('OpenAI errors are turned into actionable messages', async () => {
  const api = new ApiService();
  global.fetch = respond(401, { error: { message: 'Incorrect API key', code: 'invalid_api_key' } });
  await assert.rejects(api.getOpenAIResponse('k', 'm', 'p'), /OpenAI rejected your API key/);
  global.fetch = respond(429, { error: { message: 'You exceeded your current quota', code: 'insufficient_quota' } });
  await assert.rejects(api.getOpenAIResponse('k', 'm', 'p'), /quota is used up/);
  global.fetch = respond(500, {});
  await assert.rejects(api.getOpenAIResponse('k', 'm', 'p'), /having problems.*500/);
});

test('OpenAI requires a key before any request is made', async () => {
  global.fetch = () => {
    throw new Error('should not be called');
  };
  await assert.rejects(new ApiService().getOpenAIResponse('', 'm', 'p'), /API key is required/);
});

const withBackground = (response) => {
  global.chrome = { runtime: { lastError: null, sendMessage: (_msg, cb) => cb(response) } };
};

test('Gemini failures from the background worker keep their meaning exactly once', async () => {
  const api = new ApiService();
  withBackground({ ok: false, status: 400, error: 'API key not valid. Please pass a valid API key.' });
  await assert.rejects(api.getGeminiResponse('k', 'm', '', 'p'), (error) => {
    assert.strictEqual(error.message, 'Google AI rejected your API key. Add or fix your Google AI API key in Settings.');
    return true;
  });
  withBackground({ ok: false, status: 429, error: 'Resource has been exhausted' });
  await assert.rejects(api.getGeminiResponse('k', 'm', '', 'p'), /quota is used up/);
});

test('Gemini safety filtering is not rewritten as a request failure', async () => {
  withBackground({ ok: true, data: { candidates: [] } });
  await assert.rejects(new ApiService().getGeminiResponse('k', 'm', '', 'p'), /filtered for safety reasons/);
});

test('Gemini joins the text parts of the first candidate', async () => {
  withBackground({ ok: true, data: { candidates: [{ content: { parts: [{ text: 'a ' }, { text: 'b' }] } }] } });
  assert.strictEqual(await new ApiService().getGeminiResponse('k', 'm', 'sys', 'p'), 'a b');
});
