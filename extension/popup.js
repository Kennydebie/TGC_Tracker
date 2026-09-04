const allowedDomains = new Set([
  'demo.invalid',
  'www.ebay.nl',
  'www.cardmarket.com',
]);
const tokenField = document.querySelector('#token');
const result = document.querySelector('#result');

function decodePayload(token) {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || !['demo', 'v1'].includes(parts[0]))
    throw new Error('Unsupported token format');
  const base64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Uint8Array.from(atob(base64), (character) =>
    character.charCodeAt(0),
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}

document.querySelector('#validate').addEventListener('click', async () => {
  try {
    const intent = decodePayload(tokenField.value);
    if (!allowedDomains.has(intent.domain))
      throw new Error('Domain is not allowlisted');
    if (!Number.isFinite(intent.expiresAt) || intent.expiresAt <= Date.now())
      throw new Error('Token expired');
    if (!Number.isInteger(intent.quantity) || intent.quantity < 1)
      throw new Error('Invalid quantity');
    if (
      typeof intent.expectedTitle !== 'string' ||
      !intent.expectedTitle.trim()
    )
      throw new Error('Missing product identity');
    result.hidden = false;
    result.innerHTML = `<strong>Intent validated</strong><p>${intent.expectedTitle}</p><p>Quantity ${intent.quantity} · expected €${Number(intent.expectedPrice).toFixed(2)}</p><p>User confirmation is still required. This build stops before cart or checkout.</p>`;
    if (intent.domain !== 'demo.invalid')
      await chrome.tabs.create({ url: `https://${intent.domain}/` });
  } catch (error) {
    result.hidden = false;
    result.textContent =
      error instanceof Error ? error.message : 'Validation failed';
  }
});
