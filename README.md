# Content Summarizer

A Chrome extension (Manifest V3) that summarizes web pages, YouTube videos and Udemy lectures with an LLM, in a side panel.

## Features

- Summaries of any web page, YouTube video (including live chat) and Udemy lecture
- Selectable summary length and output language (EN, DE, ES, FR, IT, PT, RU, UA)
- A saved library of videos, Udemy lectures and page summaries, with no cap on how many you keep
- Search across everything you saved by keywords and, with an API key, by meaning (finds "baking" when the video says "pastry")
- Quiz generation from the summarized content
- Optional export of Udemy lecture notes to Notion through your own n8n webhook

## Install (development)

1. Clone the repository.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked** and select this folder.
3. Click the extension icon to open the side panel and open the settings.
4. Enter your own OpenAI and/or Google AI API key and save.

## Privacy and keys

- The extension ships with **no API keys**. Keys you enter are stored only in `chrome.storage.local` on your machine.
- Saved videos, lectures, summaries and the search index live in your browser's IndexedDB, on your machine. Nothing is uploaded to a server run by this project.
- Keyword search runs entirely locally. If you add an OpenAI or Google key, text chunks of what you save are also sent to that provider's embeddings API so search can match by meaning. Remove the key and search stays local.
- Page text, video transcripts and prompts are sent directly from your browser to the provider you selected (OpenAI or Google). Nothing goes to a server operated by this project.
- The Notion export is off by default. It posts to the n8n webhook URL you enter in Settings (stored as `n8nEndpoint` in `chrome.storage.local`).
- The side panel loads icon and font stylesheets from public CDNs (cdnjs), which sees only a normal asset request.

## Project layout

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest |
| `background.js` | Service worker, side panel and Gemini requests |
| `popup.html` / `popup.js` | Side panel UI and settings |
| `api-service.js` | OpenAI and Google AI client |
| `youtube-content.js`, `youtube-live-summary.js`, `live-chat-manager.js` | YouTube integration |
| `udemy-content.js`, `n8n-integration.js` | Udemy integration and optional Notion export |
| `quiz-manager.js` | Quiz generation |
| `library-store.js` | IndexedDB storage for saved videos, summaries and chat sessions (proxied through the service worker for content scripts) |
| `library-search.js` | Chunking, BM25 keyword search, embeddings and hybrid ranking |
| `library-search-ui.js` | Search box and results on the Saved page |
| `test/` | Unit tests (`npm test`) |
| `_locales/` | Translations |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [roadmap](ROADMAP.md). Run `npm test` before opening a pull request.

## License

[MIT](LICENSE)
