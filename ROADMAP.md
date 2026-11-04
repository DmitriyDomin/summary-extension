# Roadmap

Planned work, roughly in priority order.

## Now
- [x] Replace `chrome.storage.local` with IndexedDB so the library is no longer capped at about 10 videos (one-time automatic migration)
- [x] Search saved videos, lectures and pages by keyword and by meaning (hybrid BM25 + embeddings, no vector database needed)
- [ ] Load-test the extension end to end on current YouTube and Udemy pages and fix selector breakage
- [ ] Move all LLM calls into one provider-agnostic layer (`api-service.js` and the Gemini path in `background.js` currently overlap)
- [ ] Split the very large `udemy-content.js`, `youtube-content.js` and `quiz-manager.js` into smaller modules
- [ ] Unit tests for prompt building and transcript parsing
- Fix it for Udemy

## Next
- [ ] "Ask my library": answer questions from the top search passages, with citations and timestamp links
- [ ] Export and import the library as a JSON file (backup, move between browsers)
- [ ] Show storage used per video and let users delete transcripts but keep summaries
- [ ] Streaming summaries in the side panel
- [ ] Remove the third-party CDN dependency by bundling the icon and font CSS
- [ ] Export summaries as Markdown
- [ ] Better error messages for invalid or rate-limited API keys

## Later
- [ ] Support more sources (Coursera, generic PDF pages)
- [ ] Local models through an OpenAI-compatible endpoint
- [ ] Publish to the Chrome Web Store

Suggestions are welcome as issues.
