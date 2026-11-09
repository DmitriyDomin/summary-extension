const { test } = require('node:test');
const assert = require('node:assert');
const { classifyApiError, describeApiError } = require('../api-errors.js');

test('401 and invalid-key messages are reported as a key problem', () => {
  assert.strictEqual(classifyApiError({ status: 401 }), 'auth');
  assert.strictEqual(classifyApiError({ status: 400, message: 'API key not valid. Please pass a valid API key.' }), 'auth');
  assert.match(describeApiError({ provider: 'openai', status: 401 }), /OpenAI rejected your API key/);
  assert.match(describeApiError({ provider: 'google', status: 400, message: 'API key not valid' }), /Google AI rejected your API key.*Settings/);
});

test('an exhausted quota is told apart from plain rate limiting, even on a 429', () => {
  const body = { error: { message: 'You exceeded your current quota, please check your plan and billing details.', code: 'insufficient_quota' } };
  assert.strictEqual(classifyApiError({ status: 429, message: body.error.message, code: 'insufficient_quota' }), 'quota');
  assert.match(describeApiError({ provider: 'openai', status: 429, error: body }), /quota is used up.*billing/);
  assert.strictEqual(classifyApiError({ status: 429, message: 'Rate limit reached for requests' }), 'rate_limit');
  assert.match(describeApiError({ provider: 'openai', status: 429, message: 'Rate limit reached' }), /rate limiting/);
  assert.strictEqual(classifyApiError({ status: 429, message: 'RESOURCE_EXHAUSTED' }), 'quota');
});

test('unknown model, oversized input and server errors have their own messages', () => {
  assert.match(describeApiError({ provider: 'openai', status: 404, message: 'The model gpt-x does not exist' }), /does not know the selected model/);
  assert.match(describeApiError({ status: 400, message: "This model's maximum context length is 8192 tokens" }), /too long/);
  assert.match(describeApiError({ provider: 'google', status: 503 }), /Google AI is having problems.*503/);
});

test('network failures say to check the connection', () => {
  assert.strictEqual(classifyApiError({ message: 'Failed to fetch' }), 'network');
  assert.match(describeApiError({ provider: 'openai', message: 'Failed to fetch' }), /Could not reach OpenAI/);
});

test('anything else keeps the provider message so nothing is hidden', () => {
  assert.strictEqual(describeApiError({ provider: 'openai', status: 418, message: 'teapot' }), 'OpenAI request failed: teapot');
  assert.strictEqual(describeApiError({ provider: 'google' }), 'Google AI request failed.');
});

test('error bodies nested like the real APIs are understood', () => {
  const openai = { error: { message: 'Incorrect API key provided: sk-xxx', type: 'invalid_request_error', code: 'invalid_api_key' } };
  assert.match(describeApiError({ provider: 'openai', status: 401, error: openai }), /rejected your API key/);
  const google = { error: { code: 403, message: 'Permission denied', status: 'PERMISSION_DENIED' } };
  assert.match(describeApiError({ provider: 'google', status: 403, error: google }), /rejected your API key/);
});
