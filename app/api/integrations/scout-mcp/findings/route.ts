import { getD1 } from '@/db';
import { authenticateScoutIntegration } from '@/lib/repositories/scout-integration';
import { saveScoutFindings } from '@/lib/repositories/scout-ingestion';
import {
  readBoundedJson,
  scoutIntegrationAuthResponse,
  scoutIntegrationJsonResponse,
  ScoutIntegrationAuthenticationError,
  ScoutIntegrationRequestError,
} from '@/lib/scout-integration';
import {
  ScoutIngestionValidationError,
  ScoutRunConflictError,
  type SaveScoutFindingsResult,
} from '@/lib/scout-ingestion';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const db = getD1();
    const { user } = await authenticateScoutIntegration(
      db,
      request,
      'scout:write',
    );
    const input = await readBoundedJson(request, 256 * 1_024);
    return scoutIntegrationJsonResponse({
      data: await saveScoutFindings(db, user, input),
    });
  } catch (error) {
    if (error instanceof ScoutIntegrationAuthenticationError)
      return scoutIntegrationAuthResponse(error);
    if (error instanceof ScoutIntegrationRequestError) {
      const message =
        error.code === 'payload_too_large'
          ? 'Findings batch is too large.'
          : error.code === 'unsupported_media_type'
            ? 'Content-Type must be application/json.'
            : 'Invalid JSON body.';
      return scoutIntegrationJsonResponse(
        { error: message },
        { status: error.status },
      );
    }
    if (error instanceof ScoutIngestionValidationError)
      return scoutIntegrationJsonResponse(
        { error: 'Invalid findings batch.', issues: error.issues.slice(0, 8) },
        { status: 400 },
      );
    if (error instanceof ScoutRunConflictError) {
      const data: SaveScoutFindingsResult = {
        runId: error.runId,
        status: 'failed',
        replayed: false,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        rejected: 0,
        recordIds: [],
        errors: [
          {
            index: null,
            code: 'run_id_conflict',
            path: 'run.id',
            message:
              'This run ID was already used with different input. Use the original payload or a new run ID.',
          },
        ],
      };
      return scoutIntegrationJsonResponse({ data }, { status: 409 });
    }
    return scoutIntegrationJsonResponse(
      { error: 'TCG Scout could not save this import.' },
      { status: 500 },
    );
  }
}
