/**
 * Curated list of African regions and countries for the scout and player forms.
 *
 * Values are lowercase slugs. The list is alphabetically sorted by label.
 */
export const AFRICAN_REGIONS: { label: string; value: string }[] = [
  { label: 'Cameroon', value: 'cameroon' },
  { label: 'Central Africa', value: 'central-africa' },
  { label: "Côte d'Ivoire", value: 'cote-divoire' },
  { label: 'East Africa', value: 'east-africa' },
  { label: 'Egypt', value: 'egypt' },
  { label: 'Ethiopia', value: 'ethiopia' },
  { label: 'Ghana', value: 'ghana' },
  { label: 'Kenya', value: 'kenya' },
  { label: 'Nigeria', value: 'nigeria' },
  { label: 'North Africa', value: 'north-africa' },
  { label: 'Senegal', value: 'senegal' },
  { label: 'South Africa', value: 'south-africa' },
  { label: 'Southern Africa', value: 'southern-africa' },
  { label: 'Tanzania', value: 'tanzania' },
  { label: 'Uganda', value: 'uganda' },
  { label: 'West Africa', value: 'west-africa' },
];

/**
 * Same entries grouped by sub-region for optgroup rendering.
 * Keys are the display labels for each <optgroup>; values are the region entries
 * that belong to that sub-region. All value strings are identical to the flat list
 * above so the contract always receives the unchanged flat region slug.
 */
export const AFRICAN_REGIONS_GROUPED: Record<
  string,
  { label: string; value: string }[]
> = {
  'West Africa': [
    { label: "Côte d'Ivoire", value: 'cote-divoire' },
    { label: 'Ghana', value: 'ghana' },
    { label: 'Nigeria', value: 'nigeria' },
    { label: 'Senegal', value: 'senegal' },
    { label: 'West Africa', value: 'west-africa' },
  ],
  'East Africa': [
    { label: 'East Africa', value: 'east-africa' },
    { label: 'Ethiopia', value: 'ethiopia' },
    { label: 'Kenya', value: 'kenya' },
    { label: 'Tanzania', value: 'tanzania' },
    { label: 'Uganda', value: 'uganda' },
  ],
  'North Africa': [
    { label: 'Egypt', value: 'egypt' },
    { label: 'North Africa', value: 'north-africa' },
  ],
  'Southern Africa': [
    { label: 'South Africa', value: 'south-africa' },
    { label: 'Southern Africa', value: 'southern-africa' },
  ],
  'Central Africa': [
    { label: 'Cameroon', value: 'cameroon' },
    { label: 'Central Africa', value: 'central-africa' },
  ],
};
