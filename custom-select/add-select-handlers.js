import {updateUIWithLanguage} from "../helpers/i18n";

const USER_LANGUAGE = 'userLanguage';
const TARGET_LANGUAGE = 'targetLanguage';

document.querySelectorAll('.language-picker .select-items div').forEach((item) => {
  item.addEventListener('click', (event) => {
    const selectedLanguage = event.target.id;
    chrome.storage.local.set({[USER_LANGUAGE]: selectedLanguage});
    updateUIWithLanguage(selectedLanguage);
  });
});

document.querySelectorAll('.target-language .select-items div').forEach((item) => {
  item.addEventListener('click', (event) => {
    console.log(12345);
    const selectedLanguage = event.target.id;
    chrome.storage.local.set({[TARGET_LANGUAGE]: selectedLanguage});
  });
});

document.querySelectorAll('.summary-length .select-items div').forEach((item) => {
  item.addEventListener('click', (event) => {
    const summaryLength = document.getElementById('summaryLength').value;
    chrome.storage.local.set({textLength: summaryLength});
  });
});
