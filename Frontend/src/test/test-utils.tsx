import React, { type PropsWithChildren } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
}

export function renderWithRouter(
  ui: React.ReactElement,
  { route = '/', ...renderOptions }: CustomRenderOptions = {}
) {
  function Wrapper({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

export function resetStore() {
  useAppStore.getState().resetWorkspace();
}
