const languageAliases: Record<string, string> = {
  en: 'English',
  english: 'English',
  engels: 'English',
  englisch: 'English',
  nl: 'Dutch',
  dutch: 'Dutch',
  nederlands: 'Dutch',
  niederländisch: 'Dutch',
  de: 'German',
  german: 'German',
  deutsch: 'German',
  duits: 'German',
  fr: 'French',
  french: 'French',
  français: 'French',
  frans: 'French',
};

export function normaliseLanguage(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return languageAliases[value.trim().toLowerCase()] ?? value.trim();
}

export function parseQuantity(title: string): {
  quantity: number | null;
  confidence: number;
  reason: string;
} {
  const patterns = [
    {
      regex: /\b(?:case|doos)\s+(?:of|van)?\s*(\d{1,3})\b/i,
      confidence: 0.92,
      reason: 'explicit case quantity',
    },
    {
      regex: /\b(\d{1,3})\s*[x×]\b/i,
      confidence: 0.95,
      reason: 'quantity prefix',
    },
    {
      regex: /\b(?:lot|bundle|set)\s+(?:of|van)?\s*(\d{1,3})\b/i,
      confidence: 0.84,
      reason: 'bundle quantity',
    },
  ];
  for (const pattern of patterns) {
    const match = title.match(pattern.regex);
    if (match)
      return {
        quantity: Number(match[1]),
        confidence: pattern.confidence,
        reason: pattern.reason,
      };
  }
  return { quantity: null, confidence: 0.35, reason: 'quantity not explicit' };
}

export function detectMisleadingTitle(title: string): string[] {
  const lower = title.toLowerCase();
  const flags: string[] = [];
  if (/\b(empty|leeg|box only|verpakking|packaging only)\b/.test(lower))
    flags.push('empty_packaging');
  if (/\b(digital|proxy|replica|custom|orica)\b/.test(lower))
    flags.push('non_standard_product');
  if (/\b(read|lees|beschreibung beachten|voir description)\b/.test(lower))
    flags.push('description_qualifier');
  if (/\b(damaged|beschadigd|defekt|poor)\b/.test(lower))
    flags.push('condition_warning');
  return flags;
}

export function titleTokens(title: string): string[] {
  return [
    ...new Set(
      title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter((token) => token.length > 1),
    ),
  ];
}
