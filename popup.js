// document.getElementById('summarizeButton').addEventListener('click', () => {
//   chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//     chrome.tabs.sendMessage(tabs[0].id, { action: 'summarizeEntirePage' }, (response) => {
//       document.getElementById('summary').textContent = response.summary;
//     });
//   });
// });
//
// chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
//   if (request.action === 'summarizeEntirePage') {
//     const apiKey = 'your_api_key_here'; // Replace this with your GPT-4 API key
//     const summary = await generateSummary(apiKey, document.body.innerText);
//     sendResponse({ summary });
//   }
//   return true; // Required for async sendResponse
// });
//
addEventListener("load", (event) => {

});

// document.getElementById('summarizeButton').addEventListener('click', () => {
//   const summaryLength = document.getElementById('summaryLength').value;
//   chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//     chrome.tabs.sendMessage(tabs[0].id, { action: 'summarizeEntirePage', summaryLength }, (response) => {
//       document.getElementById('summary').textContent = response?.summary;
//     });
//   });
// });

const USER_LANGUAGE = 'userLanguage';
const TARGET_LANGUAGE = 'targetLanguage';


document.getElementById('saveButton').addEventListener('click', async () => {
  const activeTab = await new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
  );

  const summary = await chrome.tabs.sendMessage(activeTab.id, { action: 'getSummary' });
  const tags = document.getElementById('tags').value.split(',').map(tag => tag.trim());

  if (summary) {
    const savedSummary = { summary, tags, timestamp: new Date().toISOString() };

    chrome.storage.local.get('savedSummaries', (data) => {
      const savedSummaries = data.savedSummaries || [];
      savedSummaries.push(savedSummary);
      chrome.storage.local.set({ savedSummaries }, () => {
        displaySavedSummaries();
      });
    });
  }
});

// Function to display saved summaries
function displaySavedSummaries() {
  chrome.storage.local.get('savedSummaries', (data) => {
    const savedSummaries = data.savedSummaries || [];
    const savedSummariesContainer = document.getElementById('savedSummaries');
    savedSummariesContainer.innerHTML = '';

    savedSummaries.forEach((savedSummary, index) => {
      const summaryElement = document.createElement('div');
      summaryElement.classList.add('saved-summary');
      summaryElement.innerHTML = `
        <div class="summary-text">${savedSummary.summary}</div>
        <div class="summary-tags">${savedSummary.tags.join(', ')}</div>
        <button class="delete-button" data-index="${index}">Delete</button>
      `;
      savedSummariesContainer.appendChild(summaryElement);
    });

    // Add event listeners for delete buttons
    document.querySelectorAll('.delete-button').forEach((button) => {
      button.addEventListener('click', (event) => {
        const index = event.target.getAttribute('data-index');
        savedSummaries.splice(index, 1);
        chrome.storage.local.set({ savedSummaries }, () => {
          displaySavedSummaries();
        });
      });
    });
  });
}

// Initialize saved summaries display
// document.addEventListener('DOMContentLoaded', () => {
//   displaySavedSummaries();
// });

document.getElementById(TARGET_LANGUAGE).addEventListener('change', (event) => {
  console.log(event.target.value);
  chrome.storage.local.set({ [TARGET_LANGUAGE]: event.target.value });
})

function shareViaEmail(summary) {
  const subject = encodeURIComponent('Check out this summary');
  const body = encodeURIComponent(summary);
  const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;
  window.open(mailtoUrl, '_blank');
}

function shareOnTwitter(summary) {
  const text = encodeURIComponent(summary);
  const twitterUrl = `https://twitter.com/intent/tweet?text=${text}`;
  window.open(twitterUrl, '_blank');
}

document.getElementById('shareEmail').addEventListener('click', async () => {
  const activeTab = await new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
  );
  const summary = await chrome.tabs.sendMessage(activeTab.id, { action: 'getSummary' });
  if (summary) {
    shareViaEmail(summary);
  }
});

