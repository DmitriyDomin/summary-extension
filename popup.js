// Complete popup.js - restored with all functionality
const USER_LANGUAGE = 'userLanguage';
const TARGET_LANGUAGE = 'targetLanguage';

// Global managers
let summariesManager = null;
let liveChatManager = null;
let settingsManager = null;

// Mock payment check that always returns true for now
async function checkPaymentStatus() {
  return true;
}

// Main popup initialization
async function initializePopup() {
  console.log('🚀 Popup initializing...');
  
  try {
    // Initialize managers first
    await initializeManagers();
    
    // Set up all event listeners
    setupHomePageEventListeners();
    setupSettingsEventListeners();
    setupRuntimeMessageListener();
    
    // Load settings and initial data
    await loadInitialSettings();
    await loadCurrentSummaryTopic();
    
    // CRITICAL: Check for video data waiting and auto-open live tab
    await handleAutoOpenLiveTab();
    
    console.log('✅ Popup initialized successfully');
    
    // Dispatch custom event to indicate popup is ready
    document.dispatchEvent(new CustomEvent('popupInitialized'));
    
  } catch (error) {
    console.error('❌ Error initializing popup:', error);
  }
}

// Initialize all manager instances
async function initializeManagers() {
  try {
    console.log('Initializing managers...');
    
    // Wait for manager classes to be loaded
    let attempts = 0;
    while ((!window.SummariesManager || !window.LiveChatManager || !window.SettingsManager) && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!window.SummariesManager || !window.LiveChatManager || !window.SettingsManager) {
      console.warn('Manager classes not loaded, using fallback initialization');
      // Fallback initialization will be handled by individual page switches
    } else {
      summariesManager = new window.SummariesManager();
      liveChatManager = new window.LiveChatManager();
      settingsManager = new window.SettingsManager();
      console.log('All managers initialized successfully');
    }
  } catch (error) {
    console.error('Error initializing managers:', error);
  }
}

// Set up event listeners for home page functionality
function setupHomePageEventListeners() {
  // Save summary button
  const saveButton = document.getElementById('saveButton');
  if (saveButton) {
    saveButton.addEventListener('click', handleSaveSummary);
  }

  // Summarize webpage button
  const summarizeWebpageButton = document.getElementById('summarizeWebpageButton');
  if (summarizeWebpageButton) {
    summarizeWebpageButton.addEventListener('click', handleSummarizeWebpage);
  }

  // Instant summary functionality
  const instantSummaryTextarea = document.getElementById('instantSummaryTextarea');
  const instantSummaryButton = document.getElementById('instantSummaryButton');
  
  if (instantSummaryTextarea) {
    instantSummaryTextarea.addEventListener('input', (event) => {
      if (instantSummaryButton) {
        instantSummaryButton.disabled = !event.target.value;
      }
    });
  }

  if (instantSummaryButton) {
    instantSummaryButton.addEventListener('click', handleInstantSummary);
  }

  // Settings change listeners
  const targetLanguageSelect = document.getElementById(TARGET_LANGUAGE);
  const summaryLengthSelect = document.getElementById('summaryLength');
  
  if (targetLanguageSelect) {
    targetLanguageSelect.addEventListener('change', (event) => {
      chrome.storage.local.set({ [TARGET_LANGUAGE]: event.target.value });
    });
  }

  if (summaryLengthSelect) {
    summaryLengthSelect.addEventListener('change', () => {
      const summaryLength = summaryLengthSelect.value;
      chrome.storage.local.set({ textLength: summaryLength });
    });
  }

  // Instant summary toggle
  const instantSummaryToggle = document.getElementById('instantSummaryToggle');
  if (instantSummaryToggle) {
    instantSummaryToggle.addEventListener('click', toggleInstantSummary);
  }

  // Share buttons
  const shareEmailButton = document.getElementById('shareEmail');
  const shareTwitterButton = document.getElementById('shareTwitter');
  
  if (shareEmailButton) {
    shareEmailButton.addEventListener('click', handleShareEmail);
  }
  
  if (shareTwitterButton) {
    shareTwitterButton.addEventListener('click', handleShareTwitter);
  }
}

