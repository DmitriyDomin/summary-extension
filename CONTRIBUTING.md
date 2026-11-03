# Contributing

Thanks for helping out.

## Setup

1. Clone the repo and load it unpacked in `chrome://extensions` (Developer mode).
2. Add your own OpenAI or Google AI key in the extension settings.
3. Run `npm test` before opening a pull request. It checks syntax, manifest references, locale parity and that no secrets are committed.

## Rules

- **Never commit API keys, tokens or webhook URLs.** Keys belong in `chrome.storage.local` through the settings panel. CI fails if a known key pattern appears.
- Keep changes focused: one fix or feature per pull request.
- New user-facing strings go into every file under `_locales/`.
- Describe what you changed and how you tested it in the pull request.

## Reporting bugs

Open an issue with the page URL type (YouTube, Udemy or other), what you expected, what happened, and any console errors from the side panel or the page.
