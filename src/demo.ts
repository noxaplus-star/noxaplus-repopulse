import type { RepoFacts, TreeEntry } from './types.js';

const DAY = 86_400_000;

function daysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY).toISOString();
}

const README = `# NoxaPlus PDF Desk

A private, local-first PDF workspace that runs entirely in your browser. Merge, arrange, split, rotate, and number pages without uploading a document.

## Features

- Merge pages from several PDFs into one output.
- Split by page ranges or custom groups.
- Rotate individual pages and number them in Persian or Latin digits.
- Preview every input page before exporting.

## Install

Open the hosted app, or download the standalone HTML build from the release page and double-click it. No server and no account are required.

\`\`\`bash
git clone https://github.com/noxaplus-star/noxaplus-pdf-desk.git
cd noxaplus-pdf-desk
npm ci
npm run dev
\`\`\`

## Usage

1. Drop PDF files onto the workspace.
2. Arrange the pages and pick a tool.
3. Create the output and download it before closing the tab.

## Configuration

The build has no runtime configuration. The PDF.js worker, fonts, and character maps are bundled into the standalone output, so the app also works from a local file without a server.

## Privacy

Documents stay in the memory of the current tab. The app does not upload files, does not create an account, and does not include analytics. Download every output before closing or reloading the tab, because the workspace is intentionally not persisted. Original PDFs are never modified.

## Browser support

The app targets current Chromium-based browsers and is tested in desktop and mobile Chrome. It requires module workers, Blob URLs, WebAssembly, and local file downloads. The standalone build embeds all of those resources and does not fetch anything from a CDN at runtime.

## Project status

The project is maintained by NoxaPlus and released under the MIT license. Security reports go through the private channel described in SECURITY.md. Feature requests and bug reports are triaged through the issue templates.

## Contributing

Read CONTRIBUTING.md, open an issue for bugs, and run the test suite with \`npm test\` before sending a pull request. Keep pull requests focused on one behavior change and include a regression test when fixing a bug.

## License

MIT © NoxaPlus. See LICENSE for the full text.
`;

const PACKAGE_JSON = JSON.stringify({
  name: 'noxaplus-pdf-desk',
  version: '1.0.1',
  scripts: { dev: 'vite', build: 'tsc && vite build', test: 'vitest run', typecheck: 'tsc --noEmit' },
});

const CI_WORKFLOW = `name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm test
      - run: npm run build
`;

function entry(path: string, size = 120): TreeEntry {
  return { path, type: 'blob', size };
}

export function demoFacts(now = new Date()): RepoFacts {
  const files: TreeEntry[] = [
    entry('README.md', README.length),
    entry('LICENSE', 1080),
    entry('CHANGELOG.md', 900),
    entry('SECURITY.md', 640),
    entry('CONTRIBUTING.md', 1200),
    entry('CODE_OF_CONDUCT.md', 3200),
    entry('.github/ISSUE_TEMPLATE/bug.yml', 800),
    entry('.github/workflows/ci.yml', CI_WORKFLOW.length),
    entry('.gitignore', 200),
    entry('package.json', PACKAGE_JSON.length),
    entry('package-lock.json', 120_000),
    entry('src/App.tsx', 18_000),
    entry('src/core/pdf.test.ts', 4_000),
    entry('src/components/PagePreview.tsx', 2_100),
    entry('public/manifest.webmanifest', 600),
    entry('docs/desktop.png', 240_000),
  ];

  return {
    owner: 'noxaplus-star',
    name: 'noxaplus-pdf-desk',
    fullName: 'noxaplus-star/noxaplus-pdf-desk',
    htmlUrl: 'https://github.com/noxaplus-star/noxaplus-pdf-desk',
    description: 'Private, offline Persian PDF workspace by NoxaPlus. Merge, split, rotate, and number PDFs in your browser.',
    topics: ['pdf', 'privacy', 'offline-first', 'persian', 'react', 'typescript'],
    homepage: 'https://noxaplus-star.github.io/noxaplus-pdf-desk/',
    license: 'MIT',
    archived: false,
    fork: false,
    stars: 128,
    defaultBranch: 'main',
    pushedAt: daysAgo(now, 5),
    createdAt: daysAgo(now, 240),
    files,
    readme: README,
    packageJson: PACKAGE_JSON,
    workflows: [{ path: '.github/workflows/ci.yml', content: CI_WORKFLOW }],
    latestRelease: { tag: 'v1.0.0', publishedAt: daysAgo(now, 400) },
    latestCommit: { sha: '78de985c0016e16928c36fa8e0262068388ab5b3', date: daysAgo(now, 6) },
    treeTruncated: false,
  };
}
