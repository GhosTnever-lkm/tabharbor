# Changelog

## 0.1.4 - 2026-10-25

- Reject saves that exceed the supported window or per-window tab limits instead of silently truncating a workspace.
- Document the limits and add regressions for both boundaries.

## 0.1.3 - 2026-10-24

- Reject imports that would exceed the 100-session library limit instead of silently dropping imported sessions.
- Preserve current saved sessions when an import contains a duplicate key, report duplicates accurately, and commit in-memory changes only after storage succeeds.
- Add regression tests for over-cap imports and duplicate handling.

## 0.1.2 - 2026-10-12

- Add three common workflows and a data-flow diagram to explain how sessions and JSON backups work.
- Document the free MIT edition and support options; use the latest release link in installation steps.
- Keep the extension manifest and package versions aligned.
- Make release automation upload ZIP and SHA-256 assets to an already-created GitHub release instead of failing when that release exists.

## 0.1.1 - 2026-10-11

- Add a real screenshot of the app to the README.

## 0.1.0

- Initial public release with named multi-window sessions, safe URL validation, search, JSON backup/import, and restore.
