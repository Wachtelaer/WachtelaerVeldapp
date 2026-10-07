/** Haversine-afstand in km tussen twee coördinaten. */
export function afstandInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface NabijDossier<T> {
  dossier: T;
  afstandKm: number;
}

/** Vindt andere dossiers met coördinaten binnen `maxKm` van dit dossier,
 *  dichtstbij eerst — gebruikt om een opmeting/afspraak te groeperen met
 *  wat al in dezelfde buurt gepland staat. */
export function vindNabijeDossiers<T extends { id: string; latitude: number | null; longitude: number | null }>(
  dossier: T,
  alle: T[],
  maxKm = 15
): NabijDossier<T>[] {
  if (dossier.latitude === null || dossier.longitude === null) return [];
  return alle
    .filter((d) => d.id !== dossier.id && d.latitude !== null && d.longitude !== null)
    .map((d) => ({ dossier: d, afstandKm: afstandInKm(dossier.latitude!, dossier.longitude!, d.latitude!, d.longitude!) }))
    .filter((m) => m.afstandKm <= maxKm)
    .sort((a, b) => a.afstandKm - b.afstandKm);
}
