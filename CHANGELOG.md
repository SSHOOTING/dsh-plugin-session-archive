# Changelog

## 0.1.1 (2026-11-18)

- Fix: register `/session-export` through `ctx.effect()` so disable/reload disposes the command instead of leaving a duplicate.

## 0.1.0 (2026-11-18)

- Initial release.
- `/session-export` command with Markdown (default) and JSON output.
- Allowlisted event rendering: turns, user/assistant text, tool calls (command/path/query only), tool results.
- Credential redaction on every emitted field; `--max-kb` output cap (1–512 KB).
- Read-only: no network calls and no file writes.
- Fully offline test suite with synthetic event fixtures.

## 0.1.2 (2026-11-19)

- Release packaging: run the TypeScript build automatically before npm pack/publish.
- Refresh install documentation to require --profile web.
- Publish the first installable npm version for this plugin.
