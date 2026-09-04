export function rejectCrossSiteMutation(request: Request): Response | null {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  const expected = new URL(request.url).origin;
  if (origin && origin !== expected) {
    return Response.json(
      { error: 'Cross-site mutation blocked' },
      { status: 403 },
    );
  }
  if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) {
    return Response.json(
      { error: 'Cross-site mutation blocked' },
      { status: 403 },
    );
  }
  return null;
}

export function safeRelativePath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, 'https://app.local');
    return url.origin === 'https://app.local'
      ? `${url.pathname}${url.search}${url.hash}`
      : '/';
  } catch {
    return '/';
  }
}
