import type { CliRunSummary } from '../types.js';
import { redactSecrets } from './consoleReporter.js';

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatJUnitReport(summary: CliRunSummary): string {
  const timeSeconds = (summary.durationMs / 1000).toFixed(3);
  const suiteName = escapeXml(summary.title || 'APIForge Suite');
  const sanitizedTarget = escapeXml(summary.targetFile);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuites name="APIForge" tests="${summary.total}" failures="${summary.failed}" errors="0" skipped="${summary.skipped}" time="${timeSeconds}">`
  );
  lines.push(
    `  <testsuite name="${suiteName}" file="${sanitizedTarget}" tests="${summary.total}" failures="${summary.failed}" errors="0" skipped="${summary.skipped}" time="${timeSeconds}">`
  );

  for (const item of summary.items) {
    const itemTime = (item.durationMs / 1000).toFixed(3);
    const itemName = escapeXml(item.name);
    const classname = escapeXml(`${summary.title}.${item.id}`);

    if (item.status === 'PASSED') {
      lines.push(`    <testcase name="${itemName}" classname="${classname}" time="${itemTime}" />`);
    } else if (item.status === 'SKIPPED') {
      const reason = escapeXml(redactSecrets(item.errorMessage || 'Skipped execution'));
      lines.push(`    <testcase name="${itemName}" classname="${classname}" time="${itemTime}">`);
      lines.push(`      <skipped message="${reason}" />`);
      lines.push('    </testcase>');
    } else {
      // FAILED or ERROR
      const errorMsg = escapeXml(redactSecrets(item.errorMessage || 'Step assertion failed'));
      let details = errorMsg;
      if (item.assertions) {
        const failedAsserts = item.assertions
          .filter((a) => !a.passed)
          .map((a) => `${a.name}: ${a.message || 'failed'}`)
          .join('\n');
        if (failedAsserts) {
          details = escapeXml(redactSecrets(`${errorMsg}\n${failedAsserts}`));
        }
      }

      lines.push(`    <testcase name="${itemName}" classname="${classname}" time="${itemTime}">`);
      lines.push(`      <failure message="${errorMsg}" type="AssertionFailure">${details}</failure>`);
      lines.push('    </testcase>');
    }
  }

  lines.push('  </testsuite>');
  lines.push('</testsuites>');

  return lines.join('\n');
}
