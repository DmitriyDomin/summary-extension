function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

document.addEventListener('popupLoaded', async () => {
  await loadScript('custom-select.js');
  await loadScript('add-select-handlers.js');
});
(async () => {
  try {
    await loadScript('popup.js');
    console.log('Script 1 loaded and executed.');

    // await loadScript('custom-select.js');
    // console.log('Script 2 loaded and executed.');
    //
    // await loadScript('add-select-handlers.js');
    // console.log('Popup script loaded and executed.');
  } catch (error) {
    console.error('Error loading script:', error);
  }
})();