// Toggle instant summary section
function toggleInstantSummary() {
  const toggle = document.getElementById('instantSummaryToggle');
  const container = document.querySelector('.instant-summary');
  
  if (!toggle || !container) return;
  
  if (toggle.classList.contains('closed')) {
    toggle.classList.remove('closed');
    toggle.classList.add('opened');
    toggle.textContent = 'Hide text summarizer';
  } else {
    toggle.classList.remove('opened');
    toggle.classList.add('closed');
    toggle.textContent = 'Insert text to summarize';
  }
}

// Handle save summary functionality
async function handleSaveSummary() {
  if (!(await checkPaymentStatus())) return;
  
  const saveButton = document.getElementById('saveButton');
  if (!saveButton || saveButton.disabled) return;
  
  const loadingIcon = document.getElementById('loadingContentIcon');
  const savedIcon = document.getElementById('savedContentIcon');
  
  if (loadingIcon) loadingIcon.classList.add('active');
  saveButton.disabled = true;
  
  try {
    const activeTab = await new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
    );

    const summary = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(activeTab.id, { action: 'getSummary' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });

    const tagsInput = document.getElementById('tags');
    const tags = tagsInput ? tagsInput.value.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

    if (summary && tags.length > 0) {
      const savedSummary = { summary, tags, timestamp: new Date().toISOString() };
      const { savedSummaries = [] } = await chrome.storage.local.get('savedSummaries');
      
      if (savedSummaries.some(existingSummary => 
          existingSummary.tags.sort().toString() === tags.sort().toString())) {
        const errorElement = document.getElementById('saveButtonError');
        if (errorElement) errorElement.classList.add('show');
        return;
      }
      
      savedSummaries.push(savedSummary);
      await chrome.storage.local.set({ savedSummaries });
      
      if (savedIcon) {
        savedIcon.classList.add('active');
        setTimeout(() => {
          savedIcon.classList.remove('active');
        }, 2000);
      }

      // Clear error message
      const errorElement = document.getElementById('saveButtonError');
      if (errorElement) errorElement.classList.remove('show');
    }
  } catch (error) {
    console.error('Error saving summary:', error);
  } finally {
    if (loadingIcon) loadingIcon.classList.remove('active');
    saveButton.disabled = false;
  }
}

// Handle summarize webpage functionality
async function handleSummarizeWebpage() {
  if (!(await checkPaymentStatus())) return;
  
  const summarizeWebpageButton = document.getElementById('summarizeWebpageButton');
  if (!summarizeWebpageButton || summarizeWebpageButton.disabled) return;
  
  const originalText = summarizeWebpageButton.textContent;
  summarizeWebpageButton.disabled = true;
  summarizeWebpageButton.textContent = 'Summarizing...';
  
  try {
    const activeTab = await new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
    );

    await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(activeTab.id, { action: 'summarizeWebpage' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  } catch (error) {
    console.error('Error summarizing webpage:', error);
  } finally {
    summarizeWebpageButton.disabled = false;
    summarizeWebpageButton.textContent = originalText;
  }
}

// Handle instant summary functionality
async function handleInstantSummary() {
  if (!(await checkPaymentStatus())) return;
  
  const instantSummaryTextarea = document.getElementById('instantSummaryTextarea');
  const instantSummaryButton = document.getElementById('instantSummaryButton');
  
  if (!instantSummaryTextarea || !instantSummaryButton) return;
  
  const text = instantSummaryTextarea.value.trim();
  if (!text || instantSummaryButton.classList.contains('clicked')) return;
  
  instantSummaryButton.classList.add('clicked');
  
  try {
    const activeTab = await new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
    );
    
    await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(activeTab.id, { action: 'summarize', text }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  } catch (error) {
    console.error('Error with instant summary:', error);
  } finally {
    setTimeout(() => {
      instantSummaryButton.classList.remove('clicked');
    }, 1000);
  }
}

// Handle share via email
async function handleShareEmail() {
  try {
    const activeTab = await new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
    );

    const summary = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(activeTab.id, { action: 'getSummary' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });

    if (summary) {
      const subject = encodeURIComponent('Summary from Content Summarizer');
      const body = encodeURIComponent(`Here's a summary I generated:\n\n${summary}\n\nGenerated using Content Summarizer extension.`);
      const mailtoLink = `mailto:?subject=${subject}&body=${body}`;
      chrome.tabs.create({ url: mailtoLink });
    }
  } catch (error) {
    console.error('Error sharing via email:', error);
  }
}

