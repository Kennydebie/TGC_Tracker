export type CardmarketPriceRow = {
  productId: string;
  average: number | null;
  trend: number | null;
  low: number | null;
};

export async function* parseCardmarketPriceGuide(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<CardmarketPriceRow> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let headers: string[] | null = null;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = done ? '' : (lines.pop() ?? '');
    for (const line of lines) {
      if (!line.trim()) continue;
      const cells = line
        .split(',')
        .map((cell) => cell.replace(/^"|"$/g, '').trim());
      if (!headers) {
        headers = cells;
        continue;
      }
      const row = Object.fromEntries(
        headers.map((header, index) => [header, cells[index] ?? '']),
      );
      const productId = row.idProduct ?? row.productId;
      if (!productId) continue;
      const number = (key: string) =>
        row[key] && Number.isFinite(Number(row[key])) ? Number(row[key]) : null;
      yield {
        productId,
        average: number('avg'),
        trend: number('trend'),
        low: number('low'),
      };
    }
    if (done) break;
  }
}

export function validateOfficialCardmarketUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !['downloads.s3.cardmarket.com', 'www.cardmarket.com'].includes(
      url.hostname,
    )
  )
    throw new Error('Cardmarket download URL is not allowlisted');
  return url;
}
