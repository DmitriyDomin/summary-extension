// Enhanced background script with improved side panel communication
const temporaryData = {};

// The Gemini key is supplied by the user in the extension settings and read from storage.
async function getGeminiApiKey() {
  const { googleApiKey } = await chrome.storage.local.get(['googleApiKey']);
  return googleApiKey || null;
}

// Global utility function for safe tab messaging with retry logic
const safeSendMessage = async (tabId, message, options = {}) => {
  const { maxRetries = 3, timeout = 3000, injectScripts = false } = options;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`SafeSendMessage: Attempt ${attempt}/${maxRetries} to tab ${tabId}`, message.action);
      
      // Check if tab exists first
      const tab = await new Promise((resolve, reject) => {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(tab);
          }
        });
      });
      
      if (!tab) {
        throw new Error('Tab not found');
      }
      
      const response = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Timeout')), timeout);
        
        chrome.tabs.sendMessage(tabId, message, (response) => {
          clearTimeout(timeoutId);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      return response;
      
    } catch (error) {
      console.log(`SafeSendMessage: Attempt ${attempt} failed:`, error.message);
      
      // Try to inject content scripts on first connection failure
      if (attempt === 1 && error.message.includes('Could not establish connection') && injectScripts) {
        try {
          if (chrome.scripting && chrome.scripting.executeScript) {
            console.log('SafeSendMessage: Injecting content scripts...');
            await new Promise((resolve, reject) => {
              chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['api-service.js', 'chatgpt-integration.js', 'youtube-content.js']
              }, (result) => {
                if (chrome.runtime.lastError) {
                  console.log('Script injection failed:', chrome.runtime.lastError.message);
                  resolve(null); // Don't reject - continue with retry
                } else {
                  resolve(result);
                }
              });
            });
            // Wait for scripts to initialize
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (injectionError) {
          console.log('SafeSendMessage: Script injection error:', injectionError.message);
        }
      }
      
      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      } else {
        throw error;
      }
    }
  }
};

// Temporarily disable ExtPay to fix module loading issues
// TODO: Re-implement payment system later if needed
console.log('Extension loaded without payment system');