// Handle share on Twitter
async function handleShareTwitter() {
  try {
    const activeTab = await new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
    );

    const summary = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(activeTab.id, { action: 'getSummary' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });

    if (summary) {
      const tweetText = encodeURIComponent(`${summary.substring(0, 200)}... #ContentSummarizer`);
      const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;
      chrome.tabs.create({ url: twitterUrl });
    }
  } catch (error) {
    console.error('Error sharing on Twitter:', error);
  }
}

// Load initial settings
async function loadInitialSettings() {
  try {
    const storage = await chrome.storage.local.get([
      USER_LANGUAGE, 
      TARGET_LANGUAGE, 
      'textLength',
      'apiKey',
      'googleApiKey',
      'aiProvider'
    ]);
    
    // Set saved values
    if (storage[TARGET_LANGUAGE]) {
      const targetSelect = document.getElementById(TARGET_LANGUAGE);
      if (targetSelect) targetSelect.value = storage[TARGET_LANGUAGE];
    }
    
    if (storage.textLength) {
      const lengthSelect = document.getElementById('summaryLength');
      if (lengthSelect) lengthSelect.value = storage.textLength;
    }

    // Load API keys in settings
    if (storage.apiKey) {
      const apiKeyInput = document.getElementById('apiKeyInput');
      if (apiKeyInput) apiKeyInput.value = storage.apiKey;
    }

    if (storage.googleApiKey) {
      const googleApiKeyInput = document.getElementById('googleApiKeyInput');
      if (googleApiKeyInput) googleApiKeyInput.value = storage.googleApiKey;
    }

    if (storage.aiProvider) {
      const aiProviderSelect = document.getElementById('aiProvider');
      if (aiProviderSelect) aiProviderSelect.value = storage.aiProvider;
    }
    
    // Get current summary topic
    await loadCurrentSummaryTopic();
    
    // Setup settings page event listeners
    setupSettingsEventListeners();
  } catch (error) {
    console.error('Error loading initial settings:', error);
  }
}

