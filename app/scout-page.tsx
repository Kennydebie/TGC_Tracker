import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from '@/app/chatgpt-auth';
import { ScoutApp } from '@/components/scout-app';

export async function ScoutPage({
  section = 'dashboard',
  dealId,
  initialSearchParams = {},
}: {
  section?: string;
  dealId?: string;
  initialSearchParams?: Record<string, string>;
}) {
  const user = await getChatGPTUser();
  const basePath = section === 'dashboard' ? '/' : `/${section}`;
  const query = new URLSearchParams(initialSearchParams).toString();
  const path = query ? `${basePath}?${query}` : basePath;
  return (
    <ScoutApp
      initialSection={section}
      initialDealId={dealId}
      initialSearchParams={initialSearchParams}
      user={user ? { displayName: user.displayName, email: user.email } : null}
      signInPath={chatGPTSignInPath(path)}
      signOutPath={chatGPTSignOutPath('/')}
    />
  );
}
