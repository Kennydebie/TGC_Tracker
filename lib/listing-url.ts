const EXACT_HOSTS: Record<string, Set<string>> = {
  ebay: new Set([
    'www.ebay.com',
    'www.ebay.nl',
    'www.ebay.de',
    'www.ebay.be',
    'www.ebay.fr',
    'www.ebay.it',
    'www.ebay.es',
    'www.ebay.co.uk',
  ]),
  marktplaats: new Set(['www.marktplaats.nl']),
  'cardmarket-public': new Set(['www.cardmarket.com']),
};

export function validateSourceListingUrl(
  sourceMarketplace: string,
  value: string,
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Listing URL is invalid');
  }
  if (url.protocol !== 'https:') throw new Error('Listing URL must use HTTPS');
  const allowed = EXACT_HOSTS[sourceMarketplace];
  if (!allowed?.has(url.hostname.toLowerCase()))
    throw new Error(
      `Listing URL host is not allowlisted for ${sourceMarketplace}`,
    );
  url.username = '';
  url.password = '';
  url.hash = '';
  return url;
}

export function isSafeSourceListingUrl(
  sourceMarketplace: string,
  value: string,
): boolean {
  try {
    validateSourceListingUrl(sourceMarketplace, value);
    return true;
  } catch {
    return false;
  }
}
