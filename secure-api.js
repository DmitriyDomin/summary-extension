// Secure API key management and validation - Updated to use centralized API service

// Enhanced summary generation with security
async function generateSecureSummary(prompt, summaryLength = 'medium', language = 'en') {
  try {
    const lengthMap = { short: 150, medium: 300, long: 500 };
    const maxTokens = lengthMap[summaryLength] || 300;
    
    // Sanitize input
    const sanitizedPrompt = prompt.replace(/[\x00-\x1F\x7F]/g, '').substring(0, 8000);
    
    if (!sanitizedPrompt.trim()) {
      throw new Error('Empty or invalid content to summarize');
    }
    
    // Enhanced prompt with length specification
    const enhancedPrompt = `${sanitizedPrompt}\n\nPlease provide a ${summaryLength} summary (approximately ${Math.floor(maxTokens * 0.75)} words) of the above content. Include a clear title in parentheses () and indicate the original language in square brackets [].`;
    
    // Use the centralized API service
    const apiKey = await apiService.getApiKey('openai');
    if (!apiKey) {
      throw new Error('API key not configured. Please set your OpenAI API key in the extension settings.');
    }
    
    const summary = await apiService.getOpenAIResponse(apiKey, 'gpt-4o-mini', enhancedPrompt, maxTokens, 0.3);
    return summary;
    
  } catch (error) {
    console.error('Error generating summary:', error);
    throw error;
  }
}

// Translation with security
async function translateSecurely(text, targetLanguage) {
  if (!text || !targetLanguage || targetLanguage === 'none') {
    return text;
  }
  
  try {
    const translationPrompt = `Translate the following text to ${targetLanguage}, preserving any text in parentheses () and square brackets []:\n\n${text}`;
    
    // Use the centralized API service
    const apiKey = await apiService.getApiKey('openai');
    if (!apiKey) {
      throw new Error('API key not configured. Please set your OpenAI API key in the extension settings.');
    }
    
    const translation = await apiService.getOpenAIResponse(apiKey, 'gpt-4o-mini', translationPrompt, 600, 0.1);
    return translation;
    
  } catch (error) {
    console.error('Error translating:', error);
    // Return original text if translation fails
    return text;
  }
}

// Legacy functions for backward compatibility
async function getApiKey() {
  return await apiService.getApiKey('openai');
}

async function setApiKey(apiKey) {
  return await apiService.setApiKey('openai', apiKey);
}

// Validate API key format
function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }
  
  // OpenAI API keys start with 'sk-' and have specific length
  const openAIPattern = /^sk-[A-Za-z0-9]{48}$/;
  return openAIPattern.test(apiKey);
}