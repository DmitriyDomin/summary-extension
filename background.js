import {checkPaymentStatus} from "./api/extpay";
import { updateWordCount } from "./api/firebase";

let temporaryData = {};

//import('ExtPay.js') // or `import` / `require` if using a bundler

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'summarize',
    title: 'Summarize Content',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'summarize') {
    if(!(await checkPaymentStatus(info.selectionText))) return;
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
  }
  // else if (request.action === "getSummaryTopic") {
  //   console.log('getSummaryTopic', temporaryData, request.key);
  //   sendResponse({ value: temporaryData[request.key] });
  // }
});
