// API Service - Centralized service for AI API requests
const userError = (message) => Object.assign(new Error(message), { userFacing: true });
const describeApiError = (details) =>
  (typeof ApiErrors !== 'undefined' ? ApiErrors : require('./api-errors.js')).describeApiError(details);

class ApiService {
  constructor() {
    this.openaiBaseUrl = 'https://api.openai.com/v1/chat/completions';
    this.geminiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  /**
   * Get OpenAI response using GPT models
   * @param {string} apiKey - OpenAI API key
   * @param {string} model - Model name (e.g., 'gpt-4o-mini')
   * @param {string} prompt - The prompt to send
   * @param {number} maxTokens - Maximum tokens for response
   * @param {number} temperature - Temperature for randomness (0-1)
   * @returns {Promise<string>} - The AI response
   */
  async getOpenAIResponse(apiKey, model = 'gpt-4o-mini', prompt, maxTokens = 2000, temperature = 0.3) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    const response = await fetch(this.openaiBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: temperature
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(describeApiError({ provider: 'openai', status: response.status, error: errorData }));
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  /**
   * Get Gemini response using Google AI REST API
   * @param {string} apiKey - Google AI API key
   * @param {string} model - Model name (e.g., 'gemini-3.5-flash')
   * @param {string} systemMessage - System message for context
   * @param {string} prompt - The prompt to send
   * @param {number} temperature - Temperature for randomness (0-1)
   * @param {boolean} isJson - Whether to expect JSON response
   * @param {boolean} thinking - Whether to enable thinking mode (not used with direct API)
   * @returns {Promise<string>} - The AI response
   */
  async getGeminiResponse(
    apiKey,
    model = 'gemini-3.5-flash',
    systemMessage = '',
    prompt,
    temperature = 0.7,
    isJson = false,
    thinking = false
  ) {
    if (!apiKey) {
      throw new Error('Google API key not configured. Add it in the extension settings.');
    }

    const endpoint = `${this.geminiBaseUrl}/models/${model}:generateContent?key=${apiKey}`;

    // Prepare request body
    // Merge system message into user prompt to avoid consecutive same-role entries
    const fullPrompt = systemMessage ? `${systemMessage}\n\n${prompt}` : prompt;

    const requestBody = {
      contents: [
        { role: 'user', parts: [{ text: fullPrompt }] }
      ],
      generationConfig: {
        temperature: temperature,
        topP: 0.95,
        maxOutputTokens: 65535,
        thinkingConfig: { thinkingLevel: 'MEDIUM' }
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT",        threshold: "OFF" },
        { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "OFF" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" }
      ]
    };

    try {
      // Route through background service worker so the request has no Referer/Origin
      // header, bypassing any HTTP referrer restrictions on the API key.
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: 'geminiRequest', endpoint, body: requestBody },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(userError(chrome.runtime.lastError.message));
            } else if (!response || !response.ok) {
              reject(userError(describeApiError({
                provider: 'google',
                status: response?.status,
                message: response?.error || 'Unknown error'
              })));
            } else {
              resolve(response.data);
            }
          }
        );
      });

      const data = result;

      // Check if we have a valid response
      if (!data.candidates || data.candidates.length === 0) {
        throw userError('No response generated. The content may have been filtered for safety reasons.');
      }
      
      // Extract text from response
      let responseText = '';
      const candidate = data.candidates[0];
      
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            responseText += part.text;
          }
        }
      }
      
      return responseText.trim();
    } catch (error) {
      // Already a readable message from describeApiError or from the safety-filter check above.
      if (error.userFacing) throw error;
      throw new Error(describeApiError({ provider: 'google', message: error.message }));
    }
  }

  /**
   * Get API key from Chrome storage
   * @param {string} provider - 'openai' or 'google'
   * @returns {Promise<string|null>} - The API key or null if not found
   */
  async getApiKey(provider = 'openai') {
    const storageKey = provider === 'openai' ? 'apiKey' : 'googleApiKey';
    const result = await chrome.storage.local.get([storageKey]);
    return result[storageKey] || null;
  }

  /**
   * Set API key in Chrome storage
   * @param {string} provider - 'openai' or 'google'
   * @param {string} apiKey - The API key to store
   * @returns {Promise<void>}
   */
  async setApiKey(provider, apiKey) {
    const storageKey = provider === 'openai' ? 'apiKey' : 'googleApiKey';
    await chrome.storage.local.set({ [storageKey]: apiKey });
  }

  /**
   * Test API connection
   * @param {string} provider - 'openai' or 'google'
   * @param {string} apiKey - The API key to test
   * @param {string} model - The model to test with
   * @returns {Promise<boolean>} - True if connection successful
   */
  async testApiConnection(provider, apiKey, model) {
    try {
      const testPrompt = 'Hello, please respond with "API connection successful"';
      
      if (provider === 'openai') {
        const response = await this.getOpenAIResponse(apiKey, model, testPrompt, 50, 0.1);
        return response.toLowerCase().includes('successful') || response.toLowerCase().includes('hello');
      } else if (provider === 'google') {
        const response = await this.getGeminiResponse(apiKey, model, '', testPrompt, 0.1, false, false);
        return response.toLowerCase().includes('successful') || response.toLowerCase().includes('hello');
      }
      
      return false;
    } catch (error) {
      console.error(`API test failed for ${provider}:`, error);
      return false;
    }
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use getOpenAIResponse instead
   */
  async makeApiRequest(prompt, apiKey = null) {
    const key = apiKey || await this.getApiKey('openai');
    return this.getOpenAIResponse(key, 'gpt-4o-mini', prompt);
  }
}

// Create global instance
const apiService = new ApiService();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ApiService;
}