import {updateWordCount} from "../api/firebase";
import {calculateTokenNumber} from "../helpers/helpers";
import {lengthMap, TARGET_LANGUAGE, textLimit} from "../helpers/constants";
import {getTranslation} from "../helpers/i18n";
import { generateSummary } from "../api/gpt";

const contextLengthExceeded = 'context_length_exceeded'

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  importStyles();
  if (request.action === 'summarize' || request.action === 'summarizeWebpage') {
    return await summarize(request, sendResponse);
  } else if (request.action === 'getSummary') {
    getSummary(sendResponse);
  } else if (request.action === 'getSummaryTopic') {
    sendResponse({ value: document.getElementsByClassName('summary-topic')[0]?.innerHTML });
  } else if (request.action === 'showLimitExceededAlert') {
    await displayLimitExceeded('trialLimitExceeded');
    sendResponse();
  }
  return true; // Required for async sendResponse
});

async function summarize(request, sendResponse) {
  const numberOfWords = calculateTokenNumber(request.text);
  if (calculateTokenNumber(request.text) > textLimit) {
    await displayLimitExceeded(await getTranslation('textLimitExceeded') + numberOfWords);
    return;
  } else if (numberOfWords > textLimit / 2) {
    await sendTwoSummaryRequests(request.text, sendResponse);
    return;
  }
  chrome.storage.local.get(TARGET_LANGUAGE).then((res) => {
    const targetLanguage = res[TARGET_LANGUAGE];
    chrome.storage.local.get('textLength').then((result) => {
      const length = lengthMap[result.textLength] || lengthMap.short;
      const prompt = createPromptForIndividualRequest(request, length);
      displayLoading();
      sendGenerateSummaryRequest(prompt, request.text, targetLanguage, sendResponse);
    });
  });
  return true;
}

function createPromptForIndividualRequest(request, textLength) {
  return request.action === 'summarize'
    ? `summarize the following text to ${textLength} words, mandatory: give it a title in (), like (title) and the original language in [] like [Language], the test ${request.text} \n`
    : `${document.URL} \n summarize this webpage to ${textLength} words, mandatory: give it a title in () and the text language in []`;
}

async function sendGenerateSummaryRequest(prompt, text, targetLanguage, sendResponse) {
  generateSummary(prompt).then((summary) => {
    let [updatedSummary, originalLang] = getLanguage(summary);
    if (targetLanguage && originalLang.toLowerCase() !== targetLanguage && targetLanguage !== 'none') {
      const translationPrompt = `${updatedSummary} \n translate it to ${targetLanguage} including the text in ()`;
      generateSummary(translationPrompt).then((translatedSummary) => {
        updatedSummary = translatedSummary;
        updateWordCount(text);
        showSummary(updatedSummary, sendResponse);
      });
    } else {
      updateWordCount(text);
      showSummary(updatedSummary, sendResponse);
    }
  }, async (error) => {
    hideLoading();
    await handleGptRequestErrors(error, sendResponse);
  });
}

async function handleGptRequestErrors(error, sendResponse) {
  if (error.message === contextLengthExceeded) {
    await displayLimitExceeded(await getTranslation('gptLimitExceeded'));
    sendResponse();
  } else {
    await displayLimitExceeded(await getTranslation('gptError'));
    sendResponse();
  }
}

function getSummary(sendResponse) {
  const summaryDiv = document.getElementById('summaryDiv');
  if (summaryDiv) {
    const summaryContent = summaryDiv.querySelector('#summaryContent');
    sendResponse(summaryContent.textContent);
  } else {
    sendResponse(null);
  }
}

async function sendTwoSummaryRequests(text, sendResponse) {
  const [promptOne, promptTwo] = divedTextIntoTwoParts(text);
 try {
    displayLoading();
    const result = await Promise.all([generateSummary(promptOne), generateSummary(promptTwo)]);
    let [updatedSummary, originalLang] = getLanguage(result[0]);
    const targetLanguage = (await chrome.storage.local.get(TARGET_LANGUAGE) || {})[TARGET_LANGUAGE];
    if (targetLanguage && originalLang.toLowerCase() !== targetLanguage && targetLanguage !== 'none') {
      await setUniteTranslationRequest(updatedSummary, result, targetLanguage, sendResponse);
    } else {
      await sendUniteRequest(updatedSummary, result, targetLanguage, sendResponse);
    }
  } catch (error) {
   hideLoading();
   await handleGptRequestErrors(error, sendResponse);
  }
}

async function setUniteTranslationRequest(summary, result, targetLanguage, sendResponse) {
  const translationPrompt =
    `Unite these two summaries and translate it to ${targetLanguage} and give it a title "(Title)", 
    remove text in the original language, result must be in ${targetLanguage}!!! Text: "${summary}, ${result[1]}" `;
  const updatedSummary = await generateSummary(translationPrompt);
  await updateWordCount(result[0] + result[1]);
  showSummary(updatedSummary, sendResponse);
}