// Setup settings page event listeners
function setupSettingsEventListeners() {
  // OpenAI API key toggle
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');
  const apiKeyInput = document.getElementById('apiKeyInput');
  
  if (toggleApiKeyBtn && apiKeyInput) {
    toggleApiKeyBtn.addEventListener('click', () => {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';
      const icon = toggleApiKeyBtn.querySelector('i');
      if (icon) {
        icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
      }
    });
  }

  // Google API key toggle
  const toggleGoogleApiKeyBtn = document.getElementById('toggleGoogleApiKey');
  const googleApiKeyInput = document.getElementById('googleApiKeyInput');
  
  if (toggleGoogleApiKeyBtn && googleApiKeyInput) {
    toggleGoogleApiKeyBtn.addEventListener('click', () => {
      const isPassword = googleApiKeyInput.type === 'password';
      googleApiKeyInput.type = isPassword ? 'text' : 'password';
      const icon = toggleGoogleApiKeyBtn.querySelector('i');
      if (icon) {
        icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
      }
    });
  }

  // Save OpenAI API key
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  if (saveApiKeyBtn) {
    saveApiKeyBtn.addEventListener('click', async () => {
      const apiKey = apiKeyInput?.value?.trim();
      const statusDiv = document.getElementById('apiKeyStatus');
      
      if (!apiKey) {
        showApiStatus(statusDiv, 'Please enter an API key', 'error');
        return;
      }

      try {
        await apiService.setApiKey('openai', apiKey);
        showApiStatus(statusDiv, 'OpenAI API key saved successfully', 'success');
      } catch (error) {
        showApiStatus(statusDiv, `Error saving API key: ${error.message}`, 'error');
      }
    });
  }

  // Save Google API key
  const saveGoogleApiKeyBtn = document.getElementById('saveGoogleApiKey');
  if (saveGoogleApiKeyBtn) {
    saveGoogleApiKeyBtn.addEventListener('click', async () => {
      const apiKey = googleApiKeyInput?.value?.trim();
      const statusDiv = document.getElementById('googleApiKeyStatus');
      
      if (!apiKey) {
        showApiStatus(statusDiv, 'Please enter an API key', 'error');
        return;
      }

      try {
        await apiService.setApiKey('google', apiKey);
        showApiStatus(statusDiv, 'Google AI API key saved successfully', 'success');
      } catch (error) {
        showApiStatus(statusDiv, `Error saving API key: ${error.message}`, 'error');
      }
    });
  }

  // Test OpenAI API key
  const testApiKeyBtn = document.getElementById('testApiKey');
  if (testApiKeyBtn) {
    testApiKeyBtn.addEventListener('click', async () => {
      const apiKey = apiKeyInput?.value?.trim();
      const statusDiv = document.getElementById('apiKeyStatus');
      
      if (!apiKey) {
        showApiStatus(statusDiv, 'Please enter an API key to test', 'error');
        return;
      }

      showApiStatus(statusDiv, 'Testing connection...', 'loading');
      
      try {
        const success = await apiService.testApiConnection('openai', apiKey, 'gpt-4o-mini');
        if (success) {
          showApiStatus(statusDiv, 'OpenAI connection successful!', 'success');
        } else {
          showApiStatus(statusDiv, 'OpenAI connection failed', 'error');
        }
      } catch (error) {
        showApiStatus(statusDiv, `Connection test failed: ${error.message}`, 'error');
      }
    });
  }

  // Test Google API key
  const testGoogleApiKeyBtn = document.getElementById('testGoogleApiKey');
  if (testGoogleApiKeyBtn) {
    testGoogleApiKeyBtn.addEventListener('click', async () => {
      const apiKey = googleApiKeyInput?.value?.trim();
      const statusDiv = document.getElementById('googleApiKeyStatus');
      
      if (!apiKey) {
        showApiStatus(statusDiv, 'Please enter an API key to test', 'error');
        return;
      }

      showApiStatus(statusDiv, 'Testing connection...', 'loading');
      
      try {
        const success = await apiService.testApiConnection('google', apiKey, 'gemini-pro');
        if (success) {
          showApiStatus(statusDiv, 'Google AI connection successful!', 'success');
        } else {
          showApiStatus(statusDiv, 'Google AI connection failed', 'error');
        }
      } catch (error) {
        showApiStatus(statusDiv, `Connection test failed: ${error.message}`, 'error');
      }
    });
  }

  // AI Provider selection
  const aiProviderSelect = document.getElementById('aiProvider');
  if (aiProviderSelect) {
    aiProviderSelect.addEventListener('change', async (event) => {
      const provider = event.target.value;
      await chrome.storage.local.set({ aiProvider: provider });
    });
  }

  // Clear all data button
  const clearAllDataBtn = document.getElementById('clearAllData');
  if (clearAllDataBtn) {
    clearAllDataBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all extension data? This cannot be undone.')) {
        try {
          await chrome.storage.local.clear();
          // Reload the popup to reflect changes
          window.location.reload();
        } catch (error) {
          console.error('Error clearing data:', error);
          alert('Error clearing data: ' + error.message);
        }
      }
    });
  }
}

// Helper function to show API status messages
function showApiStatus(statusDiv, message, type) {
  if (!statusDiv) return;
  
  statusDiv.textContent = message;
  statusDiv.className = `api-status ${type}`;
  
  // Clear status after 5 seconds for non-error messages
  if (type !== 'error') {
    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'api-status';
    }, 5000);
  }
}

// Load current summary topic from content script
async function loadCurrentSummaryTopic() {
  try {
    const activeTab = await new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
    );
    
    chrome.tabs.sendMessage(activeTab.id, { action: 'getSummaryTopic', key: 'summaryTopic' }, response => {
      if (response?.value) {
        const tagsInput = document.getElementById("tags");
        if (tagsInput) {
          tagsInput.value = response.value;
          const errorElement = document.getElementById('saveButtonError');
          if (errorElement) errorElement.classList.remove('show');
          
          const saveButton = document.getElementById('saveButton');
          if (saveButton) saveButton.disabled = false;
        }
      }
    });
  } catch (error) {
    console.log('Could not load summary topic:', error);
  }
}

