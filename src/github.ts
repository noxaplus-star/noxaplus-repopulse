import type { RepoFacts, TreeEntry, WorkflowFile } from './types.js';

const API = 'https://api.github.com';

export interface RepoRef {
  owner: string;
  repo: string;
}

export class GitHubError extends Error {
  readonly status: number;
  readonly hint: string;

  constructor(message: string, status = 0, hint = '') {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.hint = hint;
  }
}

export function parseRepoRef(input: string): RepoRef {
  const trimmed = input.trim();
  if (!trimmed) throw new GitHubError('Repository is required.', 0, 'Pass owner/repo, for example: repopulse audit noxaplus-star/noxaplus-pdf-desk');

  const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i.exec(trimmed);
  if (ssh) return validateRef(ssh[1]!, ssh[2]!);

  const url = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/?#]+)(?:[/?#].*)?$/i.exec(trimmed);
  if (url) return validateRef(url[1]!, url[2]!.replace(/\.git$/i, ''));

  const short = /^([^/\s]+)\/([^/\s]+)$/.exec(trimmed);
  if (short) return validateRef(short[1]!, short[2]!.replace(/\.git$/i, ''));

  throw new GitHubError(`Could not parse repository "${input}".`, 0, 'Use owner/repo or a full github.com URL.');
}

function validateRef(owner: string, repo: string): RepoRef {
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new GitHubError(`Invalid repository reference "${owner}/${repo}".`, 0);
  }
  return { owner, repo };
}

interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  topics?: string[];
  homepage: string | null;
  license: { spdx_id?: string | null; name?: string | null } | null;
  archived: boolean;
  fork: boolean;
  stargazers_count: number;
  default_branch: string;
  pushed_at: string | null;
  created_at: string;
}

interface GitHubTree {
  tree: Array<{ path: string; type: string; size?: number }>;
  truncated: boolean;
}

interface GitHubRelease {
  tag_name: string;
  published_at: string | null;
}

interface GitHubCommit {
  sha: string;
  commit: { committer: { date: string | null } | null; author: { date: string | null } | null };
}

export interface CollectOptions {
  token?: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class GitHubClient {
  private readonly token?: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: CollectOptions = {}) {
    this.token = options.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  private headers(accept: string): Record<string, string> {
    return {
      Accept: accept,
      'User-Agent': 'NoxaPlus-RepoPulse/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  private async request(path: string, accept: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${API}${path}`, { headers: this.headers(accept), signal: controller.signal });
      if (response.ok) return response;
      if (response.status === 401) throw new GitHubError('GitHub rejected the token.', 401, 'Check GITHUB_TOKEN or run without a token for public repositories.');
      if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
        const reset = Number(response.headers.get('x-ratelimit-reset') ?? 0) * 1000;
        const when = reset ? new Date(reset).toISOString() : 'later';
        throw new GitHubError('GitHub API rate limit reached.', 403, `Try again after ${when}, or pass GITHUB_TOKEN to raise the limit to 5,000 requests per hour.`);
      }
      if (response.status === 404) throw new GitHubError('Repository not found or not accessible.', 404, 'Check the owner/repo spelling. Private repositories require a token with repo access.');
      throw new GitHubError(`GitHub API request failed with status ${response.status}.`, response.status);
    } catch (error) {
      if (error instanceof GitHubError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GitHubError('GitHub API request timed out.', 0, 'Check the network connection and try again.');
      }
      throw new GitHubError(`Could not reach GitHub: ${error instanceof Error ? error.message : String(error)}.`, 0);
    } finally {
      clearTimeout(timer);
    }
  }

  async json<T>(path: string): Promise<T> {
    const response = await this.request(path, 'application/vnd.github+json');
    return (await response.json()) as T;
  }

  async optionalJson<T>(path: string): Promise<T | null> {
    try {
      return await this.json<T>(path);
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }
  }

  async text(path: string): Promise<string | null> {
    try {
      const response = await this.request(path, 'application/vnd.github.raw');
      return await response.text();
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }
  }
}

export async function collectFacts(refInput: string, options: CollectOptions = {}): Promise<RepoFacts> {
  const ref = parseRepoRef(refInput);
  const client = new GitHubClient(options);
  const base = `/repos/${ref.owner}/${ref.repo}`;

  const repo = await client.json<GitHubRepo>(base);
  const tree = await client.optionalJson<GitHubTree>(`${base}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`);
  const files: TreeEntry[] = (tree?.tree ?? [])
    .filter(entry => entry.type === 'blob' || entry.type === 'tree')
    .map(entry => ({ path: entry.path, type: entry.type as TreeEntry['type'], size: entry.size ?? 0 }));

  const [readme, packageJson, release, commit] = await Promise.all([
    client.text(`${base}/readme`),
    files.some(file => file.path === 'package.json' && file.size < 500_000) ? client.text(`${base}/contents/package.json`) : Promise.resolve(null),
    client.optionalJson<GitHubRelease[]>(`${base}/releases?per_page=1`),
    client.optionalJson<GitHubCommit[]>(`${base}/commits?per_page=1`),
  ]);

  const workflowPaths = files
    .filter(file => file.type === 'blob' && /^\.github\/workflows\/.+\.ya?ml$/i.test(file.path))
    .slice(0, 12);
  const workflows: WorkflowFile[] = [];
  for (const file of workflowPaths) {
    const content = await client.text(`${base}/contents/${file.path.split('/').map(encodeURIComponent).join('/')}`);
    workflows.push({ path: file.path, content: content ?? '' });
  }

  const latestCommit = commit?.[0]
    ? {
        sha: commit[0].sha,
        date: commit[0].commit.committer?.date ?? commit[0].commit.author?.date ?? null,
      }
    : null;

  return {
    owner: ref.owner,
    name: repo.name,
    fullName: repo.full_name,
    htmlUrl: repo.html_url,
    description: repo.description,
    topics: repo.topics ?? [],
    homepage: repo.homepage || null,
    license: repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION'
      ? repo.license.spdx_id
      : repo.license?.name ?? null,
    archived: repo.archived,
    fork: repo.fork,
    stars: repo.stargazers_count,
    defaultBranch: repo.default_branch,
    pushedAt: repo.pushed_at,
    createdAt: repo.created_at,
    files,
    readme,
    packageJson,
    workflows,
    latestRelease: release?.[0] ? { tag: release[0].tag_name, publishedAt: release[0].published_at } : null,
    latestCommit,
    treeTruncated: tree?.truncated ?? false,
  };
}
