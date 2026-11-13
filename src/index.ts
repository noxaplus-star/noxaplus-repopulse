export { auditRepository } from './checks.js';
export { demoFacts } from './demo.js';
export { collectFacts, GitHubError, parseRepoRef, type RepoRef } from './github.js';
export { renderBadge, renderHtmlReport, renderMarkdownReport } from './report.js';
export type {
  AuditResult,
  CategoryId,
  CategoryScore,
  CheckResult,
  CheckStatus,
  RepoFacts,
} from './types.js';
export { CATEGORY_META } from './types.js';