document.getElementById('shareTwitter').addEventListener('click', async () => {
  const activeTab = await new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
  );
  const summary = await chrome.tabs.sendMessage(activeTab.id, { action: 'getSummary' });
  if (summary) {
    shareOnTwitter(summary);
  }
});


document.getElementById('summaryLength').addEventListener('change', () => {
  const summaryLength = document.getElementById('summaryLength').value;
  chrome.storage.local.set({ textLength: summaryLength });
});

// document.getElementById('autoSummarize').addEventListener('change', (event) => {
//   const autoSummarize = event.target.checked;
//   chrome.storage.sync.set({ autoSummarize });
// });
//
// document.addEventListener('DOMContentLoaded', () => {
//   chrome.storage.sync.get('autoSummarize', (data) => {
//     document.getElementById('autoSummarize').checked = data.autoSummarize || false;
//   });
//   chrome.storage.sync.get(TARGET_LANGUAGE, (data) => {
//     console.log(data)
//     document.getElementById(TARGET_LANGUAGE).value = data[TARGET_LANGUAGE];
//   });
// });

// document.getElementById('summarizeButton').addEventListener('click', () => {
//   const summaryLength = document.getElementById('summaryLength').value;
//   const language = document.getElementById('language').value;
//   chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//     chrome.tabs.sendMessage(tabs[0].id, { action: 'summarizeEntirePage', summaryLength, language }, (response) => {
//       document.getElementById('summary').textContent = response?.summary;
//     });
//   });
// });

document.getElementById('summarizeWebpageButton').addEventListener('click', async () => {
  const activeTab = await new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
  );

  chrome.tabs.sendMessage(activeTab.id, { action: 'summarizeWebpage' }, (summary) => {
    document.getElementById('summaryContainer').textContent = summary;
  });
});

document.getElementById('instantSummaryButton').addEventListener('click', async () => {
  const text = document.getElementById('instantSummaryTextarea').value;
  const activeTab = await new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
  );
  chrome.tabs.sendMessage(activeTab.id, { action: 'summarize', text }, (summary) => {
    //document.getElementById('summaryContainer').textContent = summary;
  });
});

document.getElementById('instantSummaryToggle').addEventListener('click',  (event) => {
  if ([...event.target.classList].includes('opened')) {
    event.target.classList.remove('opened');
    event.target.classList.add('closing');
    setTimeout(() => {
      event.target.classList.remove('closing');
      event.target.disabled = true;
      event.target.classList.add('closed');
    }, 490);
  } else {
    event.target.classList.toggle('opened');
    event.target.classList.toggle('closed');
  }

});


function setLocalizedTextContent(elementId, messageName) {
  const element = document.getElementById(elementId);
  if (element) {
    const message = chrome.i18n.getMessage(messageName);
    console.log(message);
    if (message) {
      element.textContent = message;
    }
  }
}

// function updateUIWithLanguage(language) {
//   console.log(12456);
//   // Update the UI elements with the localized messages
//   document.querySelector('html').setAttribute('lang', language);
//   document.title = chrome.i18n.getMessage('extensionName');
//   document.getElementById('summarizeWebpageButton').textContent = chrome.i18n.getMessage('summarizeWebpageButton');
//   document.getElementById('showSummaryButton').textContent = chrome.i18n.getMessage('showSummaryButton');
// }

// function updateUIWithLocalizedMessages() {
//   setLocalizedTextContent('summarizeWebpageButton', 'summarizeWebpageButton');
//   setLocalizedTextContent('summarizeHeader', 'extensionName');
// }
//
// document.addEventListener('DOMContentLoaded', () => {
//   updateUIWithLocalizedMessages();
// });

