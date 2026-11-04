function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => {
      console.log(`✅ Successfully loaded: ${src}`);
      resolve();
    };
    script.onerror = (error) => {
      console.error(`❌ Failed to load: ${src}`, error);
      reject(error);
    };
    document.body.appendChild(script);
  });
}

(async () => {
  console.log('🚀 Starting script loading sequence...');
  
  try {
    // Load API service first (this is critical for other scripts)
    console.log('📦 Loading API service...');
    await loadScript('api-service.js');

    // Storage layer and search (IndexedDB), needed by every manager below
    await loadScript('library-store.js');
    await loadScript('library-search.js');
    
    // Load core managers next (these create the classes)
    console.log('📦 Loading core managers...');
    await loadScript('summaries-manager.js');
    await loadScript('library-search-ui.js');
    await loadScript('live-chat-manager.js');
    await loadScript('settings-manager.js');
    await loadScript('quiz-manager.js');
    
    // Load YouTube Live Summary class
    console.log('📦 Loading YouTube Live Summary...');
    await loadScript('youtube-live-summary.js');
    
    // Load main popup functionality
    console.log('📦 Loading main popup script...');
    await loadScript('popup.js');

    // Load UI components
    console.log('📦 Loading UI components...');
    await loadScript('custom-select.js');
    await loadScript('add-select-handlers.js');
    
    console.log('🎉 All scripts loaded successfully!');
    
    // Signal that everything is ready
    document.dispatchEvent(new CustomEvent('popupLoaded'));
    
  } catch (error) {
    console.error('💥 Critical error loading scripts:', error);
    
    // Show error to user with more specific guidance
    document.body.innerHTML = `
      <div style="padding: 20px; background: #f44336; color: white; text-align: center; font-family: Arial, sans-serif;">
        <h3>🚨 Extension Loading Error</h3>
        <p><strong>Failed to load:</strong> ${error.message || 'Unknown script'}</p>
        <p>This usually happens when:</p>
        <ul style="text-align: left; margin: 10px 0;">
          <li>The extension was recently updated or reloaded</li>
          <li>There's a conflict with other extensions</li>
          <li>Chrome is running low on memory</li>
        </ul>
        <button onclick="window.location.reload()" style="background: white; color: #f44336; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; margin: 10px; font-weight: bold;">
          🔄 Refresh Extension
        </button>
        <button onclick="chrome.runtime.reload()" style="background: #fff3; color: white; padding: 12px 24px; border: 1px solid white; border-radius: 6px; cursor: pointer; margin: 10px;">
          🔧 Reload Extension
        </button>
      </div>
    `;
  }
})();
