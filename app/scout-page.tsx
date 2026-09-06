import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from '@/app/chatgpt-auth';
import { ScoutApp } from '@/components/scout-app';
import { getD1 } from '@/db';
import type { ScoutResearchImportStatus } from '@/lib/community';
import { listProductionDeals } from '@/lib/repositories/scans';
import { listScoutResearchDashboard } from '@/lib/repositories/scout-ingestion';

const emptyImportStatus: ScoutResearchImportStatus = {
  lastSuccessfulImportAt: null,
  lastAttemptAt: null,
  lastRunStatus: null,
  actionableError: null,
  latestRun: null,
};

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
  const initialResearch = user
    ? await listScoutResearchDashboard(getD1(), {
        id: user.userId,
        email: user.email,
        displayName: user.displayName,
      }).catch(() => ({
        findings: [],
        roadmapFindings: [],
        roadmapCoverageLimited: false,
        importStatus: {
          ...emptyImportStatus,
          actionableError:
            'Scout Board storage is temporarily unavailable. Confirm the latest database migration and refresh.',
        },
      }))
    : {
        findings: [],
        roadmapFindings: [],
        roadmapCoverageLimited: false,
        importStatus: emptyImportStatus,
      };
  const basePath = section === 'dashboard' ? '/' : `/${section}`;
  const query = new URLSearchParams(initialSearchParams).toString();
  const path = query ? `${basePath}?${query}` : basePath;
  return (
    <ScoutApp
      initialSection={section}
      initialDealId={dealId}
      initialDeals={initialDeals}
      initialResearchFindings={initialResearch.findings}
      initialRoadmapFindings={initialResearch.roadmapFindings}
      initialRoadmapCoverageLimited={initialResearch.roadmapCoverageLimited}
      initialResearchImportStatus={initialResearch.importStatus}
      initialSearchParams={initialSearchParams}
      user={user ? { displayName: user.displayName, email: user.email } : null}
      signInPath={chatGPTSignInPath(path)}
      signOutPath={chatGPTSignOutPath('/')}
    />
  );
}
