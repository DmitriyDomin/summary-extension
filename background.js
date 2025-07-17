// Enhanced background script with improved side panel communication
const temporaryData = {};

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
  } else if (request.action === "openLiveSummary") {
    // Store video data and open side panel for Live Summary
    console.log('Opening Live Summary side panel with video data:', request.videoData);
    
    // Store video data temporarily with special flag
    temporaryData['videoData'] = request.videoData;
    temporaryData['shouldOpenLiveTab'] = true;
    
    // Send response immediately
    sendResponse({ status: 'received' });
    
    // Open the side panel - it will auto-detect video data when ready
    chrome.sidePanel.open({ tabId: sender.tab.id }).then(() => {
      console.log('Side panel opened for Live Summary - panel will auto-detect video data');
    }).catch((error) => {
      console.error('Failed to open side panel:', error);
      // If side panel is already open, it will still auto-detect the video data
      console.log('Side panel may already be open - video data stored for pickup');
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
    console.log('Popup requesting video data. Current data:', temporaryData['videoData']);
    const videoData = temporaryData['videoData'] || null;
    const shouldOpenLiveTab = temporaryData['shouldOpenLiveTab'] || false;
    const isFromSavedVideo = temporaryData['isFromSavedVideo'] || false;
    
    // Clear the flags after first request to prevent multiple auto-opens
    if (shouldOpenLiveTab) {
      temporaryData['shouldOpenLiveTab'] = false;
      temporaryData['isFromSavedVideo'] = false;
      console.log('Returning video data with shouldOpenLiveTab=true, isFromSavedVideo=', isFromSavedVideo);
    }
    
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
        
        if (!tab.url || !tab.url.includes('youtube.com')) {
          console.log('Tab is not a YouTube page:', tab.url);
          sendResponse({ videoData: null, error: 'Not a YouTube page' });
          return;
        }
        
        try {
          const response = await safeSendMessage(targetTabId, { action: 'getCurrentVideoData' });
          console.log('Got video data from specified tab:', response?.videoData?.title);
          sendResponse(response);
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
  }
  return true; // Keep the message channel open
});
