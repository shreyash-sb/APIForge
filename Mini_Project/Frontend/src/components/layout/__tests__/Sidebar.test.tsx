import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Sidebar } from '@/components/layout/Sidebar';
import { renderWithRouter } from '@/test/test-utils';
describe('Sidebar navigation', () => { it('does not render the redundant Help Center alias and retains Documentation', () => { renderWithRouter(<Sidebar />); expect(screen.queryByText('Help Center')).not.toBeInTheDocument(); expect(screen.getByRole('link', { name: /Documentation/i })).toHaveAttribute('href', '/documentation'); }); });
