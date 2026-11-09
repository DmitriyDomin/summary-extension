// Turns provider failures into messages a user can act on. Pure, no chrome.* access.
(function (root) {
  const PROVIDERS = {
    openai: { name: 'OpenAI', keyHint: 'Add or fix your OpenAI API key in Settings.', billing: 'Check your plan and billing at platform.openai.com/settings/organization/billing.' },
    google: { name: 'Google AI', keyHint: 'Add or fix your Google AI API key in Settings.', billing: 'Check your quota at aistudio.google.com.' },
  };

  function pick(error) {
    if (!error) return {};
    // OpenAI nests details under error.error, Google does as well, plain objects are accepted too.
    const inner = error.error && typeof error.error === 'object' ? error.error : error;
    return { message: String(inner.message || error.message || ''), code: String(inner.code || inner.type || inner.status || '') };
  }

  // kind: 'auth' | 'quota' | 'rate_limit' | 'model' | 'bad_request' | 'server' | 'network' | 'unknown'
  function classifyApiError({ status, message = '', code = '' } = {}) {
    const text = `${message} ${code}`.toLowerCase();
    if (/insufficient_quota|exceeded your current quota|billing|resource_exhausted|resource has been exhausted|quota/.test(text) && status !== 401) return 'quota';
    if (status === 401 || status === 403 || /api key not valid|invalid api key|incorrect api key|api_key_invalid|permission_denied|unauthenticated/.test(text)) return 'auth';
    if (status === 400 && /api key/.test(text)) return 'auth';
    if (status === 429) return 'rate_limit';
    if (status === 404 || /model.*(not found|does not exist)|not_found/.test(text)) return 'model';
    if (status === 400 || status === 413 || /context length|too long|maximum context/.test(text)) return 'bad_request';
    if (status >= 500 && status < 600) return 'server';
    if (/failed to fetch|networkerror|network request failed|load failed/.test(text)) return 'network';
    return 'unknown';
  }

  function describeApiError({ provider = 'openai', status, message, code, error } = {}) {
    const info = PROVIDERS[provider] || PROVIDERS.openai;
    const detail = error ? pick(error) : { message, code };
    const kind = classifyApiError({ status, message: detail.message, code: detail.code });

    switch (kind) {
      case 'auth':
        return `${info.name} rejected your API key. ${info.keyHint}`;
      case 'quota':
        return `Your ${info.name} quota is used up. ${info.billing}`;
      case 'rate_limit':
        return `${info.name} is rate limiting requests. Wait a minute and try again.`;
      case 'model':
        return `${info.name} does not know the selected model. Choose another model in Settings.`;
      case 'bad_request':
        return /context|too long|maximum/i.test(detail.message || '')
          ? 'This content is too long for the model. Try a shorter video or lecture.'
          : `${info.name} could not process the request${detail.message ? `: ${detail.message}` : '.'}`;
      case 'server':
        return `${info.name} is having problems right now (HTTP ${status}). Try again in a few minutes.`;
      case 'network':
        return `Could not reach ${info.name}. Check your internet connection.`;
      default:
        return `${info.name} request failed${detail.message ? `: ${detail.message}` : '.'}`;
    }
  }

  const api = { classifyApiError, describeApiError };
  root.ApiErrors = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
