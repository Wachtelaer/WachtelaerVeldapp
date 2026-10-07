/** Loose klant/werf-naam matching tussen Outsmart-dossiers en onze eigen
 *  opmetingen/werven — er is geen gedeelde id, dus dit is altijd een
 *  best-effort gok, nooit een harde koppeling. */
export function normaliseerNaam(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** True als de twee namen elkaar in genormaliseerde vorm bevatten. */
export function lijktOpzelfde(a: string, b: string): boolean {
  const na = normaliseerNaam(a);
  const nb = normaliseerNaam(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

export function vindBesteMatch<T>(
  dossierNamen: string[],
  items: T[],
  naamVan: (item: T) => string
): T | null {
  for (const item of items) {
    const naam = naamVan(item);
    if (dossierNamen.some((dn) => lijktOpzelfde(dn, naam))) return item;
  }
  return null;
}
