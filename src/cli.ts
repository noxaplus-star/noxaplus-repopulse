#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditRepository } from './checks.js';
import { demoFacts } from './demo.js';
import { collectFacts, GitHubError, parseRepoRef } from './github.js';
import { renderBadge, renderHtmlReport, renderMarkdownReport } from './report.js';
import type { AuditResult } from './types.js';

type Format = 'html' | 'markdown' | 'json';

interface CliOptions {
  command: 'audit' | 'help' | 'version';
  repo?: string;
  format: Format;
  out?: string;
  badge?: string;
  token?: string;
  failUnder?: number;
  demo: boolean;
  quiet: boolean;
}

interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
}

const HELP = `RepoPulse by NoxaPlus — audit the health of any GitHub repository.

Usage
  repopulse audit <owner/repo> [options]
  repopulse <owner/repo> [options]
  repopulse --demo [options]

Options
  --format html|markdown|json  Report format (default: html)
  --out <path>                 Output file; use - for stdout (default: repopulse-<repo>.<ext>)
  --badge <path>               Also write a shareable SVG score badge
  --fail-under <score>         Exit with code 1 when the score is below this value
  --token <token>              GitHub token (default: GITHUB_TOKEN or GH_TOKEN)
  --demo                       Generate a report from bundled sample data, no network
  --quiet                      Print only errors
  -h, --help                   Show this help
  -v, --version                Show the version

Exit codes
  0  Audit completed
  1  Score is below --fail-under
  2  Invalid usage or a failed audit

Examples
  npx noxaplus-repopulse audit noxaplus-star/noxaplus-pdf-desk
  repopulse audit https://github.com/facebook/react --format markdown --badge react-badge.svg
  GITHUB_TOKEN=... repopulse audit owner/repo --fail-under 80
`;

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { command: 'help', format: 'html', demo: false, quiet: false };
  const positional: string[] = [];
  const takeValue = (index: number, flag: string): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    switch (arg) {
      case '-h':
      case '--help':
        options.command = 'help';
        return options;
      case '-v':
      case '--version':
        options.command = 'version';
        return options;
      case 'audit':
        options.command = 'audit';
        break;
      case '--demo':
        options.command = 'audit';
        options.demo = true;
        break;
      case '--format': {
        const value = takeValue(index, '--format').toLowerCase();
        if (value !== 'html' && value !== 'markdown' && value !== 'json') throw new Error('--format must be html, markdown, or json.');
        options.format = value;
        index += 1;
        break;
      }
      case '--out':
        options.out = takeValue(index, '--out');
        index += 1;
        break;
      case '--badge':
        options.badge = takeValue(index, '--badge');
        index += 1;
        break;
      case '--token':
        options.token = takeValue(index, '--token');
        index += 1;
        break;
      case '--fail-under': {
        const value = Number(takeValue(index, '--fail-under'));
        if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('--fail-under must be a number between 0 and 100.');
        options.failUnder = value;
        index += 1;
        break;
      }
      case '--quiet':
        options.quiet = true;
        break;
      default:
        if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
        positional.push(arg);
        break;
    }
  }

  if (positional.length > 0) {
    if (options.command === 'help') options.command = 'audit';
    options.repo = positional[0]!;
    if (positional.length > 1) throw new Error(`Unexpected argument: ${positional[1]}`);
  }
  if (options.command === 'audit' && !options.demo && !options.repo) {
    throw new Error('A repository is required. Use owner/repo, a GitHub URL, or --demo.');
  }
  return options;
}

function extensionFor(format: Format): string {
  return format === 'markdown' ? 'md' : format;
}

function defaultOut(repo: string, format: Format): string {
  const parsed = parseRepoRef(repo);
  return `repopulse-${parsed.owner}-${parsed.repo}.${extensionFor(format)}`;
}

function render(result: AuditResult, format: Format): string {
  if (format === 'json') return `${JSON.stringify(result, null, 2)}\n`;
  if (format === 'markdown') return renderMarkdownReport(result);
  return renderHtmlReport(result);
}

function bar(percent: number): string {
  const filled = Math.round(Math.max(0, Math.min(100, percent)) / 10);
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
}

function summary(result: AuditResult, outFile: string | null, badgeFile: string | null): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`RepoPulse  ${result.repo.fullName}`);
  lines.push(`Score      ${result.score}/100  (${result.grade})  ${result.summary}`);
  lines.push('');
  for (const category of result.categories) {
    lines.push(`${category.title.padEnd(14)} ${String(category.earned).padStart(5)}/${String(category.weight).padEnd(3)} ${bar(category.percent)} ${String(category.percent).padStart(3)}%`);
  }
  if (result.priorityFixes.length > 0) {
    lines.push('');
    lines.push('Top fixes');
    result.priorityFixes.slice(0, 4).forEach((check, index) => {
      lines.push(`  ${index + 1}. ${check.title} — ${check.fix}`);
    });
  }
  lines.push('');
  if (outFile) lines.push(`Report     ${outFile}`);
  if (badgeFile) lines.push(`Badge      ${badgeFile}`);
  return `${lines.join('\n')}\n`;
}

export async function runCli(argv: string[], io: Io = {
  stdout: text => process.stdout.write(text),
  stderr: text => process.stderr.write(text),
  cwd: process.cwd(),
}): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    io.stderr(`repopulse: ${error instanceof Error ? error.message : String(error)}\n\n${HELP}`);
    return 2;
  }

  if (options.command === 'help') {
    io.stdout(HELP);
    return 0;
  }
  if (options.command === 'version') {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    io.stdout(`noxaplus-repopulse ${packageJson.version}\n`);
    return 0;
  }

  let result: AuditResult;
  try {
    const facts = options.demo ? demoFacts() : await collectFacts(options.repo!, { token: options.token });
    result = auditRepository(facts);
  } catch (error) {
    if (error instanceof GitHubError) {
      io.stderr(`repopulse: ${error.message}${error.hint ? `\n  ${error.hint}` : ''}\n`);
      return 2;
    }
    io.stderr(`repopulse: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  const content = render(result, options.format);
  const outPath = options.out ?? (options.demo ? `repopulse-demo.${extensionFor(options.format)}` : defaultOut(options.repo!, options.format));
  let written: string | null = null;
  try {
    if (outPath === '-') {
      io.stdout(content);
    } else {
      const absolute = resolve(io.cwd, outPath);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, content, 'utf8');
      written = outPath;
    }
    if (options.badge) {
      const badgePath = resolve(io.cwd, options.badge);
      await mkdir(dirname(badgePath), { recursive: true });
      await writeFile(badgePath, renderBadge(result), 'utf8');
    }
  } catch (error) {
    io.stderr(`repopulse: could not write the report: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  if (!options.quiet && outPath !== '-') {
    const text = summary(result, written, options.badge ?? null);
    io.stdout(useColor ? text : text.replace(/\u001b\[\d+m/g, ''));
  }

  if (options.failUnder !== undefined && result.score < options.failUnder) {
    if (!options.quiet) io.stderr(`\nrepopulse: score ${result.score} is below the required ${options.failUnder}.\n`);
    return 1;
  }
  return 0;
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runCli(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  }).catch(error => {
    process.stderr.write(`repopulse: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
