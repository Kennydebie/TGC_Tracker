import { getD1 } from '@/db';
import {
  getAlertRule,
  saveAlertRule,
  type AlertRuleInput,
} from '@/lib/repositories/user-state';
import { rejectCrossSiteMutation } from '@/lib/security';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';
import { validateAlertRule } from '@/lib/workflow-integrity';

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
  const rawNumeric = [
    body.matchConfidence,
    body.minimumProfit,
    body.minimumRoi,
    body.minimumProfitPerHour,
    body.maximumHoldingDays,
    body.maximumRiskScore,
  ];
  const numeric = {
    matchConfidence: Number(body.matchConfidence),
    minimumProfit: Number(body.minimumProfit),
    minimumRoi: Number(body.minimumRoi),
    minimumProfitPerHour: Number(body.minimumProfitPerHour),
    maximumHoldingDays: Number(body.maximumHoldingDays),
    maximumRiskScore: Number(body.maximumRiskScore),
  };
  const validationErrors = validateAlertRule(numeric);
  if (
    Object.keys(validationErrors).length ||
    rawNumeric.some((value) => typeof value !== 'number') ||
    !body.minimumGrade ||
    !['A', 'B', 'C'].includes(body.minimumGrade)
  )
    return Response.json(
      { error: 'Invalid alert rule', fields: validationErrors },
      { status: 400 },
    );
  const input: AlertRuleInput = {
    ...numeric,
    minimumGrade: body.minimumGrade,
  };
  return Response.json({ data: await saveAlertRule(getD1(), user, input) });
}
