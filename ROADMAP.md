# Roadmap

Planned work, roughly in priority order.

## Now
- [ ] Load-test the extension end to end on current YouTube and Udemy pages and fix selector breakage
- [ ] Move all LLM calls into one provider-agnostic layer (`api-service.js` and the Gemini path in `background.js` currently overlap)
- [ ] Split the very large `udemy-content.js`, `youtube-content.js` and `quiz-manager.js` into smaller modules
- [ ] Unit tests for prompt building and transcript parsing

## Next
- [ ] Streaming summaries in the side panel
- [ ] Remove the third-party CDN dependency by bundling the icon and font CSS
- [ ] Export summaries as Markdown
- [ ] Better error messages for invalid or rate-limited API keys

## Later
- [ ] Support more sources (Coursera, generic PDF pages)
- [ ] Local models through an OpenAI-compatible endpoint
- [ ] Publish to the Chrome Web Store

Suggestions are welcome as issues.
