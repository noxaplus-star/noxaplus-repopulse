# Changelog

Notable changes to NoxaPlus RepoPulse are recorded here. Version numbers follow Semantic Versioning. Dates use `YYYY-MM-DD`.

## [1.0.0] - 2026-11-13

### Added

- `repopulse audit` for public GitHub repositories, with shorthand, HTTPS, SSH, and URL inputs.
- 22 weighted checks across documentation, automation, security, community, and maintenance, producing a 0–100 score and letter grade.
- Self-contained HTML report with score gauge, category breakdown, prioritized fixes, light/dark themes, and print styles.
- Markdown and JSON report formats.
- Standalone SVG score badge.
- `--demo` sample report with no network access.
- `--fail-under` exit code for release and CI gates.
- Optional `GITHUB_TOKEN`/`GH_TOKEN` support with rate-limit guidance.
- Sample report and badge published through GitHub Pages.
- Unit tests for scoring, report escaping, API mapping, argument parsing, and file output.

### Security

- Read-only GitHub API access with no write scopes required.
- Tokens are never included in reports or terminal output.

[1.0.0]: https://github.com/noxaplus-star/noxaplus-repopulse/releases/tag/v1.0.0
