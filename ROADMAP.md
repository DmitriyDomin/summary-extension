# Roadmap

Planned work, roughly in priority order.

## Now
- [x] Replace `chrome.storage.local` with IndexedDB so the library is no longer capped at about 10 videos (one-time automatic migration)
- [x] Search saved videos, lectures and pages by keyword and by meaning (hybrid BM25 + embeddings, no vector database needed)
- [x] Load-test on current YouTube pages and fix breakage (timestamped transcripts now work with the current transcript panel, page summaries work again on ordinary sites)
- [ ] Load-test on Udemy lecture pages (needs a logged-in course)
- [ ] Move all LLM calls into one provider-agnostic layer (Udemy now goes through `api-service.js`; YouTube chat and the Gemini path in `background.js` still overlap)
- [ ] Split the very large `udemy-content.js`, `youtube-content.js` and `quiz-manager.js` into smaller modules
- [x] Unit tests for prompt building and transcript parsing
- Fix it for Udemy
- [ ] Caption files from YouTube now often need a proof-of-origin token, so the extension reads the transcript panel instead. Fetch captions directly again if that stops being required

## Next
- [ ] "Ask my library": answer questions from the top search passages, with citations and timestamp links
- [x] Export and import the library as a JSON file (backup, move between browsers)
- [x] Show storage used per video and let users delete transcripts but keep summaries
- [ ] Streaming summaries in the side panel
- [ ] Remove the third-party CDN dependency by bundling the icon and font CSS
- [x] Export summaries as Markdown
- [x] Better error messages for invalid or rate-limited API keys

## Later
- [ ] Support more sources (Coursera, generic PDF pages)
- [ ] Local models through an OpenAI-compatible endpoint
- [ ] Publish to the Chrome Web Store

Suggestions are welcome as issues.
