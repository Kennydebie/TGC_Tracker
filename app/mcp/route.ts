import { getD1 } from '@/db';
import { createScoutMcpHandler } from '@/lib/mcp/handler';
import {
  getScoutIngestionState,
  saveScoutFindings,
} from '@/lib/repositories/scout-ingestion';
import { getRequestUser } from '@/lib/server/user';

export const dynamic = 'force-dynamic';

const handle = createScoutMcpHandler({
  authenticate: getRequestUser,
  resourceMetadataUrl:
    'https://tcg-scout-arcane-market-hunter.xorqe.chatgpt.site/.well-known/oauth-protected-resource',
  createService: (user) => ({
    getIngestionState: (options) =>
      getScoutIngestionState(getD1(), user, options),
    saveFindings: (input) => saveScoutFindings(getD1(), user, input),
  }),
});

export { handle as DELETE, handle as GET, handle as POST };
