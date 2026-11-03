# Content Summarizer

A Chrome extension (Manifest V3) that summarizes web pages, YouTube videos and Udemy lectures with an LLM, in a side panel.

## Features

- Summaries of any web page, YouTube video (including live chat) and Udemy lecture
- Selectable summary length and output language (EN, DE, ES, FR, IT, PT, RU, UA)
- Quiz generation from the summarized content
- Optional export of Udemy lecture notes to Notion through your own n8n webhook

## Install (development)

1. Clone the repository.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked** and select this folder.
3. Click the extension icon to open the side panel and open the settings.
4. Enter your own OpenAI and/or Google AI API key and save.

## Privacy and keys

- The extension ships with **no API keys**. Keys you enter are stored only in `chrome.storage.local` on your machine.
- Page text, video transcripts and prompts are sent directly from your browser to the provider you selected (OpenAI or Google). Nothing goes to a server operated by this project.
- The Notion export is off by default. It posts to the n8n webhook URL you store under `n8nEndpoint` in `chrome.storage.local`.

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
| `_locales/` | Translations |

## Contributing

Issues and pull requests are welcome. Never commit API keys or webhook URLs.

## License

[MIT](LICENSE)
