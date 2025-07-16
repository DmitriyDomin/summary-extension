let temporaryData = {};

// Temporarily disable ExtPay to fix module loading issues
// TODO: Re-implement payment system later if needed
console.log('Extension loaded without payment system');

chrome.runtime.onInstalled.addListener(() => {
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
    // Store video data and open popup for Live Summary
    console.log('Opening Live Summary popup with video data:', request.videoData);
    
    // Store video data temporarily with special flag
    temporaryData['videoData'] = request.videoData;
    temporaryData['shouldOpenLiveTab'] = true;
    
    // Send response immediately
    sendResponse({ status: 'received' });
    
    // Try to open the popup - let the popup handle the video data loading itself
    chrome.action.openPopup().then(() => {
      console.log('Popup opened for Live Summary - popup will auto-detect video data');
      // Removed immediate message sending - popup will request video data when ready
    }).catch((error) => {
      console.error('Failed to open popup:', error);
      // If popup is already open, it will still auto-detect the video data
      console.log('Popup may already be open - video data stored for pickup');
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
    temporaryData['isFromSavedVideo'] = true; // Flag to indicate this is saved video data
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
  }
  return true; // Keep the message channel open
});
