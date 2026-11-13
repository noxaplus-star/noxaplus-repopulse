import {
  CATEGORY_META,
  STATUS_POINTS,
  type AuditResult,
  type CategoryId,
  type CategoryScore,
  type CheckDefinition,
  type CheckResult,
  type CheckStatus,
  type RepoFacts,
} from './types.js';

const DAY = 86_400_000;

function daysSince(date: string | null, now: Date): number | null {
  if (!date) return null;
  const value = Date.parse(date);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.floor((now.getTime() - value) / DAY));
}

function hasFile(facts: RepoFacts, patterns: RegExp[]): boolean {
  return facts.files.some(file => file.type === 'blob' && patterns.some(pattern => pattern.test(file.path)));
}

function rootFile(facts: RepoFacts, names: string[]): boolean {
  return facts.files.some(file => file.type === 'blob' && names.includes(file.path));
}

const README_SECTION = {
  install: /^#{1,4}\s+.*(install|setup|getting started|quick ?start|quickstart)/im,
  usage: /^#{1,4}\s+.*(usage|how to|using|example|workflow)/im,
  reference: /^#{1,4}\s+.*(api|configuration|options|commands|flags|reference)/im,
  community: /^#{1,4}\s+.*(contribut|license|security|support)/im,
};

function readmeSections(facts: RepoFacts): number {
  if (!facts.readme) return 0;
  return Object.values(README_SECTION).filter(pattern => pattern.test(facts.readme ?? '')).length;
}

function packageScripts(facts: RepoFacts): string[] {
  if (!facts.packageJson) return [];
  try {
    const parsed = JSON.parse(facts.packageJson) as { scripts?: Record<string, string> };
    return Object.keys(parsed.scripts ?? {}).map(key => key.toLowerCase());
  } catch {
    return [];
  }
}

