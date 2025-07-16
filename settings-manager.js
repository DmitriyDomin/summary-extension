// Settings Manager - handles extension settings functionality
class SettingsManager {
  constructor() {
    this.apiKeyInput = null;
    this.apiKeyStatus = null;
    this.toggleButton = null;
    this.saveButton = null;
    this.clearButton = null;
    this.testButton = null;
  }

  initialize() {
    this.apiKeyInput = document.getElementById('apiKeyInput');
    this.apiKeyStatus = document.getElementById('apiKeyStatus');
    this.toggleButton = document.getElementById('toggleApiKey');
    this.saveButton = document.getElementById('saveApiKey');
    this.clearButton = document.getElementById('clearAllData');
    this.testButton = document.getElementById('testApiKey');

    this.setupEventListeners();
    this.loadSettings();
  }

  setupEventListeners() {
    if (this.toggleButton) {
      this.toggleButton.addEventListener('click', () => this.toggleApiKeyVisibility());
    }

    if (this.saveButton) {
      this.saveButton.addEventListener('click', () => this.saveApiKey());
    }

    if (this.clearButton) {
      this.clearButton.addEventListener('click', () => this.clearAllData());
    }

    if (this.testButton) {
      this.testButton.addEventListener('click', () => this.testApiConnection());
    }

    // Handle checkbox settings
    const autoSummarizeCheckbox = document.getElementById('autoSummarizeYoutube');
    const showInlineButtonsCheckbox = document.getElementById('showInlineButtons');

    if (autoSummarizeCheckbox) {
      autoSummarizeCheckbox.addEventListener('change', (event) => {
        chrome.storage.local.set({ autoSummarizeYoutube: event.target.checked });
      });
    }

    if (showInlineButtonsCheckbox) {
      showInlineButtonsCheckbox.addEventListener('change', (event) => {
        chrome.storage.local.set({ showInlineButtons: event.target.checked });
      });
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get([
        'apiKey', 
        'autoSummarizeYoutube', 
        'showInlineButtons'
      ]);

      if (result.apiKey && this.apiKeyInput) {
        this.apiKeyInput.value = result.apiKey;
        this.updateStatus('✓ API Key configured', 'success');
      } else {
        this.updateStatus('⚠ Please configure your API key', 'error');
      }

      // Load checkbox settings
      const autoSummarizeCheckbox = document.getElementById('autoSummarizeYoutube');
      const showInlineButtonsCheckbox = document.getElementById('showInlineButtons');

      if (autoSummarizeCheckbox) {
        autoSummarizeCheckbox.checked = result.autoSummarizeYoutube || false;
      }

      if (showInlineButtonsCheckbox) {
        showInlineButtonsCheckbox.checked = result.showInlineButtons !== false; // Default to true
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      this.updateStatus('⚠ Error loading settings', 'error');
    }
  }

  toggleApiKeyVisibility() {
    if (!this.apiKeyInput || !this.toggleButton) return;

    const icon = this.toggleButton.querySelector('i');
    if (!icon) return;

    if (this.apiKeyInput.type === 'password') {
      this.apiKeyInput.type = 'text';
      icon.className = 'fas fa-eye-slash';
    } else {
      this.apiKeyInput.type = 'password';
      icon.className = 'fas fa-eye';
    }
  }

  async saveApiKey() {
    if (!this.apiKeyInput || !this.apiKeyStatus) return;

    const apiKey = this.apiKeyInput.value.trim();

    if (!apiKey) {
      this.updateStatus('⚠ Please enter an API key', 'error');
      return;
    }

    if (!apiKey.startsWith('sk-') || apiKey.length < 40) {
      this.updateStatus('⚠ Invalid API key format', 'error');
      return;
    }

    try {
      await chrome.storage.local.set({ apiKey });
      this.updateStatus('✓ API Key saved successfully', 'success');
    } catch (error) {
      console.error('Error saving API key:', error);
      this.updateStatus('⚠ Failed to save API key', 'error');
    }
  }

  async testApiConnection() {
    if (!this.apiKeyInput || !this.testButton) return;

    const apiKey = this.apiKeyInput.value.trim();
    if (!apiKey) {
      this.updateStatus('⚠ Please enter an API key first', 'error');
      return;
    }

    // Disable button and show loading
    this.testButton.disabled = true;
    const originalText = this.testButton.textContent;
    this.testButton.textContent = 'Testing...';
    this.updateStatus('🔄 Testing connection...', 'info');

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        this.updateStatus('✓ Connection successful', 'success');
      } else if (response.status === 401) {
        this.updateStatus('⚠ Invalid API key', 'error');
      } else if (response.status === 429) {
        this.updateStatus('⚠ Rate limit exceeded', 'error');
      } else {
        this.updateStatus('⚠ Connection failed', 'error');
      }
    } catch (error) {
      console.error('Error testing API connection:', error);
      this.updateStatus('⚠ Network error', 'error');
    } finally {
      // Re-enable button
      this.testButton.disabled = false;
      this.testButton.textContent = originalText;
    }
  }

  async clearAllData() {
    const confirmed = confirm('Are you sure you want to clear all extension data? This cannot be undone.');
    if (!confirmed) return;

    try {
      await chrome.storage.local.clear();
      this.updateStatus('✓ All data cleared', 'success');
      
      // Reset form
      if (this.apiKeyInput) {
        this.apiKeyInput.value = '';
      }

      // Reset checkboxes
      const autoSummarizeCheckbox = document.getElementById('autoSummarizeYoutube');
      const showInlineButtonsCheckbox = document.getElementById('showInlineButtons');

      if (autoSummarizeCheckbox) autoSummarizeCheckbox.checked = false;
      if (showInlineButtonsCheckbox) showInlineButtonsCheckbox.checked = true;

      // Show alert and close popup
      setTimeout(() => {
        alert('All data has been cleared. Please refresh the extension.');
        window.close();
      }, 1000);
    } catch (error) {
      console.error('Error clearing data:', error);
      this.updateStatus('⚠ Failed to clear data', 'error');
    }
  }

  updateStatus(message, type) {
    if (!this.apiKeyStatus) return;

    this.apiKeyStatus.textContent = message;
    this.apiKeyStatus.className = `api-status ${type}`;
  }

  // Get current settings for other components
  async getSettings() {
    try {
      return await chrome.storage.local.get([
        'apiKey',
        'autoSummarizeYoutube',
        'showInlineButtons',
        'targetLanguage',
        'summaryLength'
      ]);
    } catch (error) {
      console.error('Error getting settings:', error);
      return {};
    }
  }

  // Validate if API key is configured
  async isApiKeyConfigured() {
    try {
      const result = await chrome.storage.local.get(['apiKey']);
      return result.apiKey && result.apiKey.startsWith('sk-') && result.apiKey.length >= 40;
    } catch (error) {
      console.error('Error checking API key:', error);
      return false;
    }
  }
}

// Export for use in popup
window.SettingsManager = SettingsManager;