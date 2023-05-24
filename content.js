const lengthMap = { short: 50, medium: 100, long: 200 };
const TARGET_LANGUAGE = 'targetLanguage';
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(1234);
  importStyles();
  if (request.action === 'summarize' || request.action === 'summarizeWebpage') {
    importStyles();
    const apiKey = 'REDACTED_OPENAI_API_KEY';
    chrome.storage.local.get(TARGET_LANGUAGE).then((res) => {
      const targetLanguage = res[TARGET_LANGUAGE];
      chrome.storage.local.get('textLength').then((res2) => {
        const length = lengthMap[res2.textLength] || lengthMap.short;
        const prompt =
          request.action === 'summarize'
            ? `${request.text} \n summarize the following text to ${length} words, give it a title in () and the original language in []`
            : `${document.URL} \n summarize this webpage to ${length} words,  give it a title in () and the original language in []`;
        displayLoading();
        generateSummary(apiKey, prompt).then((summary) => {
          let [updatedSummary, originalLang] = getLanguage(summary);
          let topic = '';
          if (targetLanguage && originalLang.toLowerCase() !== targetLanguage) {
            const translationPrompt = `${updatedSummary} \n translate it to ${targetLanguage} including the text in ()`;
            generateSummary(apiKey, translationPrompt).then((updatedSummary) => {
              updatedSummary = updatedSummary;
            });
          }
          [updatedSummary, topic] = parseText(updatedSummary);
          chrome.runtime.sendMessage({ action: "updateTags", data: topic });
          displaySummary(updatedSummary, topic);
          sendResponse(updatedSummary);
        });
      });
    });
    return true;
  } else if (request.action === 'getSummary') {
    const summaryDiv = document.getElementById('summaryDiv');
    if (summaryDiv) {
      const summaryContent = summaryDiv.querySelector('#summaryContent');
      console.log(summaryContent);
      sendResponse(summaryContent.textContent);
    } else {
      sendResponse(null);
    }
  } else if (request.action === 'getSummaryTopic') {
    sendResponse({ value: document.getElementsByClassName('summary-topic')[0]?.innerHTML });
  }
  // else if (request.action === 'summarizeWebpage') {
  //   const webpageText = document.body.innerText;
  //   const apiKey = 'REDACTED_OPENAI_API_KEY'; // Replace this with your GPT-4 API key
  //   const prompt = `${document.URL} \n summarize this webpage to 50 words`;
  //   const summary = await generateSummary(apiKey, prompt);
  //   displaySummary(summary);
  // }
  console.log('RETURN');
  return true; // Required for async sendResponse
});

async function autoSummarize() {
  const apiKey = 'REDACTED_OPENAI_API_KEY'; // Replace this with your GPT-4 API key
  const summaryLength = 'medium'; // You can set a default summary length for auto-summarize mode
  const summary = await generateSummary(apiKey, document.body.innerText, summaryLength);
  alert(`Auto-summarized content:\n\n${summary}`);
}

chrome.storage.sync.get('autoSummarize', (data) => {
  if (data.autoSummarize) {
    autoSummarize();
  }
});

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
