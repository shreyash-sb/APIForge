import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockReportSummary } from '@/test/fixtures';
import { reportService } from '../reportService';

const nativeUrl = globalThis.URL;
const createdBlobs: Blob[] = [];
const createObjectURL = vi.fn((blob: Blob) => {
  createdBlobs.push(blob);
  return `blob:apiforge-report-${createdBlobs.length}`;
});
const revokeObjectURL = vi.fn();

class URLWithObjectUrls extends nativeUrl {
  static createObjectURL = createObjectURL;
  static revokeObjectURL = revokeObjectURL;
}

describe('report export downloads', () => {
  const clickedAnchors: HTMLAnchorElement[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    createdBlobs.length = 0;
    clickedAnchors.length = 0;
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it('downloads a readable JSON report with the report id and endpoint results', async () => {
    vi.stubGlobal('URL', URLWithObjectUrls);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedAnchors.push(this);
    });

    reportService.downloadReportJson(mockReportSummary);

    expect(clickedAnchors).toHaveLength(1);
    expect(clickedAnchors[0].download).toBe(`apiforge-report-${mockReportSummary.metadata.reportId}.json`);
    expect(clickedAnchors[0].href).toBe('blob:apiforge-report-1');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:apiforge-report-1');
    const exported = JSON.parse(await createdBlobs[0].text());
    expect(exported.metadata.reportId).toBe(mockReportSummary.metadata.reportId);
    expect(exported.endpoints[0].path).toBe(mockReportSummary.endpoints[0].path);
  });

  it('downloads endpoint and failure CSVs with matching headings and report rows', async () => {
    vi.stubGlobal('URL', URLWithObjectUrls);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedAnchors.push(this);
    });

    reportService.downloadEndpointCsv(mockReportSummary.endpoints);
    reportService.downloadFailureCsv(mockReportSummary.failures);

    expect(clickedAnchors.map((anchor) => anchor.download)).toEqual([
      'apiforge-endpoints.csv',
      'apiforge-failures.csv',
    ]);
    const endpointsCsv = await createdBlobs[0].text();
    const failuresCsv = await createdBlobs[1].text();
    expect(endpointsCsv.split('\n')[0]).toContain('"Method","Endpoint","Tests"');
    expect(endpointsCsv).toContain(`"${mockReportSummary.endpoints[0].path}"`);
    expect(failuresCsv.split('\n')[0]).toContain('"Test","Method","Endpoint"');
    if (mockReportSummary.failures.length) {
      expect(failuresCsv).toContain(`"${mockReportSummary.failures[0].testName}"`);
    }
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