// document.getElementById(USER_LANGUAGE).addEventListener('change', (event) => {
//   console.log(136787);
//   const selectedLanguage = event.target.value;
//   console.log({ [USER_LANGUAGE]: selectedLanguage });
//   chrome.storage.local.set({ [USER_LANGUAGE]: selectedLanguage });
//   //document.querySelector('html').setAttribute('lang', selectedLanguage);
//   updateUIWithLanguage(selectedLanguage);
//   chrome.storage.local.get(USER_LANGUAGE).then(lang => {
//     console.log(lang);
//   })
//
// });

async function updateUIWithLanguage(language = 'en') {
  // Load the messages.json file for the selected language
  const messagesUrl = chrome.runtime.getURL(`_locales/${language}/messages.json`);
  const response = await fetch(messagesUrl);
  const messages = await response.json();
  if (!messages) {
    return;
  }
  // Update the UI elements with the localized messages
  document.querySelector('html').setAttribute('lang', language);
  document.title = messages.extensionName.message;
  for (const key in messages) {
    const message = messages[key].message;
    const elements = document.querySelectorAll(`[data-i18n="${key}"]`);

    // Update the elements with the corresponding data-i18n attribute
    elements.forEach((element) => {
      console.log('element.placeholder', element.placeholder);
      if (element.placeholder) {
        element.placeholder = message;
      }
      element.textContent = message;
    });
  }
  //const tagsInput = document.querySelectorAll(`[data-i18n="${tags}"]`);

}

async function onPopupAdded() {
  displaySavedSummaries();
  const userLanguage = (await chrome.storage.local.get(USER_LANGUAGE))[USER_LANGUAGE];
  const targetLanguage = (await chrome.storage.local.get(TARGET_LANGUAGE))[TARGET_LANGUAGE];
  const { textLength } = (await chrome.storage.local.get('textLength'));
  console.log(textLength, (await chrome.storage.local.get('textLength')));
  console.log(userLanguage, document.getElementById(USER_LANGUAGE).value);
  await updateUIWithLanguage(userLanguage);
  chrome.runtime.sendMessage({ action: 'getSummaryTopic', key: 'summaryTopic' }, response => {
    console.log('response', response.value);
    if (response.value) {
      document.getElementById("tags").value = response.value;
    }
  });
  if (userLanguage) {
    document.getElementById(USER_LANGUAGE).value = userLanguage;
    console.log(document.getElementById(USER_LANGUAGE).value, 'value')
  }
  if (targetLanguage) {
    document.getElementById(TARGET_LANGUAGE).value = targetLanguage;
  }
  if (textLength) {
    document.getElementById('summaryLength').value = textLength;
  }
  document.dispatchEvent(new CustomEvent('popupLoaded'));
}

(async () => {
  await onPopupAdded();
})()
// document.addEventListener('DOMContentLoaded', async () => {
//   // Get the saved language from the storage
//   displaySavedSummaries();
//   const userLanguage = (await chrome.storage.local.get(USER_LANGUAGE))[USER_LANGUAGE];
//   const targetLanguage = (await chrome.storage.local.get(TARGET_LANGUAGE))[TARGET_LANGUAGE];
//   const { textLength } = (await chrome.storage.local.get('textLength'));
//   console.log(textLength, (await chrome.storage.local.get('textLength')));
//   updateUIWithLanguage(userLanguage);
//   if (userLanguage) {
//     document.getElementById(USER_LANGUAGE).value = userLanguage;
//   }
//   if (targetLanguage) {
//     document.getElementById(TARGET_LANGUAGE).value = targetLanguage;
//   }
//   if (textLength) {
//     document.getElementById('summaryLength').value = textLength;
//   }
//   chrome.runtime.sendMessage({ action: 'getSummaryTopic', key: 'summaryTopic' }, response => {
//     if (response.value) {
//       document.getElementById("tags").value = response.value;
//     }
//   });
//   chrome.runtime.sendMessage({ action: 'loadCustomSelect' });
// });
//
//
// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   if (request.action === "updateTags") {
//     console.log(request.data, 'RRRRR');
//     if (request.data) {
//       document.getElementById("tags").value = request.data;
//     }
//   }
// });
