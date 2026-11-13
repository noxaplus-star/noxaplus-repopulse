import { describe, expect, it } from 'vitest';
import { auditRepository } from '../src/checks.js';
import { demoFacts } from '../src/demo.js';
import { renderBadge, renderHtmlReport, renderMarkdownReport } from '../src/report.js';

const NOW = new Date('2026-11-13T12:00:00.000Z');

describe('HTML report', () => {
  it('renders a complete, self-contained document', () => {
    const html = renderHtmlReport(auditRepository(demoFacts(NOW), NOW));
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Repository health report');
    expect(html).toContain('noxaplus-star/noxaplus-pdf-desk');
    expect(html).toContain('RepoPulse');
    expect(html).not.toContain('src="http');
    expect(html).not.toContain('<link rel="stylesheet" href="http');
    expect(html).toContain('</html>');
  });

  it('escapes repository-controlled strings', () => {
    const facts = demoFacts(NOW);
    facts.fullName = 'acme/<script>alert(1)</script>';
    facts.description = '"><img src=x onerror=alert(1)>';
    facts.htmlUrl = 'https://github.com/acme/x"><script>bad()</script>';
    const html = renderHtmlReport(auditRepository(facts, NOW));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('shows the computed score and grade', () => {
    const result = auditRepository(demoFacts(NOW), NOW);
    const html = renderHtmlReport(result);
    expect(html).toContain(`>${result.score}</text>`);
    expect(html).toContain(result.grade);
  });
});

describe('Markdown report', () => {
  it('includes category totals and every check', () => {
    const result = auditRepository(demoFacts(NOW), NOW);
    const markdown = renderMarkdownReport(result);
    expect(markdown).toContain(`# RepoPulse report: ${result.repo.fullName}`);
    expect(markdown).toContain(`**Score:** ${result.score} / 100`);
    for (const check of result.checks) expect(markdown).toContain(check.title);
  });
});

describe('badge', () => {
  it('produces a valid standalone SVG with the score', () => {
    const svg = renderBadge({ score: 87, grade: 'A' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('87 A');
    expect(svg).toContain('</svg>');
    const colors: Record<string, boolean> = {};
    for (const score of [95, 80, 65, 30]) {
      const value = renderBadge({ score, grade: 'X' });
      const fill = /<rect x="96" width="74" height="28" fill="(#[0-9a-f]+)"/.exec(value)?.[1];
      expect(fill).toBeTruthy();
      colors[fill!] = true;
    }
    expect(Object.keys(colors).length).toBeGreaterThan(1);
  });
});
