export type CategoryId = 'documentation' | 'automation' | 'security' | 'community' | 'maintenance';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckDefinition {
  id: string;
  title: string;
  category: CategoryId;
  weight: number;
  evaluate: (facts: RepoFacts) => { status: CheckStatus; detail: string; fix: string };
}

export interface CheckResult {
  id: string;
  title: string;
  category: CategoryId;
  categoryTitle: string;
  weight: number;
  earned: number;
  status: CheckStatus;
  detail: string;
  fix: string;
}

export interface CategoryScore {
  id: CategoryId;
  title: string;
  weight: number;
  earned: number;
  percent: number;
}

export interface TreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  size: number;
}

export interface WorkflowFile {
  path: string;
  content: string;
}

export interface RepoFacts {
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  topics: string[];
  homepage: string | null;
  license: string | null;
  archived: boolean;
  fork: boolean;
  stars: number;
  defaultBranch: string;
  pushedAt: string | null;
  createdAt: string;
  files: TreeEntry[];
  readme: string | null;
  packageJson: string | null;
  workflows: WorkflowFile[];
  latestRelease: { tag: string; publishedAt: string | null } | null;
  latestCommit: { sha: string; date: string | null } | null;
  treeTruncated: boolean;
}

export interface AuditResult {
  repo: {
    fullName: string;
    htmlUrl: string;
    description: string | null;
    stars: number;
    license: string | null;
    defaultBranch: string;
    pushedAt: string | null;
  };
  score: number;
  grade: string;
  summary: string;
  categories: CategoryScore[];
  checks: CheckResult[];
  priorityFixes: CheckResult[];
  generatedAt: string;
}

export const CATEGORY_META: Record<CategoryId, { title: string; weight: number }> = {
  documentation: { title: 'Documentation', weight: 30 },
  automation: { title: 'Automation', weight: 20 },
  security: { title: 'Security', weight: 20 },
  community: { title: 'Community', weight: 15 },
  maintenance: { title: 'Maintenance', weight: 15 },
};

export const STATUS_POINTS: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 };
