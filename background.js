console.log(1234567);
let temporaryData = {};

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
  if (request.action === "updateTags") {
    console.log('updateTags', request.data);
    temporaryData['summaryTopic'] = request.data;
    try {
      chrome.runtime.sendMessage({action: "updatePopup", data: request.data});
    } catch (e) {
      console.log(e);
    }
  } else if (request.action === "getSummaryTopic") {
    console.log('getSummaryTopic', temporaryData, request.key);
    sendResponse({ value: temporaryData[request.key] });
  }
});