async function sendUniteRequest(summary, result, targetLanguage, sendResponse) {
  const translationPrompt =
    `Unite these two summaries and give it a title "(Title)", 
    Text: "${updatedSummary}, ${result[1]}" `;
  const updatedSummary = await generateSummary(translationPrompt);
  await updateWordCount(result[0] + result[1]);
  showSummary(updatedSummary, sendResponse);
}
async function divedTextIntoTwoParts(text) {
  const lengthObj = await chrome.storage.local.get('textLength');
  const length = lengthObj ? lengthMap[lengthObj.textLength] : lengthMap.short;
  const sentences = text.split('.');
  const sentencesHalfNumber = Math.floor(sentences.length / 2);

  const firstPart = sentences.splice(0, sentencesHalfNumber).join('.');
  const secondPart = sentences;
  const promptOne =`summarize the following text to ${+(length)/2} words, mandatory: give it a topic it has to be in () like and the original language in [] like [language], the test ${firstPart} \n`;
  const promptTwo =`summarize the following text to ${+(length)/2} words, the test ${secondPart} \n`;
  return [promptOne, promptTwo];
}

function showSummary(updatedSummary, sendResponse) {
  const [summary, topic] = parseText(updatedSummary);
  chrome.runtime.sendMessage({ action: "updateTags", data: topic });
  displaySummary(summary, topic);
  sendResponse(summary);
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
  cssLink.href = chrome.runtime.getURL('content-summary/content-summary.css');
  cssLink.rel = 'stylesheet';
  document.head.appendChild(cssLink);
}

async function displaySummary(summary, topic) {
  const summaryDiv = document.getElementById('summaryDiv');
  const closeButton = createCloseButton(summaryDiv);
  const copyButton = await createCopyButton();
  const summaryTopic = createSummaryTopic(topic);
  const summaryContent = createSummaryContent(summary);

  summaryDiv.innerHTML = '';
  summaryDiv.classList.remove('loading');

  summaryDiv.appendChild(closeButton);
  summaryDiv.appendChild(copyButton);
  summaryDiv.appendChild(summaryTopic);
  summaryDiv.appendChild(summaryContent);
}

function hideLoading() {
  let summaryDiv = document.getElementById('summaryDiv');
  summaryDiv.parentNode.removeChild(summaryDiv);
}

function createCloseButton(summaryDiv) {
  const closeButton = document.createElement('button');
  closeButton.textContent = '+';
  closeButton.classList.add('close-button-SE');
  closeButton.onclick = () => summaryDiv.remove();
  return closeButton;
}

async function createCopyButton() {
  let copyButton = document.createElement('button');
  copyButton.classList.add('copy-button-SE');
  copyButton.textContent = await getTranslation('copy');
  copyButton.addEventListener('click', function() {
    let summaryText = document.getElementById('summaryContent').innerText;
    navigator.clipboard.writeText(summaryText);
  });
  return copyButton;
}

function createSummaryTopic(topic) {
  const summaryTopic = document.createElement('h2');
  summaryTopic.classList.add('summary-topic');
  summaryTopic.textContent = topic;
  return summaryTopic;
}

function createSummaryContent(summary) {
  const summaryContent = document.createElement('div');
  summaryContent.setAttribute('id', 'summaryContent');
  summaryContent.textContent = summary;
  return summaryContent;
}

function parseText(text) {
  const topic = text.match(/\(([^)]+)\)/) ? text.match(/\(([^)]+)\)/)[1] : text.split(/title:|Title:|\n|"/)[1]?.trim();
  const replaceTitle = new RegExp(`\\(${topic}\\)|title: ${topic}|Title: ${topic}|"${topic}"`);

  let newText = text.replace(replaceTitle, '');
  return [newText, topic || 'Topic'];
}

function getLanguage(text) {
  const lang = text.match(/\[(.*?)\]/) ? text.match(/\[(.*?)\]/)[1] : 'English';
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

async function displayLimitExceeded(message) {
  const limitExceeded = createLimitExceededMessage();
  const header = await createLimitHeader();
  const alert = createLimitAlert(message)
  const closeButton = createLimitCloseButton(limitExceeded);
  limitExceeded.appendChild(closeButton);
  limitExceeded.appendChild(header);
  limitExceeded.appendChild(alert);
  document.body.appendChild(limitExceeded);
}

function createLimitExceededMessage() {
  const limitExceeded = document.createElement('div');
  limitExceeded.setAttribute('id', 'limitExceeded');
  limitExceeded.classList.add('summary-container-SE', 'limit-SE');
  return limitExceeded;
}

async function createLimitHeader() {
  const header = document.createElement('h2');
  header.classList.add('header-SE');
  header.innerText = await getTranslation('extensionName');
  return header
}

function createLimitAlert(message) {
  const alert = document.createElement('p');
  alert.innerText = message;
  alert.classList.add('alert-text-SE');
  return alert;
}

function createLimitCloseButton(limitExceeded) {
  const closeButton = document.createElement('button');
  closeButton.textContent = '+';
  closeButton.classList.add('close-button-SE');
  closeButton.onclick = () => limitExceeded.remove();
  return closeButton;
}
