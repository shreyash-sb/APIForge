import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JsonGeneratorPage } from '@/pages/AI/JsonGeneratorPage';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import { useAppStore } from '@/store/useAppStore';
import { mockSpecification } from '@/test/fixtures';
describe('JsonGeneratorPage', () => { beforeEach(() => resetStore()); it('formats JSON without a specification', async () => { const user = userEvent.setup(); renderWithRouter(<JsonGeneratorPage />); expect(screen.getByText(/No specification imported/i)).toBeInTheDocument(); await user.click(screen.getByLabelText('JSON editor')); await user.paste('{"a":1}'); await user.click(screen.getByRole('button', { name: /Format JSON/i })); expect(screen.getByLabelText('JSON editor')).toHaveValue('{\n  "a": 1\n}'); }); it('generates from a selected normalized schema', async () => { useAppStore.getState().setActiveSpecification({ ...mockSpecification, schemas: { Payload: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } } } }); const user = userEvent.setup(); renderWithRouter(<JsonGeneratorPage />); await user.selectOptions(screen.getByLabelText('OpenAPI schema'), 'Payload'); await user.click(screen.getByRole('button', { name: /Generate JSON/i })); expect(screen.getByLabelText('JSON editor')).toHaveValue('{\n  "ok": false\n}'); }); });
