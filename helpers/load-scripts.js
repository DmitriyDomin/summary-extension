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
  await loadScript('../dist/customSelect.js');
  await loadScript('../dist/selectHandlers.js');
});
(async () => {
  try {
    await loadScript('../dist/popup.js');
  } catch (error) {
  }
})();
