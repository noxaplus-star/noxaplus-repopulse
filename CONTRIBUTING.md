# Contributing to NoxaPlus RepoPulse

Thanks for helping improve RepoPulse. Small, focused pull requests are easiest to review.

## Setup

```bash
git clone https://github.com/noxaplus-star/noxaplus-repopulse.git
cd noxaplus-repopulse
npm ci
npm test
npm run typecheck
```

`npm ci` runs the build so `dist/` is available for manual CLI checks.

## Before you open a pull request

- Run `npm test` and `npm run typecheck`.
- Add or update tests for behavior changes. Scoring changes need a fixture-based test.
- Update `README.md` and `CHANGELOG.md` when user-visible behavior or weights change.
- Keep the category weights in `src/types.ts` summing to 100.
- Do not include real tokens, private repository data, or personal information in fixtures or screenshots.

## Adding a check

1. Add a definition to `DEFINITIONS` in `src/checks.ts` with an `id`, title, category, weight, and `evaluate` function.
2. Adjust weights in the same category or in `CATEGORY_META` so the total remains 100.
3. Return a short, factual `detail` and an actionable `fix`. Do not use vague advice such as "improve quality".
4. Add a test with both passing and failing facts.
5. Check the report with `node dist/cli.js audit --demo` after rebuilding.

Checks must be based on observable repository data: files, workflows, releases, commits, or API metadata. Avoid scores based on popularity.

## Style

- TypeScript, ESM, Node.js 22+.
- Two-space indentation, single quotes, semicolons.
- Prefer small pure functions and explicit types.
- Report copy is English and factual; no emojis.
- Comments should explain a non-obvious constraint, not restate the code.

## Reporting bugs

Use the bug template. Include the audited repository, RepoPulse version, command, and the relevant part of the report. Never paste a GitHub token.

## Code of conduct

Participation is covered by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contribution is licensed under the MIT License.
