import {checkPaymentStatus, getUser, isLoggedIn, openLoginPage, openPaymentPage, openSignUp} from "../api/extpay";
import {getNumberOfWordsLeft} from "../api/firebase";
import {getTranslation, updateUIWithLanguage} from "../helpers/i18n";
import {TARGET_LANGUAGE, USER_LANGUAGE} from "../helpers/constants";

function addSaveButtonListener() {
  const saveButton = document.getElementById('saveButton');
  saveButton.addEventListener('click', async () => {
    if (saveButton.disabled) return;
    if(!(await checkPaymentStatus())) return;
    document.getElementById('loadingContentIcon').classList.add('active');
    saveButton.disabled = true;
    const activeTab = await new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
    );
    const summary = await chrome.tabs.sendMessage(activeTab.id, { action: 'getSummary' });
    const tags = document.getElementById('tags').value.split(',').map(tag => tag.trim());
    saveSummary(summary, tags);
  });
}

function saveSummary(summary, tags) {
  if (summary) {
    const savedSummary = { summary, tags, timestamp: new Date().toISOString() };
    chrome.storage.local.get('savedSummaries', (data) => {
      const savedSummaries = data.savedSummaries || [];
      if (savedSummaries.some(summary => summary.tags.sort().toString() === tags.sort().toString())) {
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
}

// Function to display saved summaries
async function displaySavedSummaries(savedSummaries) {
  if(!(await checkPaymentStatus())) {
    hideLoader();
    return;
  }
  const savedSummariesContainer = document.getElementById('savedSummaries');
  savedSummariesContainer.innerHTML = '';

  savedSummaries.forEach((savedSummary, index) => {
    const summaryElement = document.createElement('div');
    summaryElement.classList.add('summary');
    summaryElement.innerHTML = getSummaryTemplate(savedSummary, index);
    savedSummariesContainer.appendChild(summaryElement);
  });
  hideLoader();

  addListenersForDeleteButtons(savedSummaries);
  addListenersForCopyButtons(savedSummaries);
  addListenersForTwitterButtons(savedSummaries);
  addListenersForEmailButtons(savedSummaries);
}

function getSummaryTemplate(savedSummary, index) {
  return `<div class="summary__content">
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
  `
}

function addListenersForDeleteButtons(savedSummaries) {
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
}

function addListenersForCopyButtons(savedSummaries) {
  document.querySelectorAll('.summary__copy').forEach((button) => {
    button.addEventListener('click', (event) => {
      const index = button.getAttribute('data-index');
      const summary = savedSummaries[index].summary;
      if (summary) {
        navigator.clipboard.writeText(summary)
      }
    });
  });
}

function addListenersForTwitterButtons(savedSummaries) {
  document.querySelectorAll('.summary__twitter').forEach((button) => {
    button.addEventListener('click', (event) => {
      const index = button.getAttribute('data-index');
      const summary = savedSummaries[index].summary;
      if (summary) {
        shareOnTwitter(summary);
      }
    });
  });
}

function addListenersForEmailButtons(savedSummaries) {
  document.querySelectorAll('.summary__email').forEach((button) => {
    button.addEventListener('click', () => {
      const index = button.getAttribute('data-index');
      const summary = savedSummaries[index].summary;
      if (summary) {
        shareViaEmail(summary);
      }
    });
  });
}

document.getElementById(TARGET_LANGUAGE).addEventListener('change', (event) => {
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

function addListenersForTwitter() {
  document.getElementById('shareEmail').addEventListener('click', async () => {
    if(!(await checkPaymentStatus())) return;
    const activeTab = await new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
    );
    const summary = await chrome.tabs.sendMessage(activeTab.id, { action: 'getSummary' });
    if (summary) {
      shareViaEmail(summary);
    }
  });
}

function addListenersForEmail() {
  document.getElementById('shareTwitter').addEventListener('click', async () => {
    if(!(await checkPaymentStatus())) return;
    const activeTab = await new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
    );
    const summary = await chrome.tabs.sendMessage(activeTab.id, { action: 'getSummary' });
    if (summary) {
      shareOnTwitter(summary);
    }
  });
}

function addListenersForSummarizeWebpageButton() {
  const summarizeWebpageButton = document.getElementById('summarizeWebpageButton');
  summarizeWebpageButton.addEventListener('click', async () => {
    if(!(await checkPaymentStatus())) return;
    if (summarizeWebpageButton.disabled) return;
    summarizeWebpageButton.disabled = true;
    const activeTab = await new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
    );

    chrome.tabs.sendMessage(activeTab.id, { action: 'summarizeWebpage', text: '' }, (summary) => {
      summarizeWebpageButton.disabled = false;
    });
  });
}

function addListenersForAddSummaryButton() {
  document.getElementById('instantSummaryTextarea').addEventListener('input', (event) => {
    document.getElementById('instantSummaryButton').disabled = !event.target.value;
  });

  const instantSummaryButton = document.getElementById('instantSummaryButton');
  instantSummaryButton.addEventListener('click', async () => {
    const text = document.getElementById('instantSummaryTextarea').value;
    if(!(await checkPaymentStatus(text))) return;
    if (!text || instantSummaryButton.classList.contains('clicked')) return;
    instantSummaryButton.classList.add('clicked');
    const activeTab = await new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
    );
    chrome.tabs.sendMessage(activeTab.id, { action: 'summarize', text }, (summary) => {
      instantSummaryButton.classList.remove('clicked');
    });
  });
}

function addListenersForSummaryInput() {
  let summaryInputTimeout;
  document.getElementById('summaryInput').addEventListener('input', async (event) => {
    clearTimeout(summaryInputTimeout);
    summaryInputTimeout = setTimeout(async () => {
      const savedSummaries = (await chrome.storage.local.get('savedSummaries')).savedSummaries || [];
      const summariesToShow = savedSummaries.filter((summary) => {
        return summary.tags
            .some(tag => tag.toLowerCase().includes(event.target.value.toLowerCase()))
          || summary.summary.toLowerCase().includes(event.target.value.toLowerCase());
      });
      displaySavedSummaries(summariesToShow);
    }, 200);
  });
}

function addListenersForTags() {
  document.getElementById('tags').addEventListener('input', async (event) => {
    document.getElementById('saveButtonError').classList.remove('show');
    document.getElementById('saveButton').disabled = false;
  });
}

function addListenersForSummaryTopics() {
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
}

function prepareMenuItems() {
  const menuItems = [...document.getElementsByClassName('menu__item')];
  menuItems.forEach((menuItem) => {
    menuItem.addEventListener('click', (event) => {
      if (event.target.classList.contains('active')) return;
      setActivePage(event.target, menuItems);
    });
  });
}

function removeActiveClass() {
  [...document.getElementsByClassName('page')].forEach((menu) => {
    console.log(menu);
    menu.classList.remove('active-page');
  })
}

async function setActivePage(targetPage, menuItems) {
  menuItems.forEach((menuItem) => {
    menuItem.classList.remove('active');
  });
  const homePage = document.getElementById('homePage');
  const summariesPage = document.getElementById('summariesPage');
  const profilePage = document.getElementById('profilePage');
  if (targetPage.id === 'menuHome') {
    activateHomePage(homePage);
  } else if (targetPage.id === 'menuSummaries') {
    activateSummaryPage(summariesPage);
  } else if (targetPage.id === 'profile') {
    activateProfilePage(profilePage);
  }
    targetPage.classList.add('active');
}

function activateHomePage(homePage) {
  showLoader();
  removeActiveClass();
  homePage.classList.add('active-page');
  hideLoader();
}

async function activateSummaryPage(summariesPage) {
  showLoader();
  const savedSummaries = (await chrome.storage.local.get('savedSummaries')).savedSummaries || [];
  displaySavedSummaries(savedSummaries);
  removeActiveClass();
  summariesPage.classList.add('active-page');
}

async function activateProfilePage(profilePage) {
  if (await isLoggedIn()) {
    removeActiveClass();
    profilePage.classList.add('active-page');
    displayProfilePage();
  } else {
    openSignUp();
  }
}

function enableShareButtons() {
  [...document.getElementsByClassName('share__button')].forEach(button => {
    button.disabled = false;
  })
}

function enableSaveButton() {
  const saveButton = document.getElementById("saveButton");
  saveButton.disabled = false;
  saveButton.classList.add('active');
  setTimeout(() => {
    saveButton.classList.remove('active');
  }, 1400);
}

function enableTagsInput() {
  const saveButton = document.getElementById("tags");
  saveButton.disabled = false;
}

async function onPopupAdded() {
  showLoader();
  addDOMListeners();
  prepareMenuItems();
  await checkPaymentStatus();
  const userLanguage = (await chrome.storage.local.get(USER_LANGUAGE))[USER_LANGUAGE];
  const targetLanguage = (await chrome.storage.local.get(TARGET_LANGUAGE))[TARGET_LANGUAGE];
  const { textLength } = (await chrome.storage.local.get('textLength'));
  await updateUIWithLanguage(userLanguage);
  const activeTab = await new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab))
  );
  getSummaryTopic(activeTab);
  listenToUpdatePopup();
  applySavedValues(userLanguage, targetLanguage, textLength);
  hideLoader();
  document.dispatchEvent(new CustomEvent('popupLoaded'));
}

