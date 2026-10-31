import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { HealthStatus } from '@/components/dashboard/HealthStatus';
import { renderWithRouter } from '@/test/test-utils';
describe('HealthStatus', () => { it('renders unknown status without inventing a response time', () => { renderWithRouter(<HealthStatus items={[{ service: 'APIForge backend', status: 'Unknown', responseTime: '—' }]} />); expect(screen.getByText('Unknown')).toBeInTheDocument(); expect(screen.getByText('—')).toBeInTheDocument(); }); });
