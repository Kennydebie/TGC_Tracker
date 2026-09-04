import { getD1 } from '@/db';
import {
  getAlertRule,
  saveAlertRule,
  type AlertRuleInput,
} from '@/lib/repositories/user-state';
import { rejectCrossSiteMutation } from '@/lib/security';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  return Response.json({ data: await getAlertRule(getD1(), user) });
}

export async function PUT(request: Request) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  const body = (await request.json()) as Partial<AlertRuleInput>;
  const numeric = [
    body.matchConfidence,
    body.minimumProfit,
    body.minimumRoi,
    body.minimumProfitPerHour,
    body.maximumHoldingDays,
    body.maximumRiskScore,
  ];
  if (numeric.some((value) => !Number.isFinite(value)) || !body.minimumGrade)
    return Response.json({ error: 'Invalid alert rule' }, { status: 400 });
  const input: AlertRuleInput = {
    matchConfidence: Math.max(0, Math.min(100, Number(body.matchConfidence))),
    minimumProfit: Math.max(0, Number(body.minimumProfit)),
    minimumRoi: Math.max(0, Math.min(5, Number(body.minimumRoi))),
    minimumProfitPerHour: Math.max(0, Number(body.minimumProfitPerHour)),
    minimumGrade: ['A', 'B', 'C'].includes(body.minimumGrade)
      ? body.minimumGrade
      : 'B',
    maximumHoldingDays: Math.max(1, Number(body.maximumHoldingDays)),
    maximumRiskScore: Math.max(0, Math.min(100, Number(body.maximumRiskScore))),
  };
  return Response.json({ data: await saveAlertRule(getD1(), user, input) });
}
