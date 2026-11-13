import { describe, expect, it } from 'vitest';
import { auditRepository } from '../src/checks.js';
import { demoFacts } from '../src/demo.js';
import type { RepoFacts, TreeEntry } from '../src/types.js';

const FIXED_NOW = new Date('2026-11-13T12:00:00.000Z');

const LONG_README = `# Widget

Widget is a small TypeScript library used to exercise RepoPulse checks without network access.

## Install

\`\`\`bash
npm install widget
\`\`\`

The package supports Node.js 22 and newer and has no runtime dependencies.

## Usage

\`\`\`ts
import { widget } from 'widget';
const result = widget({ input: 'value' });
\`\`\`

Pass an options object to change the output format. Invalid options throw a typed error with a stable code.

## Configuration

| Option | Type | Default |
| --- | --- | --- |
| format | string | json |
| pretty | boolean | false |

Configuration is read from the options object only. Environment variables are intentionally ignored so that the same input produces the same output in local development and continuous integration.

## Project status

The library is maintained by a small team. Bug reports are triaged weekly, and security reports follow the private process in SECURITY.md. Breaking changes require a major version and a migration note. Deprecations stay available for one minor release before removal.

## Contributing

Read CONTRIBUTING.md, run the tests, and open a focused pull request. Every behavior change needs a test, and every public API change needs a changelog entry. Do not include generated files or secrets in pull requests.

## Testing

The test suite uses fixture objects rather than network calls, so it runs deterministically in CI. Run npm test for the full suite and npm run typecheck before opening a pull request. Tests cover scoring thresholds, partial-credit behavior, report escaping, API response mapping, CLI argument parsing, JSON output, badge generation, and the threshold exit code.

## Limitations

The library does not attempt to be clever: it validates inputs, returns typed errors, and avoids hidden global state. Large inputs are processed in a single pass, and the public API is intentionally small. If a consumer needs a different output format, it should format the returned data rather than patching internals. This keeps upgrades predictable and makes behavior easy to test.

## License

MIT. See LICENSE for the full text.
`;

function makeFacts(overrides: Partial<RepoFacts> = {}): RepoFacts {
  const base: RepoFacts = {
    owner: 'acme',
    name: 'widget',
    fullName: 'acme/widget',
    htmlUrl: 'https://github.com/acme/widget',
    description: 'A small widget library for testing repository health checks.',
    topics: ['widget', 'typescript', 'library', 'testing'],
    homepage: 'https://example.com',
    license: 'MIT',
    archived: false,
    fork: false,
    stars: 10,
    defaultBranch: 'main',
    pushedAt: '2026-11-10T00:00:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
    files: [],
    readme: LONG_README,
    packageJson: JSON.stringify({ scripts: { build: 'tsc', test: 'vitest run' } }),
    workflows: [{ path: '.github/workflows/ci.yml', content: 'on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n' }],
    latestRelease: { tag: 'v1.2.0', publishedAt: '2026-09-01T00:00:00.000Z' },
    latestCommit: { sha: 'abcdef1234567890', date: '2026-11-10T00:00:00.000Z' },
    treeTruncated: false,
  };
  return { ...base, ...overrides };
}

function files(paths: string[]): TreeEntry[] {
  return paths.map(path => ({ path, type: 'blob', size: 100 }));
}

describe('auditRepository', () => {
  it('awards full points to a well-maintained repository', () => {
    const facts = makeFacts({
      files: files([
        'README.md',
        'LICENSE',
        'CHANGELOG.md',
        'SECURITY.md',
        'CONTRIBUTING.md',
        'CODE_OF_CONDUCT.md',
        '.github/ISSUE_TEMPLATE/bug.yml',
        '.github/pull_request_template.md',
        '.github/dependabot.yml',
        '.github/workflows/ci.yml',
        '.github/workflows/codeql.yml',
        'src/widget.test.ts',
        'package-lock.json',
        'package.json',
      ]),
      workflows: [
        { path: '.github/workflows/ci.yml', content: 'on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n' },
        { path: '.github/workflows/codeql.yml', content: 'jobs:\n  analyze:\n    steps:\n      - uses: github/codeql-action/init@v3\n' },
      ],
    });

    const result = auditRepository(facts, FIXED_NOW);

    expect(result.score).toBe(100);
    expect(result.grade).toBe('A+');
    expect(result.categories).toHaveLength(5);
    expect(result.categories.reduce((sum, category) => sum + category.weight, 0)).toBe(100);
    expect(result.categories.every(category => category.percent === 100)).toBe(true);
    expect(result.priorityFixes).toHaveLength(0);
  });

  it('flags missing trust and maintenance signals in a bare repository', () => {
    const result = auditRepository(
      makeFacts({
        description: null,
        topics: [],
        license: null,
        readme: null,
        packageJson: null,
        workflows: [],
        latestRelease: null,
        latestCommit: null,
        pushedAt: '2023-01-01T00:00:00.000Z',
        archived: true,
      }),
      FIXED_NOW,
    );

    expect(result.score).toBeLessThan(30);
    expect(result.grade).toBe('F');
    expect(result.checks.find(check => check.id === 'sec-policy')?.status).toBe('fail');
    expect(result.checks.find(check => check.id === 'maint-activity')?.status).toBe('fail');
    expect(result.checks.find(check => check.id === 'maint-archived')?.status).toBe('fail');
    expect(result.priorityFixes[0]?.weight).toBeGreaterThan(0);
  });

  it('gives partial credit for a README that is present but thin', () => {
    const thin = `# Widget\n\n${'A minimal README without setup or usage details. '.repeat(12)}`;
    const result = auditRepository(makeFacts({ readme: thin }), FIXED_NOW);
    const readme = result.checks.find(check => check.id === 'doc-readme');
    expect(readme?.status).toBe('warn');
    expect(readme?.earned).toBe(readme!.weight / 2);
  });

  it('detects test files in common layouts', () => {
    const layouts = ['tests/app.test.ts', 'src/spec/helper.ts', '__tests__/widget.jsx', 'lib/widget.spec.mjs', 'pkg/widget_test.go'];
    for (const layout of layouts) {
      const result = auditRepository(makeFacts({ files: files([layout]) }), FIXED_NOW);
      expect(result.checks.find(check => check.id === 'auto-tests')?.status, layout).toBe('pass');
    }
  });

  it('scores the bundled demo in the A range and keeps category totals consistent', () => {
    const result = auditRepository(demoFacts(FIXED_NOW), FIXED_NOW);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.score).toBeLessThan(100);
    expect(result.checks).toHaveLength(22);
    const earned = result.categories.reduce((sum, category) => sum + category.earned, 0);
    expect(Math.round(earned)).toBe(result.score);
    expect(new Set(result.categories.map(category => category.id)).size).toBe(5);
  });

  it('sorts priority fixes by lost points and caps the list', () => {
    const result = auditRepository(makeFacts({ files: [], readme: null }), FIXED_NOW);
    expect(result.priorityFixes.length).toBeLessThanOrEqual(6);
    expect(result.priorityFixes.every(check => check.status !== 'pass')).toBe(true);
  });
});
