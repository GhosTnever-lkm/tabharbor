# TabHarbor

**Your sessions, at anchor.**

![TabHarbor: saved browser tab sessions](docs/screenshot.png)

TabHarbor is a Manifest V3 extension for Chrome and Edge that saves named browser workspaces, searches saved tabs, and restores each saved window in one step. Session data stays in the extension's local storage; there is no account, server, analytics, content script, or remote API.

## Features

- Save regular HTTP and HTTPS tabs across the open normal browser windows.
- Restore a saved workspace as separate browser windows, preserving tab order and pinned state.
- Search session names, page titles, and URLs.
- Export one session or the library as JSON, then validate JSON backups before import.
- Deduplicate canonical URLs per saved window and discard unsupported schemes.
- Keyboard shortcut `Ctrl/⌘ + K` focuses the search field.

## Install for testing

1. Download `TabHarbor-v0.1.0.zip` from the [latest release](https://github.com/GhosTnever-lkm/tabharbor/releases/latest) and extract it.
2. In Chrome, open `chrome://extensions`; in Edge, open `edge://extensions`.
3. Turn on Developer mode, choose **Load unpacked**, and select the extracted folder containing `manifest.json`.
4. Pin TabHarbor to the toolbar and open the popup.

Browser extension stores require separate submissions; the GitHub release is a downloadable unpacked extension, not a store listing.

## Permissions and data

- `tabs` lets the popup read tab titles, URLs, pinned state, and window membership so it can save sessions. No page content is read.
- `storage` keeps the session list in `chrome.storage.local` on this browser profile.
- No host permissions are requested. The extension makes no network requests.
- Saved URLs and titles can reveal browsing habits. Local extension storage and exported JSON are not encrypted. Use the export carefully on shared devices.
- Restoring asks before opening windows. Removing a saved record does not close existing tabs.

## Development

Requires Node.js 20 or newer for the pure core checks:

```sh
npm run check
```

The validation and backup core started from a compact DeepSeek-generated module and tests, then was checked and extended in this repository. The browser popup and Chrome API integration were implemented here.

## License

MIT. See [LICENSE](LICENSE).
