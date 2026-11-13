import { mkdir, writeFile } from 'node:fs/promises';
import { auditRepository } from '../dist/checks.js';
import { demoFacts } from '../dist/demo.js';
import { renderBadge, renderHtmlReport } from '../dist/report.js';

const result = auditRepository(demoFacts());
await mkdir('site', { recursive: true });
await writeFile('site/index.html', renderHtmlReport(result), 'utf8');
await writeFile('site/badge.svg', renderBadge(result), 'utf8');
await writeFile('site/.nojekyll', '', 'utf8');
console.log(`site: sample report for ${result.repo.fullName} (score ${result.score}, ${result.grade})`);
