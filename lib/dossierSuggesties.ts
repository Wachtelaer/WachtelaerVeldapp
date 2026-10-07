import type { Dossier } from '@/lib/api/outsmartPipeline';
import type { OpmetingListItem } from '@/lib/api/opmetingen';
import type { WerfListItem } from '@/lib/api/werven';

export interface Suggestie {
  tekst: string;
  tone: 'info' | 'actie';
}

const AFGEWERKTE_FASES = ['afwerking', 'afgewerkt', 'voltooid', 'done'];

/** Regelgebaseerd "wat is de volgende stap" voorstel per dossier — geen
 *  LLM, enkel duidelijke bedrijfsregels. De agent stelt voor, jij beslist. */
export function voorgesteldeActie(dossier: Dossier, opmeting: OpmetingListItem | null, werf: WerfListItem | null): Suggestie {
  if (dossier.offertes.length === 0) {
    return { tekst: 'Geen gekoppelde offerte gevonden in Outsmart — handmatig nakijken.', tone: 'actie' };
  }

  if (!opmeting) {
    return { tekst: 'Nog geen opmeting in de app — plan een afspraak ter plaatse.', tone: 'actie' };
  }

  if (!werf || werf.rapportCount === 0) {
    return { tekst: 'Opmeting gebeurd — zet de werf op in de app en start de uitvoering.', tone: 'actie' };
  }

  const faseAfgewerkt = AFGEWERKTE_FASES.some((f) => (dossier.fase ?? '').toLowerCase().includes(f));

  if (dossier.facturen.length === 0) {
    return faseAfgewerkt
      ? { tekst: 'Werf afgewerkt, nog niet gefactureerd — factuur opmaken.', tone: 'actie' }
      : { tekst: 'Werf loopt — nog niets gefactureerd.', tone: 'info' };
  }

  return { tekst: 'Gefactureerd — nacalculatie: offerte- vs factuurbedrag vergelijken.', tone: 'info' };
}

export interface Nacalculatie {
  offerteBedrag: number;
  factuurBedrag: number;
  verschil: number;
}

export function berekenNacalculatie(dossier: Dossier): Nacalculatie | null {
  if (dossier.offertes.length === 0 || dossier.facturen.length === 0) return null;
  const offerteBedrag = dossier.offertes.reduce((sum, o) => sum + (Number(o.bedrag) || 0), 0);
  const factuurBedrag = dossier.facturen.reduce((sum, f) => sum + (Number(f.bedrag) || 0), 0);
  return { offerteBedrag, factuurBedrag, verschil: factuurBedrag - offerteBedrag };
}
