// Google AI SDK Loader
(function() {
  // Check if SDK is already loaded
  if (typeof GoogleGenerativeAI !== 'undefined') {
    console.log('Google AI SDK already loaded');
    return;
  }

  // Load SDK from CDN
  const sdkUrl = 'https://cdn.jsdelivr.net/npm/@google/generative-ai@0.1.3/dist/index.min.js';
  
  const script = document.createElement('script');
  script.src = sdkUrl;
  script.async = true;
  script.onload = () => {
    console.log('Google AI SDK loaded successfully');
    // Dispatch event to notify that SDK is loaded
    document.dispatchEvent(new CustomEvent('googleai_sdk_loaded'));
  };
  script.onerror = (error) => {
    console.error('Failed to load Google AI SDK:', error);
  };
  
  // Append to head or body, whichever is available
  (document.head || document.body).appendChild(script);
})();