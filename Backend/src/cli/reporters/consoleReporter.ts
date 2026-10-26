import type { CliRunSummary } from '../types.js';

const SECRET_PATTERNS = [
  /(authorization|api[-_ ]?key|password|cookie|secret|token)\s*[:=]\s*(bearer\s+)?[^\s,;]+/gi,
  /bearer\s+[\w.-]+/gi,
  /:\/\/[^\s/@:]+:[^\s/@]+@/gi,
];

export function redactSecrets(text: string): string {
  if (!text) return text;
  let sanitized = text;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

export function formatConsoleReport(summary: CliRunSummary): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('======================================================================');
  lines.push(` APIForge CLI Test Runner — ${summary.title}`);
  lines.push(` Type: ${summary.type} | Target: ${summary.targetFile}`);
  lines.push('======================================================================');
  lines.push('');

  for (const item of summary.items) {
    const duration = `${item.durationMs}ms`;
    const tag = item.isTeardown ? ' [Teardown]' : item.isSetup ? ' [Setup]' : '';

    if (item.status === 'PASSED') {
      lines.push(`  ✔ PASS  ${item.name}${tag} (${duration})`);
    } else if (item.status === 'FAILED') {
      lines.push(`  ✖ FAIL  ${item.name}${tag} (${duration})`);
      if (item.errorMessage) {
        lines.push(`         Error: ${redactSecrets(item.errorMessage)}`);
      }
      if (item.assertions) {
        for (const assert of item.assertions.filter((a) => !a.passed)) {
          lines.push(`         - ${assert.name}: ${redactSecrets(assert.message || 'Assertion failed')}`);
        }
      }
    } else if (item.status === 'SKIPPED') {
      lines.push(`  ⊘ SKIP  ${item.name}${tag} (${item.errorMessage || 'Skipped'})`);
    } else {
      lines.push(`  ⚠ ERR   ${item.name}${tag} (${duration})`);
      if (item.errorMessage) {
        lines.push(`         Error: ${redactSecrets(item.errorMessage)}`);
      }
    }
  }

  lines.push('');
  lines.push('----------------------------------------------------------------------');
  lines.push(
    ` Summary: Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed} | Skipped: ${summary.skipped} | Duration: ${summary.durationMs}ms`
  );
  let overallStatusText = '✔ PASSED (Exit Code: 0)';
  if (summary.failed > 0) {
    overallStatusText = '✖ FAILED (Exit Code: 1)';
  } else if (summary.total > 0 && summary.passed === 0 && summary.skipped === summary.total) {
    overallStatusText = '⊘ NO TESTS EXECUTED (All tests skipped/disabled) (Exit Code: 0)';
  } else if (summary.total === 0) {
    overallStatusText = '⚠ NO TESTS FOUND (Exit Code: 0)';
  }

  lines.push(` Overall Status: ${overallStatusText}`);
  lines.push('======================================================================');
  lines.push('');

  return lines.join('\n');
}
