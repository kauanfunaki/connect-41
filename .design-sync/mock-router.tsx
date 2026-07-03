import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

const mockRouter = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

export function MockRouterProvider({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterContext.Provider value={mockRouter}>
      <PathnameContext.Provider value="/">{children}</PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
}
