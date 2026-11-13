import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseArgs, runCli } from '../src/cli.js';

const directories: string[] = [];

async function tempDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'repopulse-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { stdout: (text: string) => out.push(text), stderr: (text: string) => err.push(text), cwd: process.cwd() } };
}

describe('parseArgs', () => {
  it('parses the audit command and options', () => {
    const options = parseArgs(['audit', 'owner/repo', '--format', 'json', '--badge', 'b.svg', '--fail-under', '70', '--quiet']);
    expect(options).toMatchObject({ command: 'audit', repo: 'owner/repo', format: 'json', badge: 'b.svg', failUnder: 70, quiet: true });
  });

  it('treats a bare repository as an audit request', () => {
    expect(parseArgs(['owner/repo']).command).toBe('audit');
    expect(parseArgs(['--demo']).demo).toBe(true);
  });

  it('rejects missing repositories and bad values', () => {
    expect(() => parseArgs(['audit'])).toThrow(/repository/i);
    expect(() => parseArgs(['owner/repo', '--format', 'pdf'])).toThrow(/format/i);
    expect(() => parseArgs(['owner/repo', '--fail-under', '120'])).toThrow(/between 0 and 100/);
    expect(() => parseArgs(['owner/repo', '--nope'])).toThrow(/Unknown option/);
  });
});

describe('runCli', () => {
  it('writes an HTML report for the demo repository', async () => {
    const directory = await tempDir();
    const { out, err, io } = capture();
    const code = await runCli(['audit', '--demo', '--out', 'report.html'], { ...io, cwd: directory });
    expect(code).toBe(0);
    expect(err).toHaveLength(0);
    const html = await readFile(join(directory, 'report.html'), 'utf8');
    expect(html).toContain('noxaplus-star/noxaplus-pdf-desk');
    expect(out.join('')).toContain('Score');
    expect(out.join('')).toMatch(/\d+\/100/);
  });

  it('supports JSON output, badges, and threshold failures', async () => {
    const directory = await tempDir();
    const { out, io } = capture();
    const code = await runCli(['audit', '--demo', '--format', 'json', '--out', 'audit.json', '--badge', 'badge.svg', '--quiet', '--fail-under', '100'], { ...io, cwd: directory });
    expect(code).toBe(1);
    const json = JSON.parse(await readFile(join(directory, 'audit.json'), 'utf8')) as { score: number; grade: string };
    expect(json.score).toBeLessThan(100);
    expect(json.grade).toBeTruthy();
    expect(await readFile(join(directory, 'badge.svg'), 'utf8')).toContain('<svg');
    expect(out).toHaveLength(0);
  });

  it('prints JSON to stdout when --out is -', async () => {
    const { out, io } = capture();
    const code = await runCli(['audit', '--demo', '--format', 'json', '--out', '-'], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out.join('')) as { repo: { fullName: string } };
    expect(parsed.repo.fullName).toContain('/');
  });

  it('returns a usage error for invalid flags', async () => {
    const { err, io } = capture();
    const code = await runCli(['audit', '--format', 'xml'], io);
    expect(code).toBe(2);
    expect(err.join('')).toContain('--format');
  });
});
