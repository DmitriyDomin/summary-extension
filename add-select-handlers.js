document.querySelectorAll('.language-picker .select-items div').forEach((item) => {
  item.addEventListener('click', (event) => {
    const selectedLanguage = event.target.id;
    chrome.storage.local.set({[USER_LANGUAGE]: selectedLanguage});
    //document.querySelector('html').setAttribute('lang', selectedLanguage);
    updateUIWithLanguage(selectedLanguage);
    chrome.storage.local.get(USER_LANGUAGE).then(lang => {
      console.log(lang);
    })
    console.log('Selected language:', selectedLanguage);
  });
});