// Handle auto-opening live tab if video data is waiting
async function handleAutoOpenLiveTab() {
  console.log('🔍 handleAutoOpenLiveTab() starting...');
  
  try {
    console.log('🔍 Requesting video data from background...');
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getVideoData' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
    
    console.log('🔍 Background response:', response);
    
    if (response && response.shouldOpenLiveTab && response.videoData) {
      console.log('🔍 Auto-switching to Live Summary tab with video data:', response.videoData.title);
      
      // Force switch to Live Summary tab immediately
      await forceSwitchToLiveTab();
      
      // Initialize Live Chat Manager with video data
      setTimeout(async () => {
        console.log('🔍 Initializing Live Chat Manager with video data...');
        if (liveChatManager && liveChatManager.initializeWithCurrentVideo) {
          // FIXED: Pass the video data directly to preserve existing saved state
          await liveChatManager.initializeWithCurrentVideo(response.videoData);
        } else {
          // Fallback: create manager if it doesn't exist
          if (window.LiveChatManager) {
            liveChatManager = new window.LiveChatManager();
            // FIXED: Pass the video data directly to preserve existing saved state
            await liveChatManager.initializeWithCurrentVideo(response.videoData);
          } else {
            console.log('🔍 LiveChatManager class not available yet, will be handled by page switch');
          }
        }
      }, 500);
    } else {
      console.log('🔍 No auto-open required:');
      console.log('  - shouldOpenLiveTab:', response?.shouldOpenLiveTab);
      console.log('  - hasVideoData:', !!response?.videoData);
      console.log('  - response:', response);
    }
  } catch (error) {
    console.log('🔍 ERROR: No video data available from background:', error);
  }
}

// Force switch to Live Summary tab (bypassing tab switcher timing issues)
async function forceSwitchToLiveTab() {
  console.log('🔄 FORCE SWITCH: forceSwitchToLiveTab() called');
  
  // Wait for DOM elements to be ready
  let attempts = 0;
  const maxAttempts = 50;
  
  console.log('🔄 FORCE SWITCH: Looking for required elements...');
  
  while (attempts < maxAttempts) {
    const liveTab = document.getElementById('menuLive');
    const livePage = document.getElementById('liveSummaryPage');
    
    console.log(`🔄 FORCE SWITCH: Attempt ${attempts + 1}/${maxAttempts}`);
    console.log('🔄 FORCE SWITCH: liveTab found:', !!liveTab);
    console.log('🔄 FORCE SWITCH: livePage found:', !!livePage);
    
    if (liveTab && livePage) {
      console.log('🔄 FORCE SWITCH: Found required elements, switching tabs...');
      
      // Log current state before switching
      const allTabs = document.querySelectorAll('.nav-tab, .menu__item');
      const allPages = document.querySelectorAll('.page');
      
      console.log('🔄 FORCE SWITCH: Current tab states:');
      allTabs.forEach((tab, index) => {
        console.log(`  Tab ${index} (${tab.id}): active=${tab.classList.contains('active')}`);
      });
      
      console.log('🔄 FORCE SWITCH: Current page states:');
      allPages.forEach((page, index) => {
        console.log(`  Page ${index} (${page.id}): active=${page.classList.contains('active-page')}`);
      });
      
      // Remove active from all tabs and pages - FIXED: More thorough cleanup
      console.log('🔄 FORCE SWITCH: Removing active classes...');
      allTabs.forEach(tab => {
        if (tab.classList.contains('active')) {
          console.log(`🔄 FORCE SWITCH: Removing active from tab: ${tab.id}`);
          tab.classList.remove('active');
        }
      });
      
      allPages.forEach(page => {
        if (page.classList.contains('active-page')) {
          console.log(`🔄 FORCE SWITCH: Removing active-page from: ${page.id}`);
          page.classList.remove('active-page');
        }
      });
      
      // Activate Live Summary tab and page
      console.log('🔄 FORCE SWITCH: Adding active classes to Live Summary...');
      liveTab.classList.add('active');
      livePage.classList.add('active-page');
      
      // Verify the switch worked
      const isTabActive = liveTab.classList.contains('active');
      const isPageActive = livePage.classList.contains('active-page');
      
      console.log('🔄 FORCE SWITCH: Verification:');
      console.log(`  Live tab active: ${isTabActive}`);
      console.log(`  Live page active: ${isPageActive}`);
      
      if (isTabActive && isPageActive) {
        console.log('🔄 FORCE SWITCH: ✅ Successfully switched to Live Summary tab');
        
        // Also call the page switch handler
        if (window.handlePageSwitch) {
          console.log('🔄 FORCE SWITCH: Calling handlePageSwitch for liveSummaryPage');
          await window.handlePageSwitch('liveSummaryPage');
        }
        
        return true;
      } else {
        console.error('🔄 FORCE SWITCH: ❌ Failed to set active classes properly');
        return false;
      }
    }
    
    console.log('🔄 FORCE SWITCH: Elements not found yet, waiting...');
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  
  console.error('🔄 FORCE SWITCH: ❌ Failed to find tab elements after', maxAttempts * 100, 'ms');
  
  // Log what elements we do have for debugging
  const allElements = document.querySelectorAll('[id*="menu"], [id*="Page"]');
  console.log('🔄 FORCE SWITCH: Available elements with menu/Page in ID:');
  allElements.forEach(el => {
    console.log(`  - ${el.id}: ${el.tagName}, classes: ${el.className}`);
  });
  
  return false;
}

// Set up runtime message listener
function setupRuntimeMessageListener() {
  chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    console.log('Popup received message:', request);
    
    if (request.action === "updateTags" && request.data) {
      const tagsInput = document.getElementById("tags");
      if (tagsInput) {
        tagsInput.value = request.data;
        const errorElement = document.getElementById('saveButtonError');
        if (errorElement) errorElement.classList.remove('show');
        
        const saveButton = document.getElementById('saveButton');
        if (saveButton) saveButton.disabled = false;
      }
    } else if (request.action === "openLiveSummary" && request.videoData) {
      console.log('📺 Opening Live Summary with video data from runtime message:', request.videoData.title);
      
      // Force switch to Live Summary tab immediately
      await forceSwitchToLiveTab();
      
      // Initialize with video data
      setTimeout(async () => {
        console.log('📺 Initializing with video data from runtime message...');
        if (liveChatManager && liveChatManager.initializeWithCurrentVideo) {
          await liveChatManager.initializeWithCurrentVideo(request.videoData);
        } else {
          // Fallback: create manager if it doesn't exist
          if (window.LiveChatManager) {
            liveChatManager = new window.LiveChatManager();
            await liveChatManager.initializeWithCurrentVideo(request.videoData);
          } else {
            console.log('📺 LiveChatManager class not available yet, will be handled by page switch');
          }
        }
      }, 500);
    }
    
    sendResponse({ success: true });
  });
}