const DEFINITIONS: CheckDefinition[] = [
  {
    id: 'doc-description',
    title: 'Repository description',
    category: 'documentation',
    weight: 4,
    evaluate: facts => {
      const length = facts.description?.trim().length ?? 0;
      if (length >= 20) return { status: 'pass', detail: 'A clear description is set.', fix: '' };
      if (length > 0) return { status: 'warn', detail: 'The description is very short.', fix: 'Expand the description to explain the problem the project solves in one sentence.' };
      return { status: 'fail', detail: 'No repository description.', fix: 'Add a one-sentence description in the About panel so search results and the repository page make sense.' };
    },
  },
  {
    id: 'doc-topics',
    title: 'Discoverability topics',
    category: 'documentation',
    weight: 5,
    evaluate: facts => {
      const count = facts.topics.length;
      if (count >= 4) return { status: 'pass', detail: `${count} topics configured.`, fix: '' };
      if (count > 0) return { status: 'warn', detail: `Only ${count} topic${count === 1 ? '' : 's'} configured.`, fix: 'Add at least four focused topics such as language, domain, and tool type.' };
      return { status: 'fail', detail: 'No topics configured.', fix: 'Add topics in the About panel so people can find the project through GitHub search.' };
    },
  },
  {
    id: 'doc-readme',
    title: 'Substantial README',
    category: 'documentation',
    weight: 8,
    evaluate: facts => {
      const size = facts.readme?.length ?? 0;
      if (size >= 1500) return { status: 'pass', detail: `README contains ${size.toLocaleString('en-US')} characters.`, fix: '' };
      if (size >= 300) return { status: 'warn', detail: `README contains only ${size.toLocaleString('en-US')} characters.`, fix: 'Document installation, a first working example, configuration, and limitations.' };
      return { status: 'fail', detail: 'README is missing or nearly empty.', fix: 'Write a README that lets a stranger install and run the project in five minutes.' };
    },
  },
  {
    id: 'doc-structure',
    title: 'README structure',
    category: 'documentation',
    weight: 6,
    evaluate: facts => {
      const count = readmeSections(facts);
      if (count >= 3) return { status: 'pass', detail: `${count} of 4 key README sections found.`, fix: '' };
      if (count > 0) return { status: 'warn', detail: `Only ${count} of 4 key README sections found.`, fix: 'Add the missing sections: install, usage, command or API reference, and contributing/license.' };
      return { status: 'fail', detail: 'README has no recognizable section headings.', fix: 'Organize the README with headings for install, usage, reference, and contribution.' };
    },
  },
  {
    id: 'doc-license',
    title: 'License',
    category: 'documentation',
    weight: 5,
    evaluate: facts =>
      facts.license
        ? { status: 'pass', detail: `License detected: ${facts.license}.`, fix: '' }
        : { status: 'fail', detail: 'No license detected.', fix: 'Add a LICENSE file. Without one, people cannot legally reuse the code.' },
  },
  {
    id: 'doc-changelog',
    title: 'Changelog',
    category: 'documentation',
    weight: 2,
    evaluate: facts =>
      hasFile(facts, [/(^|\/)CHANGELOG(\.[a-z]+)?$/i, /(^|\/)CHANGES(\.[a-z]+)?$/i, /(^|\/)HISTORY(\.[a-z]+)?$/i])
        ? { status: 'pass', detail: 'Changelog present.', fix: '' }
        : { status: 'warn', detail: 'No changelog found.', fix: 'Add CHANGELOG.md and record user-visible changes per release.' },
  },
  {
    id: 'auto-ci',
    title: 'Continuous integration',
    category: 'automation',
    weight: 8,
    evaluate: facts => {
      const withJobs = facts.workflows.filter(file => /(^|\n)\s*jobs\s*:/m.test(file.content));
      if (withJobs.length > 0) return { status: 'pass', detail: `${withJobs.length} workflow${withJobs.length === 1 ? '' : 's'} with jobs found.`, fix: '' };
      if (facts.workflows.length > 0) return { status: 'warn', detail: 'Workflow files exist but no jobs were detected.', fix: 'Verify the workflow YAML defines at least one job and runs on push.' };
      return { status: 'fail', detail: 'No GitHub Actions workflow.', fix: 'Add a CI workflow that installs dependencies and runs tests on every push and pull request.' };
    },
  },
  {
    id: 'auto-tests',
    title: 'Automated tests',
    category: 'automation',
    weight: 7,
    evaluate: facts => {
      const testFile = hasFile(facts, [
        /(^|\/)(tests?|__tests__|spec)\//,
        /\.(test|spec)\.[cm]?[jt]sx?$/,
        /(^|\/)test_[^/]+\.py$/,
        /_test\.go$/,
        /Tests?\.swift$/,
      ]);
      const testScript = packageScripts(facts).some(name => name === 'test' || name.startsWith('test:'));
      if (testFile && testScript) return { status: 'pass', detail: 'Test files and a test script are present.', fix: '' };
      if (testFile || testScript) return { status: 'warn', detail: testFile ? 'Test files found but no test script is declared.' : 'A test script exists but no test files were found.', fix: 'Make tests runnable with one documented command and include representative assertions.' };
      return { status: 'fail', detail: 'No automated tests detected.', fix: 'Add a test suite for core behavior and run it in CI.' };
    },
  },
  {
    id: 'auto-build',
    title: 'One-command build',
    category: 'automation',
    weight: 3,
    evaluate: facts => {
      const scripts = packageScripts(facts);
      if (scripts.includes('build')) return { status: 'pass', detail: 'Build script declared.', fix: '' };
      if (facts.packageJson) return { status: 'warn', detail: 'package.json has no build script.', fix: 'Add a "build" script so contributors and CI use the same command.' };
      if (hasFile(facts, [/(^|\/)(Makefile|justfile|Taskfile\.ya?ml)$/])) return { status: 'pass', detail: 'Task runner build target found.', fix: '' };
      return { status: 'warn', detail: 'No standard build entry point detected.', fix: 'Document and script the canonical build command.' };
    },
  },
  {
    id: 'auto-release',
    title: 'Published releases',
    category: 'automation',
    weight: 2,
    evaluate: facts =>
      facts.latestRelease
        ? { status: 'pass', detail: `Latest release: ${facts.latestRelease.tag}.`, fix: '' }
        : { status: 'warn', detail: 'No GitHub releases.', fix: 'Tag releases and publish notes so users can follow changes.' },
  },
  {
    id: 'sec-policy',
    title: 'Security policy',
    category: 'security',
    weight: 6,
    evaluate: facts =>
      hasFile(facts, [/(^|\/)(SECURITY|SECURITY-POLICY)(\.[a-z]+)?$/i, /(^|\/)docs\/security(\.[a-z]+)?$/i])
        ? { status: 'pass', detail: 'Security policy present.', fix: '' }
        : { status: 'fail', detail: 'No SECURITY.md.', fix: 'Add SECURITY.md with a private reporting channel and supported versions.' },
  },
  {
    id: 'sec-dependabot',
    title: 'Dependency updates',
    category: 'security',
    weight: 5,
    evaluate: facts =>
      hasFile(facts, [/(^|\/)dependabot\.ya?ml$/i, /(^|\/)renovate\.json5?$/i])
        ? { status: 'pass', detail: 'Automated dependency updates configured.', fix: '' }
        : { status: 'fail', detail: 'No Dependabot or Renovate configuration.', fix: 'Enable Dependabot in .github/dependabot.yml to receive dependency security patches.' },
  },
  {
    id: 'sec-codeql',
    title: 'Code scanning',
    category: 'security',
    weight: 5,
    evaluate: facts => {
      const enabled = facts.workflows.some(file => /codeql-action|github\/codeql/i.test(file.content) || /codeql/i.test(file.path));
      return enabled
        ? { status: 'pass', detail: 'CodeQL or code scanning workflow found.', fix: '' }
        : { status: 'fail', detail: 'No code scanning workflow.', fix: 'Add the CodeQL default workflow or connect another static analysis job.' };
    },
  },
  {
    id: 'sec-lockfile',
    title: 'Locked dependencies',
    category: 'security',
    weight: 4,
    evaluate: facts => {
      const manifest = rootFile(facts, ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'requirements.txt', 'Gemfile', 'composer.json']);
      if (!manifest) return { status: 'pass', detail: 'No dependency manifest detected.', fix: '' };
      const lock = rootFile(facts, ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'Cargo.lock', 'go.sum', 'poetry.lock', 'Gemfile.lock', 'composer.lock']);
      return lock
        ? { status: 'pass', detail: 'Dependency lockfile committed.', fix: '' }
        : { status: 'warn', detail: 'Manifest present but no lockfile.', fix: 'Commit the lockfile so installs are reproducible and reviewable.' };
    },
  },
  {
    id: 'community-contributing',
    title: 'Contribution guide',
    category: 'community',
    weight: 6,
    evaluate: facts =>
      hasFile(facts, [/(^|\/)CONTRIBUTING(\.[a-z]+)?$/i, /(^|\/)docs\/contributing(\.[a-z]+)?$/i])
        ? { status: 'pass', detail: 'CONTRIBUTING guide present.', fix: '' }
        : { status: 'fail', detail: 'No contribution guide.', fix: 'Explain how to report bugs, propose changes, and run the checks before a pull request.' },
  },
  {
    id: 'community-coc',
    title: 'Code of conduct',
    category: 'community',
    weight: 5,
    evaluate: facts =>
      hasFile(facts, [/(^|\/)CODE_OF_CONDUCT(\.[a-z]+)?$/i])
        ? { status: 'pass', detail: 'Code of conduct present.', fix: '' }
        : { status: 'fail', detail: 'No code of conduct.', fix: 'Adopt a code of conduct and state how violations are reported.' },
  },
  {
    id: 'community-issues',
    title: 'Issue templates',
    category: 'community',
    weight: 2,
    evaluate: facts =>
      hasFile(facts, [/(^|\/)\.github\/ISSUE_TEMPLATE\//i, /(^|\/)\.github\/issue_template\.md$/i])
        ? { status: 'pass', detail: 'Issue templates configured.', fix: '' }
        : { status: 'fail', detail: 'No issue templates.', fix: 'Add bug and feature templates so reports include environment and reproduction steps.' },
  },
  {
    id: 'community-pull-requests',
    title: 'Pull request template',
    category: 'community',
    weight: 2,
    evaluate: facts =>
      hasFile(facts, [/(^|\/)\.github\/pull_request_template\.md$/i, /(^|\/)docs\/pull_request_template\.md$/i])
        ? { status: 'pass', detail: 'Pull request template present.', fix: '' }
        : { status: 'fail', detail: 'No pull request template.', fix: 'Add a short PR checklist covering tests, docs, and release notes.' },
  },
  {
    id: 'maint-commit',
    title: 'Default branch commits',
    category: 'maintenance',
    weight: 4,
    evaluate: facts =>
      facts.latestCommit
        ? { status: 'pass', detail: `Latest commit ${facts.latestCommit.sha.slice(0, 7)}.`, fix: '' }
        : { status: 'fail', detail: 'No commits found on the default branch.', fix: 'Push an initial commit to the default branch.' },
  },
  {
    id: 'maint-archived',
    title: 'Actively maintained',
    category: 'maintenance',
    weight: 3,
    evaluate: facts =>
      facts.archived
        ? { status: 'fail', detail: 'Repository is archived.', fix: 'If development continues, unarchive the repository; otherwise state the status in the README.' }
        : { status: 'pass', detail: 'Repository is not archived.', fix: '' },
  },
  {
    id: 'maint-release',
    title: 'Release recency',
    category: 'maintenance',
    weight: 2,
    evaluate: facts => {
      if (!facts.latestRelease) return { status: 'fail', detail: 'No release published.', fix: 'Publish a tagged release with notes.' };
      const days = daysSince(facts.latestRelease.publishedAt, new Date());
      if (days === null) return { status: 'warn', detail: 'Release date unavailable.', fix: 'Publish releases with dates and notes.' };
      return days <= 365
        ? { status: 'pass', detail: `Latest release is ${days} days old.`, fix: '' }
        : { status: 'warn', detail: `Latest release is ${Math.floor(days / 365)} year(s) old.`, fix: 'Ship a maintenance release or note the project status.' };
    },
  },
];

// Activity check needs the clock; keep it separate from the static definitions.
const ACTIVITY_WEIGHT = 6;

function activityCheck(facts: RepoFacts, now: Date): { status: CheckStatus; detail: string; fix: string } {
  const days = daysSince(facts.pushedAt, now);
  if (days === null) return { status: 'warn', detail: 'Push date unavailable.', fix: 'Ensure the repository has commits on the default branch.' };
  if (days <= 90) return { status: 'pass', detail: `Last push ${days} day${days === 1 ? '' : 's'} ago.`, fix: '' };
  if (days <= 365) return { status: 'warn', detail: `Last push ${Math.floor(days / 30)} months ago.`, fix: 'Close stale work, merge pending fixes, or mark the project as maintenance-only.' };
  return { status: 'fail', detail: `Last push over a year ago (${Math.floor(days / 365)} year(s)).`, fix: 'Revive the project with a small release, or archive it so visitors know its status.' };
}

function gradeFor(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

function summaryFor(score: number): string {
  if (score >= 90) return 'Release-ready. A few small gaps remain.';
  if (score >= 75) return 'Solid foundation with visible gaps.';
  if (score >= 60) return 'Functional, but maintenance signals need work.';
  if (score >= 40) return 'Several essentials are missing.';
  return 'High risk: core community and maintenance signals are absent.';
}

export function auditRepository(facts: RepoFacts, now = new Date()): AuditResult {
  const definitions: CheckDefinition[] = [
    ...DEFINITIONS,
    {
      id: 'maint-activity',
      title: 'Recent activity',
      category: 'maintenance',
      weight: ACTIVITY_WEIGHT,
      evaluate: () => activityCheck(facts, now),
    },
  ];

  const checks: CheckResult[] = definitions.map(definition => {
    const outcome = definition.evaluate(facts);
    const earned = Number((definition.weight * STATUS_POINTS[outcome.status]).toFixed(1));
    return {
      ...outcome,
      id: definition.id,
      title: definition.title,
      category: definition.category,
      categoryTitle: CATEGORY_META[definition.category].title,
      weight: definition.weight,
      earned,
    };
  });

  const categories: CategoryScore[] = (Object.keys(CATEGORY_META) as CategoryId[]).map(id => {
    const entries = checks.filter(check => check.category === id);
    const weight = CATEGORY_META[id].weight;
    const earned = Number(entries.reduce((sum, check) => sum + check.earned, 0).toFixed(1));
    return { id, title: CATEGORY_META[id].title, weight, earned, percent: weight === 0 ? 0 : Math.round((earned / weight) * 100) };
  });

  const score = Math.round(categories.reduce((sum, category) => sum + category.earned, 0));
  const priorityFixes = checks
    .filter(check => check.status !== 'pass')
    .map(check => ({ check, lost: check.weight - check.earned }))
    .sort((left, right) => right.lost - left.lost || left.check.title.localeCompare(right.check.title))
    .slice(0, 6)
    .map(item => item.check);

  return {
    repo: {
      fullName: facts.fullName,
      htmlUrl: facts.htmlUrl,
      description: facts.description,
      stars: facts.stars,
      license: facts.license,
      defaultBranch: facts.defaultBranch,
      pushedAt: facts.pushedAt,
    },
    score,
    grade: gradeFor(score),
    summary: summaryFor(score),
    categories,
    checks,
    priorityFixes,
    generatedAt: now.toISOString(),
  };
}
