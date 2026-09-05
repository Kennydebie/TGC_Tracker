export type ProductIdentity = {
  id: string;
  canonicalName: string;
  game: 'Pokémon' | 'Riftbound';
  setName: string;
  productType: string;
  language: 'Unknown';
  requiredTokens: readonly string[];
  aliases: readonly string[];
};

/**
 * Curated product identities used to match marketplace titles.
 *
 * This catalog deliberately contains no listings, sellers, prices, sale
 * evidence, valuations, or profitability assumptions. Those facts must come
 * from a production source and its stored observations.
 */
export const PRODUCT_IDENTITIES: readonly ProductIdentity[] = [
  {
    id: 'pokemon-prismatic-evolutions-etb',
    canonicalName: 'Prismatic Evolutions Elite Trainer Box',
    game: 'Pokémon',
    setName: 'Prismatic Evolutions',
    productType: 'Elite trainer box',
    language: 'Unknown',
    requiredTokens: ['prismatic', 'evolutions'],
    aliases: [
      'Prismatic Evolutions ETB',
      'Pokemon Prismatic Evolutions Elite Trainer Box',
    ],
  },
  {
    id: 'pokemon-destined-rivals-booster-box',
    canonicalName: 'Destined Rivals Booster Box',
    game: 'Pokémon',
    setName: 'Destined Rivals',
    productType: 'Booster box',
    language: 'Unknown',
    requiredTokens: ['destined', 'rivals'],
    aliases: ['Pokemon Destined Rivals Booster Box'],
  },
  {
    id: 'pokemon-scarlet-violet-151-booster-bundle',
    canonicalName: 'Scarlet & Violet—151 Booster Bundle',
    game: 'Pokémon',
    setName: 'Scarlet & Violet—151',
    productType: 'Booster bundle',
    language: 'Unknown',
    requiredTokens: ['151', 'bundle'],
    aliases: [
      'Pokemon 151 Booster Bundle',
      'Pokemon 151 Booster Bundle Display',
    ],
  },
  {
    id: 'riftbound-origins-booster-display',
    canonicalName: 'Riftbound Origins Booster Display',
    game: 'Riftbound',
    setName: 'Origins',
    productType: 'Booster display',
    language: 'Unknown',
    requiredTokens: ['riftbound', 'origins'],
    aliases: ['Riftbound Origins Display'],
  },
  {
    id: 'riftbound-spiritforged-booster-display',
    canonicalName: 'Riftbound Spiritforged Booster Display',
    game: 'Riftbound',
    setName: 'Spiritforged',
    productType: 'Booster display',
    language: 'Unknown',
    requiredTokens: ['riftbound', 'spiritforged'],
    aliases: ['Riftbound Spiritforged Display'],
  },
];

export function getProductIdentity(id: string): ProductIdentity | null {
  return PRODUCT_IDENTITIES.find((identity) => identity.id === id) ?? null;
}