function getSummaryTopic(activeTab) {
  chrome.tabs.sendMessage(activeTab.id, { action: 'getSummaryTopic', key: 'summaryTopic' }, response => {
    if (response?.value) {
      document.getElementById("tags").value = response.value;
      document.getElementById('saveButtonError').classList.remove('show');
      enableSaveButton();
      enableShareButtons();
      enableTagsInput();
    }
  });
}

function applySavedValues(userLanguage, targetLanguage, textLength) {
  if (userLanguage) {
    document.getElementById(USER_LANGUAGE).value = userLanguage;
  }
  if (targetLanguage) {
    document.getElementById(TARGET_LANGUAGE).value = targetLanguage;
  }
  if (textLength) {
    document.getElementById('summaryLength').value = textLength;
  }
}

function listenToUpdatePopup() {
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "updatePopup" && request.data) {
      document.getElementById("tags").value = request.data;
      document.getElementById('saveButtonError').classList.remove('show');
      enableSaveButton();
      enableShareButtons();
      enableTagsInput();
    }
  });
}

function addDOMListeners() {
  addSaveButtonListener();
  addListenersForAddSummaryButton();
  addListenersForSummarizeWebpageButton();
  addListenersForSummaryInput();
  addListenersForTwitter();
  addListenersForEmail();
  addListenersForTags();
  addListenersForSummaryTopics();
}

(async () => {
  await onPopupAdded();
})()

async function displayProfilePage() {
  showLoader();
  const user = await getUser();
  const userEmailText = await getTranslation(('userEmailText'));
  document.getElementById('profileEmail').textContent = userEmailText + user.email;
  if (!user.paid) {
    const freeTrialText = await getTranslation('freeTrialWordsLeft');
    document.getElementById('profileInfo').textContent = freeTrialText + (await getNumberOfWordsLeft(user));
  } else {
    const payDate = new Date(user.paidAt);
    const newPayDate = new Date(payDate.setMonth(payDate.getMonth() + 1));
    const subscriptionText = await getTranslation('activeUntil');
    document.getElementById('profileInfo').textContent = subscriptionText + newPayDate.toISOString().split('T')[0];
  }
  hideLoader();
}

document.getElementById('profileSubscription').addEventListener('click', async () => {
  await openPaymentPage();
});

function showLoader() {
  document.getElementById('loader').classList.remove('hidden');
}

function hideLoader() {
  const loader = document.getElementById('loader');
  loader.classList.add('closing');
  setTimeout(() => {
    loader.classList.remove('closing');
    loader.classList.add('hidden');
  }, 450)
}
