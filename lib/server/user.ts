export type RequestUser = {
  id: string;
  email: string;
  displayName: string;
};

export function getRequestUser(request: Request): RequestUser | null {
  const id = request.headers.get('oai-authenticated-user-id')?.trim();
  const email = request.headers.get('oai-authenticated-user-email')?.trim();
  if (!id || !email) return null;
  const encodedName = request.headers
    .get('oai-authenticated-user-full-name')
    ?.trim();
  const encoding = request.headers.get(
    'oai-authenticated-user-full-name-encoding',
  );
  let displayName = email;
  if (encodedName && encoding === 'percent-encoded-utf-8') {
    try {
      displayName = decodeURIComponent(encodedName);
    } catch {
      displayName = email;
    }
  }
  return { id: id.slice(0, 200), email: email.slice(0, 320), displayName };
}

export function authenticationRequired(): Response {
  return Response.json(
    { error: 'Sign in with ChatGPT to save personal state.' },
    { status: 401 },
  );
}
