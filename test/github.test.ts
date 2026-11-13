import { describe, expect, it } from 'vitest';
import { collectFacts, GitHubError, parseRepoRef } from '../src/github.js';

describe('parseRepoRef', () => {
  it('accepts shorthand, HTTPS, SSH, and .git suffixes', () => {
    expect(parseRepoRef('noxaplus-star/noxaplus-pdf-desk')).toEqual({ owner: 'noxaplus-star', repo: 'noxaplus-pdf-desk' });
    expect(parseRepoRef('https://github.com/facebook/react')).toEqual({ owner: 'facebook', repo: 'react' });
    expect(parseRepoRef('https://github.com/facebook/react/tree/main/packages')).toEqual({ owner: 'facebook', repo: 'react' });
    expect(parseRepoRef('git@github.com:owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' });
    expect(parseRepoRef('owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('rejects malformed references', () => {
    expect(() => parseRepoRef('')).toThrow(GitHubError);
    expect(() => parseRepoRef('not a repo')).toThrow(GitHubError);
    expect(() => parseRepoRef('https://gitlab.com/owner/repo')).toThrow(GitHubError);
    expect(() => parseRepoRef('owner/repo/extra')).toThrow(GitHubError);
  });
});

describe('collectFacts', () => {
  it('maps GitHub API responses into audit facts', async () => {
    const calls: string[] = [];
    const responses = new Map<string, unknown>([
      ['/repos/acme/widget', {
        name: 'widget',
        full_name: 'acme/widget',
        html_url: 'https://github.com/acme/widget',
        description: 'A widget',
        topics: ['widget', 'tools'],
        homepage: '',
        license: { spdx_id: 'MIT', name: 'MIT License' },
        archived: false,
        fork: false,
        stargazers_count: 42,
        default_branch: 'main',
        pushed_at: '2026-11-01T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
      }],
      ['/repos/acme/widget/git/trees/main?recursive=1', {
        tree: [
          { path: 'README.md', type: 'blob', size: 2000 },
          { path: 'package.json', type: 'blob', size: 200 },
          { path: 'src', type: 'tree' },
          { path: '.github/workflows/ci.yml', type: 'blob', size: 100 },
        ],
        truncated: false,
      }],
      ['/repos/acme/widget/releases?per_page=1', [{ tag_name: 'v1.0.0', published_at: '2026-10-01T00:00:00Z' }]],
      ['/repos/acme/widget/commits?per_page=1', [{ sha: 'deadbeefcafe', commit: { committer: { date: '2026-11-01T00:00:00Z' } } }]],
    ]);

    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      calls.push(url.pathname + url.search);
      const body = responses.get(url.pathname + url.search);
      if (body === undefined) {
        if (url.pathname.endsWith('/readme')) return new Response('# Widget', { status: 200 });
        if (url.pathname.endsWith('/contents/package.json')) return new Response('{"scripts":{"test":"vitest"}}', { status: 200 });
        if (url.pathname.endsWith('/contents/.github/workflows/ci.yml')) return new Response('on: push\njobs: {}', { status: 200 });
        return new Response('Not found', { status: 404 });
      }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const facts = await collectFacts('acme/widget', { fetchImpl, token: '' });
    expect(facts.fullName).toBe('acme/widget');
    expect(facts.license).toBe('MIT');
    expect(facts.homepage).toBeNull();
    expect(facts.readme).toContain('# Widget');
    expect(facts.packageJson).toContain('vitest');
    expect(facts.workflows).toHaveLength(1);
    expect(facts.latestCommit?.sha).toBe('deadbeefcafe');
    expect(facts.latestRelease?.tag).toBe('v1.0.0');
    expect(calls.some(call => call.includes('/readme'))).toBe(true);
  });

  it('reports rate limits with a useful hint', async () => {
    const fetchImpl = (async () => new Response('{}', {
      status: 403,
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1763000000' },
    })) as typeof fetch;
    await expect(collectFacts('acme/widget', { fetchImpl, token: '' })).rejects.toMatchObject({
      status: 403,
      hint: expect.stringContaining('GITHUB_TOKEN'),
    });
  });
});
