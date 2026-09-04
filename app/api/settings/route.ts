import { getD1 } from '@/db';
import {
  getUserSettings,
  saveUserSettings,
  type UserSettingsInput,
} from '@/lib/repositories/user-state';
import { rejectCrossSiteMutation } from '@/lib/security';
import { authenticationRequired, getRequestUser } from '@/lib/server/user';

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
  if (
    !body.country ||
    body.currency !== 'EUR' ||
    !Number.isFinite(body.localRadiusKm) ||
    !Number.isFinite(body.laborRate) ||
    !Number.isFinite(body.requiredRoi) ||
    !Number.isFinite(body.requiredProfit)
  )
    return Response.json(
      { error: 'Invalid settings payload' },
      { status: 400 },
    );
  const input: UserSettingsInput = {
    country: body.country.slice(0, 2).toUpperCase(),
    postcode: String(body.postcode ?? '').slice(0, 20),
    currency: 'EUR',
    localRadiusKm: Math.max(1, Math.min(500, Number(body.localRadiusKm))),
    laborRate: Math.max(0, Math.min(500, Number(body.laborRate))),
    requiredRoi: Math.max(0, Math.min(5, Number(body.requiredRoi))),
    requiredProfit: Math.max(0, Math.min(100_000, Number(body.requiredProfit))),
  };
  return Response.json({ data: await saveUserSettings(getD1(), user, input) });
}
