import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { AIAssistantCard } from '@/components/dashboard/AIAssistantCard';
import { aiAssistantActions } from '@/data/mockData';
import { renderWithRouter } from '@/test/test-utils';
describe('AIAssistantCard', () => { it('uses accurate capability wording and links every card to a working feature', () => { renderWithRouter(<AIAssistantCard actions={aiAssistantActions} />); expect(screen.queryByText('Explain Error')).not.toBeInTheDocument(); expect(screen.queryByText('Generate JSON Payload')).not.toBeInTheDocument(); expect(screen.getByRole('link', { name: /Diagnose test failures/i })).toHaveAttribute('href', '/ai-assistant'); expect(screen.getByRole('link', { name: /Generate test cases/i })).toHaveAttribute('href', '/test-generator'); expect(screen.getByRole('link', { name: /Generate JSON samples/i })).toHaveAttribute('href', '/json-generator'); }); });