// Configure side panel to open when action is clicked
chrome.runtime.onInstalled.addListener(() => {
  // Set up side panel behavior
  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true});
  
  chrome.contextMenus.create({
    id: 'summarize',
    title: 'Summarize Content',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'summarize') {
    try {
      await safeSendMessage(tab.id, { action: 'summarize', text: info.selectionText });
    } catch (error) {
      console.log('Context menu summarize failed:', error.message);
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request.action, request);
  
  if (request.action === "updateTags") {
    console.log('updateTags', request.data);
    temporaryData['summaryTopic'] = request.data;
    try {
      chrome.runtime.sendMessage({action: "updatePopup", data: request.data});
    } catch (e) {
      console.log(e);
    }
  } else if (request.action === 'openSidePanel') {
    // Called synchronously from the content script click handler while user gesture is still alive.
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch(err => {
      console.warn('openSidePanel: could not open side panel:', err);
    });
    sendResponse({ status: 'opening' });

  } else if (request.action === "openLiveSummary") {
    // Store video data and push it to the already-open side panel.
    console.log('openLiveSummary received:', request.videoData?.title);

    temporaryData['videoData'] = request.videoData;
    temporaryData['shouldOpenLiveTab'] = true;

    sendResponse({ status: 'received' });

    // Push data directly to the side panel (which openSidePanel already opened).
    // If the panel isn’t open yet for some reason, also try sidePanel.open as fallback.
    chrome.runtime.sendMessage({ action: 'openLiveSummary', videoData: request.videoData })
      .catch(() => {
        // Panel not open — try opening it now (may fail without user gesture, but worth trying)
        chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
      });
  } else if (request.action === "storeVideoData") {
    // Alternative method to store video data
    console.log('Storing video data for popup:', request.videoData);
    temporaryData['videoData'] = request.videoData;
    temporaryData['shouldOpenLiveTab'] = true;
    sendResponse({ status: 'stored' });
  } else if (request.action === "storeSavedVideoData") {
    // NEW: Handle saved video data from summaries manager
    console.log('Storing saved video data for live chat:', request.videoData);
    temporaryData['videoData'] = request.videoData;
    temporaryData['shouldOpenLiveTab'] = true;
    temporaryData['isFromSavedVideo'] = true;
    sendResponse({ status: 'saved_video_stored' });
  } else if (request.action === "getVideoData") {
    // Return stored video data and clear the flag
    console.log('Popup requesting video data. Current data:', temporaryData['shouldOpenLiveTab']);
    const videoData = temporaryData['videoData'] || null;
    const shouldOpenLiveTab = temporaryData['shouldOpenLiveTab'] || false;
    const isFromSavedVideo = temporaryData['isFromSavedVideo'] || false;
    
    // Clear the flags after first request to prevent multiple auto-opens
    // if (shouldOpenLiveTab) {
    //   console.log('Clear flags');
    //   temporaryData['shouldOpenLiveTab'] = false;
    //   temporaryData['isFromSavedVideo'] = false;
    //   console.log('Returning video data with shouldOpenLiveTab=true, isFromSavedVideo=', isFromSavedVideo);
    // }
    
    sendResponse({ videoData, shouldOpenLiveTab, isFromSavedVideo });
  } else if (request.action === "getCurrentVideoInfo") {
    // FIXED: More robust approach to get current video info for side panel
    console.log('Side panel requesting current video info');
    
    // Get the target tab ID
    const targetTabId = request.tabId;
    
    if (targetTabId) {
      console.log('Using specific tab ID:', targetTabId);
      
      // Check if tab exists and is a YouTube page
      chrome.tabs.get(targetTabId, async (tab) => {
        if (chrome.runtime.lastError) {
          console.log('Tab not found:', chrome.runtime.lastError.message);
          sendResponse({ videoData: null, error: 'Tab not found' });
          return;
        }
        
        if (!tab.url || (!tab.url.includes('youtube.com') && !tab.url.includes('udemy.com'))) {
          console.log('Tab is not a YouTube or Udemy page:', tab.url);
          sendResponse({ videoData: null, error: 'Not a YouTube or Udemy page' });
          return;
        }
        
        try {
          // Choose the appropriate action based on the platform
          const action = tab.url.includes('udemy.com') ? 'getUdemyVideoData' : 'getCurrentVideoData';
          const response = await safeSendMessage(targetTabId, { action: action });
          console.log(`Got ${tab.url.includes('udemy.com') ? 'Udemy course' : 'YouTube video'} data from specified tab:`, response?.videoData?.title || response?.courseData?.title);
          
          // Normalize response format for Udemy
          if (action === 'getUdemyVideoData' && response?.courseData) {
            sendResponse({ videoData: response.courseData });
          } else {
            sendResponse(response);
          }
        } catch (error) {
          console.log('All attempts failed for specified tab:', error.message);
          sendResponse({ videoData: null, error: error.message });
        }
      });
      
      return true; // Keep channel open for async response
      
    } else {
      // Try to find an active YouTube tab
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const activeTab = tabs[0];
        
        if (!activeTab) {
          sendResponse({ videoData: null, error: 'No active tab found' });
          return;
        }
        
        if (!activeTab.url || !activeTab.url.includes('youtube.com')) {
          sendResponse({ videoData: null, error: 'Active tab is not a YouTube page' });
          return;
        }
        
        try {
          const response = await safeSendMessage(activeTab.id, { action: 'getCurrentVideoData' });
          console.log('Got video data from active tab:', response?.videoData?.title);
          sendResponse(response);
        } catch (error) {
          console.log('All attempts failed for active tab:', error.message);
          sendResponse({ videoData: null, error: error.message });
        }
      });
      
      return true; // Keep channel open for async response
    }
  } else if (request.action === "fetchTranscriptForSidePanel") {
    // FIXED: Use safe messaging for transcript fetching
    console.log('Side panel requesting transcript for video:', request.videoId);
    
    const targetTabId = request.tabId;
    
    if (targetTabId) {
      console.log('Using specific tab ID for transcript:', targetTabId);
      
      (async () => {
        try {
          const response = await safeSendMessage(targetTabId, { 
            action: 'fetchTranscript', 
            videoId: request.videoId 
          }, { injectScripts: true });
          
          console.log('Successfully fetched transcript from specified tab');
          sendResponse(response);
        } catch (error) {
          console.log('Could not fetch transcript from specified tab:', error.message);
          sendResponse({ transcript: null, error: error.message });
        }
      })();
      
      return true; // Keep channel open for async response
    } else if (sender.tab?.id) {
      // Fallback to sender tab
      (async () => {
        try {
          const response = await safeSendMessage(sender.tab.id, { 
            action: 'fetchTranscript', 
            videoId: request.videoId 
          }, { injectScripts: true });
          
          console.log('Successfully fetched transcript for side panel');
          sendResponse(response);
        } catch (error) {
          console.log('Could not fetch transcript from sender tab:', error.message);
          sendResponse({ transcript: null, error: error.message });
        }
      })();
      
      return true; // Keep channel open for async response
    } else {
      sendResponse({ transcript: null, error: 'No active tab' });
    }
  } else if (request.action === "geminiRequest") {
    (async () => {
      try {
        const modelMatch = request.endpoint.match(/models\/([^:?/]+)/);
        const model = modelMatch ? modelMatch[1] : 'gemini-3.5-flash';
        const geminiApiKey = await getGeminiApiKey();
        if (!geminiApiKey) {
          sendResponse({ ok: false, status: 401, error: 'Google API key not configured. Add it in the extension settings.' });
          return;
        }
        const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:streamGenerateContent?key=${geminiApiKey}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request.body)
        });

        const text = await response.text();

        if (!response.ok) {
          let errMsg;
          try { errMsg = JSON.parse(text)?.error?.message; } catch (_) {}
          sendResponse({ ok: false, status: response.status, error: errMsg || text.substring(0, 300) || `HTTP ${response.status}` });
          return;
        }

        // streamGenerateContent returns a JSON array of chunks — concatenate all text parts
        let chunks = [];
        try { chunks = JSON.parse(text); } catch (_) {}
        if (!Array.isArray(chunks)) chunks = [chunks];

        let fullText = '';
        for (const chunk of chunks) {
          for (const part of chunk?.candidates?.[0]?.content?.parts || []) {
            if (part.text) fullText += part.text;
          }
        }

        sendResponse({ ok: true, data: { candidates: [{ content: { role: 'model', parts: [{ text: fullText }] }, finishReason: 'STOP' }] } });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;

  } else if (request.action === "fetchUdemyTranscriptForQuiz") {
    // Handle Udemy transcript fetching for quiz generation
    console.log('Quiz manager requesting Udemy transcript for tab:', request.tabId);
    
    const targetTabId = request.tabId;
    
    if (targetTabId) {
      (async () => {
        try {
          const response = await safeSendMessage(targetTabId, { 
            action: 'fetchUdemyTranscript'
          }, { injectScripts: true });
          
          console.log('Successfully fetched Udemy transcript for quiz');
          sendResponse(response);
        } catch (error) {
          console.log('Could not fetch Udemy transcript for quiz:', error.message);
          sendResponse({ transcript: null, error: error.message });
        }
      })();
      
      return true; // Keep channel open for async response
    } else {
      sendResponse({ transcript: null, error: 'No tab ID provided' });
    }
  }
  return true; // Keep the message channel open
});
