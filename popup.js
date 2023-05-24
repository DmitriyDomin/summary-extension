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

const saveButton = document.getElementById('saveButton');
saveButton.addEventListener('click', async () => {
  if (saveButton.disabled) return;
  document.getElementById('loadingContentIcon').classList.add('active');
  saveButton.disabled = true;
  const activeTab = await new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
  );

  const summary = await chrome.tabs.sendMessage(activeTab.id, { action: 'getSummary' });
  const tags = document.getElementById('tags').value.split(',').map(tag => tag.trim());

  if (summary) {
    const savedSummary = { summary, tags, timestamp: new Date().toISOString() };
    console.log(savedSummary);
    chrome.storage.local.get('savedSummaries', (data) => {
      const savedSummaries = data.savedSummaries || [];
      if (savedSummaries.some(summary => summary.tags.sort().toString() === tags.sort().toString())) {
        console.log(tags.sort().toString());
        document.getElementById('saveButtonError').classList.add('show');
        document.getElementById('loadingContentIcon').classList.remove('active');
        return;
      }
      savedSummaries.push(savedSummary);
      chrome.storage.local.set({ savedSummaries }, () => {
        document.getElementById('loadingContentIcon').classList.remove('active');
        document.getElementById('savedContentIcon').classList.add('active');
        setTimeout(() => {
          document.getElementById('savedContentIcon').classList.remove('active');
        }, 2000);
      });
    });
  }
});

