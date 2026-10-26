import type { CliRunSummary } from '../types.js';
import { redactSecrets } from './consoleReporter.js';

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatHtmlReport(summary: CliRunSummary): string {
  const title = escapeHtml(summary.title || 'APIForge Execution Report');
  const target = escapeHtml(summary.targetFile);
  const now = new Date().toISOString();

  let resultLabel = 'PASSED';
  let resultColor = 'var(--pass)';
  if (summary.failed > 0) {
    resultLabel = 'FAILED';
    resultColor = 'var(--fail)';
  } else if (summary.total > 0 && summary.passed === 0 && summary.skipped === summary.total) {
    resultLabel = 'NO TESTS EXECUTED';
    resultColor = 'var(--skip)';
  } else if (summary.total === 0) {
    resultLabel = 'NO TESTS FOUND';
    resultColor = 'var(--skip)';
  }

  const itemRows = summary.items
    .map((item) => {
      const name = escapeHtml(item.name);
      const duration = `${item.durationMs}ms`;
      const badgeClass =
        item.status === 'PASSED'
          ? 'badge-pass'
          : item.status === 'SKIPPED'
          ? 'badge-skip'
          : 'badge-fail';
      const tag = item.isTeardown ? ' <span class="tag-td">Teardown</span>' : item.isSetup ? ' <span class="tag-su">Setup</span>' : '';

      let detailsHtml = '';
      if (item.errorMessage || (item.assertions && item.assertions.length > 0)) {
        const errorMsg = item.errorMessage ? `<div class="error-msg">${escapeHtml(redactSecrets(item.errorMessage))}</div>` : '';
        const failedAsserts = (item.assertions || [])
          .filter((a) => !a.passed)
          .map((a) => `<li><strong>${escapeHtml(a.name)}:</strong> ${escapeHtml(redactSecrets(a.message || 'Assertion failed'))}</li>`)
          .join('');
        detailsHtml = `
          <div class="failure-details">
            ${errorMsg}
            ${failedAsserts ? `<ul class="assert-list">${failedAsserts}</ul>` : ''}
          </div>
        `;
      }

      return `
        <tr class="row-${item.status.toLowerCase()}">
          <td class="col-status"><span class="badge ${badgeClass}">${item.status}</span></td>
          <td class="col-name">${name}${tag}${detailsHtml}</td>
          <td class="col-duration">${duration}</td>
        </tr>
      `;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>APIForge Test Report — ${title}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --pass: #10b981;
      --fail: #ef4444;
      --skip: #64748b;
      --accent: #6366f1;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 2rem;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    .header { margin-bottom: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; }
    .header h1 { font-size: 1.8rem; font-weight: 700; margin-bottom: 0.5rem; }
    .header .meta { color: var(--text-muted); font-size: 0.9rem; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.25rem; }
    .card .val { font-size: 1.8rem; font-weight: 700; }
    .card .lbl { font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin-top: 0.25rem; }
    .card.pass .val { color: var(--pass); }
    .card.fail .val { color: var(--fail); }
    .card.skip .val { color: var(--skip); }
    .results-table { width: 100%; border-collapse: collapse; background: var(--card-bg); border: 1px solid var(--border); border-radius: 0.75rem; overflow: hidden; }
    .results-table th, .results-table td { padding: 0.85rem 1rem; text-align: left; border-bottom: 1px solid var(--border); }
    .results-table th { background: rgba(0,0,0,0.2); color: var(--text-muted); font-weight: 600; font-size: 0.85rem; text-transform: uppercase; }
    .col-status { width: 120px; }
    .col-duration { width: 100px; text-align: right; color: var(--text-muted); }
    .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; }
    .badge-pass { background: rgba(16, 185, 129, 0.2); color: var(--pass); border: 1px solid rgba(16, 185, 129, 0.4); }
    .badge-fail { background: rgba(239, 68, 68, 0.2); color: var(--fail); border: 1px solid rgba(239, 68, 68, 0.4); }
    .badge-skip { background: rgba(100, 116, 139, 0.2); color: var(--skip); border: 1px solid rgba(100, 116, 139, 0.4); }
    .tag-td { background: rgba(99, 102, 241, 0.2); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.4); font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 4px; margin-left: 0.5rem; }
    .tag-su { background: rgba(14, 165, 233, 0.2); color: #7dd3fc; border: 1px solid rgba(14, 165, 233, 0.4); font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 4px; margin-left: 0.5rem; }
    .failure-details { margin-top: 0.5rem; font-size: 0.85rem; color: #fca5a5; background: rgba(239, 68, 68, 0.1); padding: 0.5rem 0.75rem; border-radius: 0.375rem; border-left: 3px solid var(--fail); }
    .assert-list { margin-top: 0.4rem; padding-left: 1.2rem; }
    .footer { margin-top: 2rem; text-align: center; color: var(--text-muted); font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>APIForge Test Execution Report</h1>
      <div class="meta">
        <strong>Suite:</strong> ${title} &bull; 
        <strong>Target:</strong> ${target} &bull; 
        <strong>Generated:</strong> ${now} &bull; 
        <strong>Result:</strong> <strong style="color: ${resultColor};">${resultLabel}</strong>
      </div>
    </div>

    <div class="cards">
      <div class="card">
        <div class="val">${summary.total}</div>
        <div class="lbl">Total Tests</div>
      </div>
      <div class="card pass">
        <div class="val">${summary.passed}</div>
        <div class="lbl">Passed</div>
      </div>
      <div class="card fail">
        <div class="val">${summary.failed}</div>
        <div class="lbl">Failed</div>
      </div>
      <div class="card skip">
        <div class="val">${summary.skipped}</div>
        <div class="lbl">Skipped</div>
      </div>
      <div class="card">
        <div class="val">${summary.durationMs}ms</div>
        <div class="lbl">Duration</div>
      </div>
    </div>

    <table class="results-table">
      <thead>
        <tr>
          <th class="col-status">Status</th>
          <th class="col-name">Test / Step Name</th>
          <th class="col-duration">Duration</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <div class="footer">
      Generated automatically by APIForge Headless CLI Runner
    </div>
  </div>
</body>
</html>`;
}
