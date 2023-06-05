import {USER_LANGUAGE} from "./constants";

export async function updateUIWithLanguage(language = 'en') {
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
}

export async function getTranslation(key) {
  const language = (await chrome.storage.local.get(USER_LANGUAGE))
    ? (await chrome.storage.local.get(USER_LANGUAGE))[USER_LANGUAGE]
    : 'en';
  const messagesUrl = chrome.runtime.getURL(`_locales/${language}/messages.json`);
  const response = await fetch(messagesUrl);
  const messages = await response.json();
  if (!messages) {
    return;
  }
  return messages[key].message;
}

