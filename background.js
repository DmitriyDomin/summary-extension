// Enhanced background script with improved side panel communication
const temporaryData = {};

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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'summarize') {
    chrome.tabs.sendMessage(tab.id, { action: 'summarize', text: info.selectionText });
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
    // FIXED: New action to get current video info for side panel
    console.log('Side panel requesting current video info');
    
    // If a specific tabId is provided, use that
    const targetTabId = request.tabId;
    
    if (targetTabId) {
      console.log('Using specific tab ID:', targetTabId);
      // Try to get current video data from the specified tab
      chrome.tabs.sendMessage(targetTabId, { action: 'getCurrentVideoData' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Could not get video data from specified tab:', chrome.runtime.lastError.message);
          sendResponse({ videoData: null });
        } else {
          console.log('Got video data from specified tab:', response?.videoData?.title);
          sendResponse(response);
        }
      });
      return true; // Keep channel open for async response
    } else if (sender.tab?.id) {
      // Fallback to sender tab
      console.log('Using sender tab ID:', sender.tab.id);
      chrome.tabs.sendMessage(sender.tab.id, { action: 'getCurrentVideoData' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Could not get video data from sender tab:', chrome.runtime.lastError.message);
          sendResponse({ videoData: null });
        } else {
          console.log('Got video data from sender tab:', response?.videoData?.title);
          sendResponse(response);
        }
      });
      return true; // Keep channel open for async response
    } else {
      console.log('No tab ID available for getCurrentVideoInfo');
      sendResponse({ videoData: null });
    }
  } else if (request.action === "fetchTranscriptForSidePanel") {
    // FIXED: New action to fetch transcript from side panel
    console.log('Side panel requesting transcript for video:', request.videoId);
    
    // If a specific tabId is provided, use that
    const targetTabId = request.tabId;
    
    if (targetTabId) {
      console.log('Using specific tab ID for transcript:', targetTabId);
      chrome.tabs.sendMessage(targetTabId, { 
        action: 'fetchTranscript', 
        videoId: request.videoId 
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Could not fetch transcript from specified tab:', chrome.runtime.lastError.message);
          sendResponse({ transcript: null, error: chrome.runtime.lastError.message });
        } else {
          console.log('Successfully fetched transcript from specified tab');
          sendResponse(response);
        }
      });
      return true; // Keep channel open for async response
    } else if (sender.tab?.id) {
      // Fallback to sender tab
      chrome.tabs.sendMessage(sender.tab.id, { 
        action: 'fetchTranscript', 
        videoId: request.videoId 
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Could not fetch transcript from sender tab:', chrome.runtime.lastError.message);
          sendResponse({ transcript: null, error: chrome.runtime.lastError.message });
        } else {
          console.log('Successfully fetched transcript for side panel');
          sendResponse(response);
        }
      });
      return true; // Keep channel open for async response
    } else {
      sendResponse({ transcript: null, error: 'No active tab' });
    }
  }
  return true; // Keep the message channel open
});