// Page switching handlers (to work with tab-switcher.js)
window.handlePageSwitch = async function(targetPageId) {
  console.log('Handling page switch to:', targetPageId);
  
  try {
    if (targetPageId === 'liveSummaryPage') {
      // Check if LiveChatManager already exists and is initialized
      if (liveChatManager && liveChatManager.isInitialized && liveChatManager.currentVideoId) {
        console.log('🎬 LiveChatManager already initialized with video:', liveChatManager.currentVideoId, '- preserving state');
        // Just ensure the UI is updated, don't re-initialize
        if (liveChatManager.youtubeLiveSummary && liveChatManager.youtubeLiveSummary.currentVideoData) {
          liveChatManager.updateVideoInfo(liveChatManager.youtubeLiveSummary.currentVideoData);
        }
        return; // Don't re-initialize
      }
      
      if (!liveChatManager) {
        if (window.LiveChatManager) {
          liveChatManager = new window.LiveChatManager();
        }
      }
      if (liveChatManager && liveChatManager.initialize) {
        await liveChatManager.initialize();
      }
    } else if (targetPageId === 'summariesPage') {
      if (!summariesManager) {
        if (window.SummariesManager) {
          summariesManager = new window.SummariesManager();
          // Make it globally available
          window.summariesManager = summariesManager;
        }
      }
      if (summariesManager && summariesManager.initialize) {
        await summariesManager.initialize();
      }
    } else if (targetPageId === 'settingsPage') {
      if (!settingsManager) {
        if (window.SettingsManager) {
          settingsManager = new window.SettingsManager();
        }
      }
      if (settingsManager && settingsManager.initialize) {
        settingsManager.initialize();
      }
    }
  } catch (error) {
    console.error('Error in page switch handler:', error);
  }
};

// Run initialization immediately or when DOM is ready
if (document.readyState === 'loading') {
  // If DOM is still loading, wait for it
  document.addEventListener('DOMContentLoaded', initializePopup);
} else {
  // DOM is already loaded, run immediately
  console.log('🚀 POPUP: DOM already loaded, initializing immediately');
  initializePopup();
}
