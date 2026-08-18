// Plain-JS mirror of ../../lib/salesModules.ts, trimmed to what the PDF
// renderer needs (labels + units for a readable printout). Keep in sync
// by hand if fields change — this script runs standalone, outside the
// Expo/TypeScript build.

const MODULE_NAMES = {
  verwarming: 'Verwarming',
  airco: 'Airco',
  zon: 'Zonnepanelen + batterij',
  sanitair: 'Sanitair',
  ventilatie: 'Ventilatie',
};

const VELD_LABELS = {
  verwarming: {
    type: { label: 'Gewenste oplossing' },
    huidig: { label: 'Huidige installatie' },
    leeftijd: { label: 'Leeftijd toestel', eenheid: 'jaar' },
    opp: { label: 'Te verwarmen oppervlakte', eenheid: 'm²' },
    afgifte: { label: 'Afgifte aanwezig' },
    ww: { label: 'Warm water' },
    epc: { label: 'Isolatie / EPC' },
    schouw: { label: 'Afvoer / schouw' },
    schouwlengte: { label: 'Lengte schouw', eenheid: 'm' },
  },
  airco: {
    ruimtes: { label: 'Aantal ruimtes', eenheid: 'ruimtes' },
    opp: { label: 'Oppervlakte per ruimte', eenheid: 'm²' },
    binnen: { label: 'Type binnenunit' },
    buiten: { label: 'Plaats buitenunit' },
    leiding: { label: 'Leidinglengte per binnenunit' },
    voeding: { label: 'Elektrische voeding' },
    condens: { label: 'Condensafvoer' },
    koelverwarm: { label: 'Ook verwarmen?' },
  },
  zon: {
    dakopp: { label: 'Beschikbaar dakoppervlak', eenheid: 'm²' },
    orient: { label: 'Oriëntatie' },
    dakbed: { label: 'Dakbedekking' },
    helling: { label: 'Dakhelling', eenheid: 'graden' },
    verbruik: { label: 'Jaarverbruik', eenheid: 'kWh' },
    batterij: { label: 'Batterij gewenst' },
    meter: { label: 'Digitale meter' },
    ean: { label: 'EAN-nummer' },
    steiger: { label: 'Steiger of hoogtewerker' },
  },
  sanitair: {
    ruimte: { label: 'Wat wordt aangepakt' },
    toestellen: { label: 'Toestellen' },
    leidingen: { label: 'Leidingwerk' },
    tegels: { label: 'Tegelwerk door' },
    ww: { label: 'Warm water' },
    afvoer: { label: 'Afvoer aanwezig' },
    timing: { label: 'Gewenste timing' },
  },
  ventilatie: {
    systeem: { label: 'Systeem' },
    ruimtes: { label: 'Aantal ruimtes aan te sluiten', eenheid: 'ruimtes' },
    opp: { label: 'Bewoonbare oppervlakte', eenheid: 'm²' },
    unit: { label: 'Plaats unit' },
    kanalen: { label: 'Kanalen' },
    bouw: { label: 'Situatie' },
    doorvoer: { label: 'Doorvoer' },
  },
};

function moduleNaam(key) {
  return MODULE_NAMES[key] || key;
}

/** Returns [{ label, waarde }] in a stable, readable order for the PDF. */
function formatAntwoorden(moduleKey, antwoorden) {
  const veldLabels = VELD_LABELS[moduleKey] || {};
  return Object.entries(veldLabels)
    .map(([id, meta]) => {
      const raw = antwoorden ? antwoorden[id] : undefined;
      if (raw === undefined || raw === null || raw === '') return null;
      const waarde = Array.isArray(raw)
        ? raw
            .filter(Boolean)
            .map((x) => (meta.eenheid ? `${x} ${meta.eenheid}` : String(x)))
            .join(', ')
        : meta.eenheid
          ? `${raw} ${meta.eenheid}`
          : String(raw);
      return { label: meta.label, waarde };
    })
    .filter(Boolean);
}

module.exports = { moduleNaam, formatAntwoorden };
