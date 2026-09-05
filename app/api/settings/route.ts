import { getD1 } from '@/db';
import {
  getUserSettings,
  saveUserSettings,
  type UserSettingsInput,
} from '@/lib/repositories/user-state';
import { rejectCrossSiteMutation } from '@/lib/security';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';
import { validateUserSettings } from '@/lib/workflow-integrity';

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  return Response.json({ data: await getUserSettings(getD1(), user) });
}

export async function PUT(request: Request) {
  const blocked = rejectCrossSiteMutation(request);
  if (blocked) return blocked;
  const user = getRequestUser(request);
  if (!user) return authenticationRequired();
  const body = (await request.json()) as Partial<UserSettingsInput>;
  const rawNumeric = [
    body.localRadiusKm,
    body.laborRate,
    body.requiredRoi,
    body.requiredProfit,
  ];
  const numericSettings = {
    localRadiusKm: Number(body.localRadiusKm),
    laborRate: Number(body.laborRate),
    requiredRoi: Number(body.requiredRoi),
    requiredProfit: Number(body.requiredProfit),
  };
  const validationErrors = validateUserSettings(numericSettings);
  if (
    !body.country ||
    body.currency !== 'EUR' ||
    rawNumeric.some((value) => typeof value !== 'number') ||
    Object.keys(validationErrors).length
  )
    return Response.json(
      { error: 'Invalid settings payload', fields: validationErrors },
      { status: 400 },
    );
  const input: UserSettingsInput = {
    country: body.country.slice(0, 2).toUpperCase(),
    postcode: String(body.postcode ?? '').slice(0, 20),
    currency: 'EUR',
    ...numericSettings,
  };
  return Response.json({ data: await saveUserSettings(getD1(), user, input) });
}