// Function to display saved summaries
function displaySavedSummaries(savedSummaries) {
  const savedSummariesContainer = document.getElementById('savedSummaries');
  savedSummariesContainer.innerHTML = '';

  savedSummaries.forEach((savedSummary, index) => {
    const summaryElement = document.createElement('div');
    summaryElement.classList.add('summary');
    summaryElement.innerHTML = `
        <div class="summary__content">
          <h3 class="summary__tags">${savedSummary.tags.join(', ')}</h3>
          <div class="summary__text">${savedSummary.summary}</div>
        </div>
        <div class="summary__buttons">
          <button class="summary__delete" data-index="${index}">
            <span><i class="fas fa-trash"></i></span>
          </button>
          <button class="summary__copy" data-index="${index}"
            <span><i class="fas fa-copy"></i></span>
          </button>
          <button class="summary__twitter" data-index="${index}"
            <span><i class="fab fa-twitter"></i></span>
          </button>
          <button class="summary__email" data-index="${index}"
            <span><i class="fas fa-envelope"></i></i></span>
          </button>
        </div>
      `;
    savedSummariesContainer.appendChild(summaryElement);
  });

  // Add event listeners for delete buttons
  document.querySelectorAll('.summary__delete').forEach((button) => {
    button.addEventListener('click', (event) => {
      const index = button.getAttribute('data-index');
      savedSummaries.splice(index, 1);
      chrome.storage.local.set({ savedSummaries }, async () => {
        const savedSummaries = (await chrome.storage.local.get('savedSummaries')).savedSummaries || [];
        displaySavedSummaries(savedSummaries);
      });
    });
  });

  document.querySelectorAll('.summary__copy').forEach((button) => {
    button.addEventListener('click', (event) => {
      const index = button.getAttribute('data-index');
      const summary = savedSummaries[index].summary;
      if (summary) {
        navigator.clipboard.writeText(summaryText)
      }
    });
  });

  document.querySelectorAll('.summary__twitter').forEach((button) => {
    button.addEventListener('click', (event) => {
      const index = button.getAttribute('data-index');
      const summary = savedSummaries[index].summary;
      if (summary) {
        shareOnTwitter(summary);
      }
    });
  });

  document.querySelectorAll('.summary__email').forEach((button) => {
    button.addEventListener('click', (event) => {
      const index = button.getAttribute('data-index');
      const summary = savedSummaries[index].summary;
      if (summary) {
        shareViaEmail(summary);
      }
    });
  });
  chrome.storage.local.get('savedSummaries', (data) => {
    const savedSummaries = data.savedSummaries || [];

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
const summarizeWebpageButton = document.getElementById('summarizeWebpageButton');
summarizeWebpageButton.addEventListener('click', async () => {
  if (summarizeWebpageButton.disabled) return;
  summarizeWebpageButton.disabled = true;
  const activeTab = await new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
  );

  chrome.tabs.sendMessage(activeTab.id, { action: 'summarizeWebpage' }, (summary) => {
    summarizeWebpageButton.disabled = false;
  });
});

document.getElementById('instantSummaryTextarea').addEventListener('input', (event) => {
    document.getElementById('instantSummaryButton').disabled = !event.target.value;
  });

const instantSummaryButton = document.getElementById('instantSummaryButton');
instantSummaryButton.addEventListener('click', async () => {
  const text = document.getElementById('instantSummaryTextarea').value;
  if (!text || instantSummaryButton.classList.contains('clicked')) return;
  instantSummaryButton.classList.add('clicked');
  const activeTab = await new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
  );
  chrome.tabs.sendMessage(activeTab.id, { action: 'summarize', text }, (summary) => {
    console.log(summary, 'summary');
    instantSummaryButton.classList.remove('clicked');
  });
});

let summaryInputTimeout;
document.getElementById('summaryInput').addEventListener('input', async (event) => {
  clearTimeout(summaryInputTimeout);
  summaryInputTimeout = setTimeout(async () => {
    const savedSummaries = (await chrome.storage.local.get('savedSummaries')).savedSummaries || [];
    const summariesToShow = savedSummaries.filter((summary) => {
      console.log(event, summary.tags, summary.summary);
      return summary.tags
        .some(tag => tag.toLowerCase().includes(event.target.value.toLowerCase()))
        || summary.summary.toLowerCase().includes(event.target.value.toLowerCase());
    });
    displaySavedSummaries(summariesToShow);
  }, 200);
});

document.getElementById('tags').addEventListener('input', async (event) => {
  document.getElementById('saveButtonError').classList.remove('show');
  document.getElementById('saveButton').disabled = false;
});

document.getElementById('instantSummaryToggle').addEventListener('click',  (event) => {
  if ([...event.target.classList].includes('opened')) {
    event.target.classList.remove('opened');
    event.target.classList.add('closing');
    setTimeout(() => {
      event.target.classList.remove('closing');
      event.target.disabled = true;
      event.target.classList.add('closed');
    }, 500);
  } else {
    event.target.classList.toggle('opened');
    event.target.classList.toggle('closed');
  }
});

function prepareMenuItems() {
  const menuItems = [...document.getElementsByClassName('menu__item')];
  menuItems.forEach((menuItem) => {
    menuItem.addEventListener('click', (event) => {
      if (event.target.classList.contains('active')) return;
      setActivePage(event.target, menuItems);
    });
  });
}

async function setActivePage(targetPage, menuItems) {
  menuItems.forEach((menuItem) => {
    menuItem.classList.remove('active');
  });
  const homePage = document.getElementById('homePage');
  const summariesPage = document.getElementById('summariesPage');
  if (targetPage.id === 'menuHome') {
    homePage.classList.add('active-page');
    summariesPage.classList.remove('active-page');
  } else if (targetPage.id === 'menuSummaries') {
    const savedSummaries = (await chrome.storage.local.get('savedSummaries')).savedSummaries || [];
    displaySavedSummaries(savedSummaries);
    summariesPage.classList.add('active-page');
    homePage.classList.remove('active-page');
  }
    targetPage.classList.add('active');
}

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

function enableSaveButton() {
  const saveButton = document.getElementById("saveButton");
  saveButton.disabled = false;
  saveButton.classList.add('active');
  setTimeout(() => {
    saveButton.classList.remove('active');
  }, 1400);
}

async function onPopupAdded() {
  //displaySavedSummaries();
  prepareMenuItems();
  const userLanguage = (await chrome.storage.local.get(USER_LANGUAGE))[USER_LANGUAGE];
  const targetLanguage = (await chrome.storage.local.get(TARGET_LANGUAGE))[TARGET_LANGUAGE];
  const { textLength } = (await chrome.storage.local.get('textLength'));
  console.log(textLength, (await chrome.storage.local.get('textLength')));
  console.log(userLanguage, document.getElementById(USER_LANGUAGE).value);
  await updateUIWithLanguage(userLanguage);
  const activeTab = await new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
  );
  chrome.tabs.sendMessage(activeTab.id, { action: 'getSummaryTopic', key: 'summaryTopic' }, response => {
    if (response?.value) {
      document.getElementById("tags").value = response.value;
      document.getElementById('saveButtonError').classList.remove('show');
      enableSaveButton();
    }
  });
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(request);
    if (request.action === "updatePopup" && request.data) {
      document.getElementById("tags").value = request.data;
      document.getElementById('saveButtonError').classList.remove('show');
      enableSaveButton();
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
  loadSummaries();
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

async function loadSummaries() {
  const summaries = await chrome.storage.local.get('savedSummaries');
  console.log(summaries);
}
