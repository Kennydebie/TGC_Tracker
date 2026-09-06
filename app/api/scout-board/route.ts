import { getD1 } from '@/db';
import type { ScoutResearchImportStatus } from '@/lib/community';
import { listScoutResearchDashboard } from '@/lib/repositories/scout-ingestion';
import { getRequestUser } from '@/lib/server/user';

export const dynamic = 'force-dynamic';

const emptyImportStatus: ScoutResearchImportStatus = {
  lastSuccessfulImportAt: null,
  lastAttemptAt: null,
  lastRunStatus: null,
  actionableError: null,
  latestRun: null,
};

export async function GET(request: Request) {
  const user = getRequestUser(request);
  const data = user
    ? await listScoutResearchDashboard(getD1(), user)
    : {
        findings: [],
        roadmapFindings: [],
        roadmapCoverageLimited: false,
        importStatus: emptyImportStatus,
      };
  return Response.json(
    { data },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
