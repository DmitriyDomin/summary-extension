const lengthMap = { short: 50, medium: 100, long: 200 };
const TARGET_LANGUAGE = 'targetLanguage';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);
  importStyles();
  
  if (request.action === 'summarize' || request.action === 'summarizeWebpage') {
    handleSummarization(request, sendResponse);
    return true; // Keep channel open for async response
  } else if (request.action === 'getSummary') {
    const summaryDiv = document.getElementById('summaryDiv');
    if (summaryDiv) {
      const summaryContent = summaryDiv.querySelector('#summaryContent');
      sendResponse(summaryContent ? summaryContent.textContent : null);
    } else {
      sendResponse(null);
    }
  } else if (request.action === 'getSummaryTopic') {
    const topicElement = document.getElementsByClassName('summary-topic')[0];
    sendResponse({ value: topicElement ? topicElement.innerHTML : null });
  }
  
  return true;
});

// Handle summarization requests
async function handleSummarization(request, sendResponse) {
  try {
    importStyles();
    displayLoading();
    
    // Get user preferences
    const targetLanguage = await getStorageValue(TARGET_LANGUAGE);
    const textLength = await getStorageValue('textLength') || 'medium';
    const length = lengthMap[textLength] || lengthMap.medium;
    
    // Prepare content and prompt
    let content, prompt;
    if (request.action === 'summarize') {
      content = request.text;
      prompt = `${content}\n\nSummarize the following text to approximately ${length} words. Include a clear title in parentheses () and indicate the original language in square brackets [].`;
    } else {
      content = document.body.innerText;
      const title = document.title || 'Web Page';
      const url = document.URL;
      prompt = `Title: ${title}\nURL: ${url}\nContent: ${content}\n\nSummarize this webpage content to approximately ${length} words. Include a clear title in parentheses () and indicate the original language in square brackets [].`;
    }
    
    // Generate summary using secure API
    let summary = await generateSecureSummary(prompt, textLength);
    let [updatedSummary, originalLang] = getLanguage(summary);
    let topic = '';
    
    // Handle translation if needed
    if (targetLanguage && targetLanguage !== 'none' && originalLang.toLowerCase() !== targetLanguage.toLowerCase()) {
      try {
        updatedSummary = await translateSecurely(updatedSummary, targetLanguage);
      } catch (translationError) {
        console.warn('Translation failed, using original summary:', translationError);
      }
    }
    
    // Parse topic from summary
    [updatedSummary, topic] = parseText(updatedSummary);
    
    // Update popup with topic
    chrome.runtime.sendMessage({ action: "updateTags", data: topic });
    
    // Display summary
    displaySummary(updatedSummary, topic);
    sendResponse(updatedSummary);
    
  } catch (error) {
    console.error('Summarization error:', error);
    displayError(error.message);
    sendResponse({ error: error.message });
  }
}

// Helper function to get storage values
function getStorageValue(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key]);
    });
  });
}

// Display error message
function displayError(message) {
  const summaryDiv = document.getElementById('summaryDiv') || createSummaryContainer();
  
  summaryDiv.innerHTML = '';
  summaryDiv.classList.remove('loading');
  
  const closeButton = document.createElement('button');
  closeButton.textContent = '+';
  closeButton.classList.add('close-button-SE');
  closeButton.onclick = () => summaryDiv.remove();
  
  const errorContent = document.createElement('div');
  errorContent.style.cssText = 'color: #d32f2f; padding: 15px; text-align: center;';
  errorContent.innerHTML = `
    <h3 style="margin: 0 0 10px 0;">⚠️ Error</h3>
    <p style="margin: 0;">${message}</p>
  `;
  
  summaryDiv.appendChild(closeButton);
  summaryDiv.appendChild(errorContent);
}

// Create summary container
function createSummaryContainer() {
  const summaryDiv = document.createElement('div');
  summaryDiv.setAttribute('id', 'summaryDiv');
  summaryDiv.classList.add('summary-container-SE');
  dragElement(summaryDiv);
  document.body.appendChild(summaryDiv);
  return summaryDiv;
}

function displayLoading() {
  let summaryDiv = document.getElementById('summaryDiv');
  if (summaryDiv) {
    summaryDiv.innerHTML = '';
    summaryDiv.classList.add('loading');
    addLoadingSpinner(summaryDiv);
  } else {
    const summaryDiv = document.createElement('div');
    summaryDiv.setAttribute('id', 'summaryDiv');
    summaryDiv.classList.add('summary-container-SE', 'loading');
    addLoadingSpinner(summaryDiv);
    dragElement(summaryDiv);
    document.body.appendChild(summaryDiv);
  }
}

function addLoadingSpinner(summaryDiv) {
  const loadingSpinner = document.createElement('div');
  loadingSpinner.classList.add('loading-spinner-SE');
  summaryDiv.appendChild(loadingSpinner);
}

function importStyles() {
  const cssLink = document.createElement('link');
  cssLink.href = chrome.runtime.getURL('summary.css');
  cssLink.rel = 'stylesheet';
  document.head.appendChild(cssLink);
}

function displaySummary(summary, topic) {
  // Create a floating div to display the summary
  const summaryDiv = document.getElementById('summaryDiv');
  // summaryDiv.setAttribute('id', 'summaryDiv');
  // summaryDiv.classList.add('summary-container-SE');

  const closeButton = document.createElement('button');
  closeButton.textContent = '+';
  closeButton.classList.add('close-button-SE');
  closeButton.onclick = () => summaryDiv.remove();

  let copyButton = document.createElement('button');
  copyButton.classList.add('copy-button-SE');
  copyButton.textContent = chrome.i18n.getMessage('copy');
  copyButton.addEventListener('click', function() {
    let summaryText = document.getElementById('summaryContent').innerText;
    navigator.clipboard.writeText(summaryText).then(function() {
      console.log('Summary copied to clipboard.');
    }, function() {
      console.log('Failed to copy summary to clipboard.');
    });
  });

  const summaryTopic = document.createElement('h2');
  summaryTopic.classList.add('summary-topic');
  summaryTopic.textContent = topic;
  const summaryContent = document.createElement('div');
  summaryContent.setAttribute('id', 'summaryContent');
  summaryContent.textContent = summary;

  summaryDiv.innerHTML = '';
  summaryDiv.classList.remove('loading');
  summaryDiv.appendChild(closeButton);
  summaryDiv.appendChild(copyButton);
  summaryDiv.appendChild(summaryTopic);
  summaryDiv.appendChild(summaryContent);
  console.log(summaryDiv, 'summaryDiv')
  // dragElement(summaryDiv);
  // document.body.appendChild(summaryDiv);
}

function parseText(text) {
  const topic = text.match(/\(([^)]+)\)/)[1];
  let newText = text.replace(`(${topic})`, '');
  return [newText, topic];
}

function getLanguage(text) {
  const lang = text.match(/\[(.*?)\]/)[1];
  let newText = text.replace(`[${lang}]`, '');
  return [newText, lang];
}

function dragElement(elmnt) {
  var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  if (document.getElementById(elmnt.id + "header")) {
    // if present, the header is where you move the DIV from:
    document.getElementById(elmnt.id + "header").onmousedown = dragMouseDown;
  } else {
    // otherwise, move the DIV from anywhere inside the DIV:
    elmnt.onmousedown = dragMouseDown;
  }

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    // get the mouse cursor position at startup:
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    // call a function whenever the cursor moves:
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    // calculate the new cursor position:
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // set the element's new position:
    elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
    elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
  }

  function closeDragElement() {
    // stop moving when mouse button is released:
    document.onmouseup = null;
    document.onmousemove = null;
  }
}
