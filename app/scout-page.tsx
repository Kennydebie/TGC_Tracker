import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from '@/app/chatgpt-auth';
import { ScoutApp } from '@/components/scout-app';
import { getD1 } from '@/db';
import { listProductionDeals } from '@/lib/repositories/scans';

export async function ScoutPage({
  section = 'dashboard',
  dealId,
  initialSearchParams = {},
}: {
  section?: string;
  dealId?: string;
  initialSearchParams?: Record<string, string>;
}) {
  const initialDealsPromise = (async () => {
    try {
      return await listProductionDeals(getD1());
    } catch {
      // A missing database binding is an unavailable live feed, not permission
      // to substitute fictional market records.
      return [];
    }
  })();
  const [user, initialDeals] = await Promise.all([
    getChatGPTUser(),
    initialDealsPromise,
  ]);
  const basePath = section === 'dashboard' ? '/' : `/${section}`;
  const query = new URLSearchParams(initialSearchParams).toString();
  const path = query ? `${basePath}?${query}` : basePath;
  return (
    <ScoutApp
      initialSection={section}
      initialDealId={dealId}
      initialDeals={initialDeals}
      initialSearchParams={initialSearchParams}
      user={user ? { displayName: user.displayName, email: user.email } : null}
      signInPath={chatGPTSignInPath(path)}
      signOutPath={chatGPTSignOutPath('/')}
    />
  );
}
