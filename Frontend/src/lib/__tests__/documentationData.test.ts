import { describe, expect, it } from 'vitest';
import { specificationMarkdown } from '@/lib/documentationData';
import { mockSpecification } from '@/test/fixtures';
describe('documentation markdown', () => { it('uses normalized specification facts without fabricating missing values', () => { const text = specificationMarkdown({ ...mockSpecification, metadata: { ...mockSpecification.metadata, description: undefined }, servers: [] }); expect(text).toContain(mockSpecification.metadata.title); expect(text).toContain('No description provided.'); expect(text).toContain('No servers defined.'); expect(text).toContain(mockSpecification.endpoints[0].path); }); });
