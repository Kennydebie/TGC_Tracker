import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from '@/app/chatgpt-auth';
import { ScoutApp } from '@/components/scout-app';

export async function ScoutPage({
  section = 'dashboard',
  dealId,
}: {
  section?: string;
  dealId?: string;
}) {
  const user = await getChatGPTUser();
  const path = section === 'dashboard' ? '/' : `/${section}`;
  return (
    <ScoutApp
      initialSection={section}
      initialDealId={dealId}
      user={user ? { displayName: user.displayName, email: user.email } : null}
      signInPath={chatGPTSignInPath(path)}
      signOutPath={chatGPTSignOutPath('/')}
    />
  );
}
