const allowedDomains = new Set(['www.ebay.nl', 'www.cardmarket.com']);
const tokenField = document.querySelector('#token');
const result = document.querySelector('#result');

function decodePayload(token) {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'v1')
    throw new Error('Unsupported or unsigned token format');
  if (!/^[A-Za-z0-9_-]+$/.test(parts[1]))
    throw new Error('Invalid token payload');
  if (!/^[A-Za-z0-9_-]{43}$/.test(parts[2]))
    throw new Error('Invalid token signature');
  const base64 = parts[1]
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(base64), (character) =>
    character.charCodeAt(0),
  );
  const payload = JSON.parse(new TextDecoder().decode(bytes));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('Invalid token payload');
  return payload;
}

function renderIntent(intent) {
  const heading = document.createElement('strong');
  heading.textContent = 'Intent ready for review';
  const product = document.createElement('p');
  product.textContent = intent.expectedTitle;
  const economics = document.createElement('p');
  economics.textContent = `Quantity ${intent.quantity} · expected €${intent.expectedPrice.toFixed(2)}`;
  const warning = document.createElement('p');
  warning.textContent =
    'User confirmation is still required. This build stops before cart or checkout.';
  result.replaceChildren(heading, product, economics, warning);
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
    if (!Number.isFinite(intent.expectedPrice) || intent.expectedPrice <= 0)
      throw new Error('Invalid expected price');
    if (
      typeof intent.expectedTitle !== 'string' ||
      !intent.expectedTitle.trim()
    )
      throw new Error('Missing product identity');
    result.hidden = false;
    renderIntent(intent);
    await chrome.tabs.create({ url: `https://${intent.domain}/` });
  } catch (error) {
    result.hidden = false;
    result.textContent =
      error instanceof Error ? error.message : 'Validation failed';
  }
});
