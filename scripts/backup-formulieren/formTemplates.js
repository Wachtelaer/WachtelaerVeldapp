// Plain-JS mirror of ../../lib/formTemplates.ts, trimmed to what the PDF
// renderer needs (labels + units for a readable printout). Keep in sync
// by hand if fields change — this script runs standalone, outside the
// Expo/TypeScript build.

const FORM_NAMES = {
  onderhoud_airco: 'Onderhoud airco',
  onderhoud_ventilatie: 'Onderhoud ventilatie',
  recuperatie_koelmiddel: 'Recuperatie koelmiddel',
  druktest_leidingen: 'Druktest leidingen',
  opstart_airco: 'Opstart airco',
  opstart_warmtepomp: 'Opstart lucht/water warmtepomp',
};

const VELD_LABELS = {
  onderhoud_airco: {
    buiten_merk: { label: 'Buitenunit — merk' },
    buiten_type: { label: 'Buitenunit — type' },
    buiten_serienummer: { label: 'Buitenunit — serienummer' },
    buiten_koelmiddel: { label: 'Buitenunit — koelmiddel' },
    buiten_hoeveelheid: { label: 'Buitenunit — hoeveelheid koelmiddel', eenheid: 'kg' },
    lekcontrole: { label: 'Controle op lekkage' },
    buitenunit: { label: 'Buitenunit gereinigd' },
    binnenunits: { label: 'Binnenunits (locatie/type)' },
    binnenunit: { label: 'Binnenunits gereinigd' },
    filters: { label: 'Filters' },
    afvoer: { label: 'Afvoer gecontroleerd' },
    elektrisch: { label: 'Elektrische aansluitingen gecontroleerd' },
    werking: { label: 'Werking getest' },
    gebreken: { label: 'Vastgestelde gebreken' },
    volgend_onderhoud: { label: 'Volgend onderhoud' },
  },
  onderhoud_ventilatie: {
    systeem: { label: 'Type systeem' },
    filters: { label: 'Filters' },
    ventilatoren: { label: 'Ventilatoren gecontroleerd' },
    kanalen: { label: 'Kanalen gereinigd' },
    geluid: { label: 'Abnormaal geluid' },
    gebreken: { label: 'Vastgestelde gebreken' },
    volgend_onderhoud: { label: 'Volgend onderhoud' },
  },
  recuperatie_koelmiddel: {
    koelmiddel: { label: 'Koelmiddel' },
    hoeveelheid: { label: 'Hoeveelheid gerecupereerd', eenheid: 'kg' },
    herkomst: { label: 'Herkomst / toestel' },
    reden: { label: 'Reden' },
    cilindernummer: { label: 'Cilindernummer' },
    certificaat: { label: 'Technicus-certificaatnummer' },
    lekdetectie: { label: 'Lekdetectie uitgevoerd' },
  },
  druktest_leidingen: {
    type_leiding: { label: 'Type leiding' },
    medium: { label: 'Testmedium' },
    testdruk: { label: 'Testdruk', eenheid: 'bar' },
    testduur: { label: 'Testduur', eenheid: 'minuten' },
    resultaat: { label: 'Resultaat' },
    lek_locatie: { label: 'Locatie lek (indien gefaald)' },
    manometer: { label: 'Gebruikte manometer' },
  },
  opstart_airco: {
    outdoor_merk: { label: 'Outdoor — merk' },
    outdoor_model: { label: 'Outdoor — model' },
    outdoor_serienummer: { label: 'Outdoor — serienummer' },
    indoor_units: {
      label: 'Indoor-units',
      subLabels: { merk: 'Merk', model: 'Model', serienummer: 'Serienummer', locatie: 'Locatie' },
    },
    testdruk_systeem: { label: 'Testdruk systeem', eenheid: 'bar' },
    duur_vacuum: { label: 'Duur vacuüm', eenheid: 'min' },
    diameter_pers: { label: 'Diameter pers' },
    diameter_zuig: { label: 'Diameter zuig' },
    leidinglengte: { label: 'Totale leidinglengte', eenheid: 'm' },
    type_gas: { label: 'Type gas' },
    extra_vulling: { label: 'Extra vulling', eenheid: 'g' },
    werkspanning: { label: 'Werkspanning' },
    afzekering: { label: 'Afzekering' },
  },
  opstart_warmtepomp: {
    outdoor_merk: { label: 'Buitenunit — merk' },
    outdoor_model: { label: 'Buitenunit — model' },
    outdoor_serienummer: { label: 'Buitenunit — serienummer' },
    type_systeem: { label: 'Type systeem' },
    indoor_merk: { label: 'Binnenmodule — merk' },
    indoor_model: { label: 'Binnenmodule — model' },
    vermogen: { label: 'Vermogen', eenheid: 'kW' },
    type_gas: { label: 'Type koelmiddel' },
    testdruk_systeem: { label: 'Testdruk koelcircuit', eenheid: 'bar' },
    duur_vacuum: { label: 'Duur vacuüm', eenheid: 'min' },
    leidinglengte: { label: 'Leidinglengte koelcircuit', eenheid: 'm' },
    extra_vulling: { label: 'Extra koelmiddelvulling', eenheid: 'g' },
    waterdruk: { label: 'Waterdruk verwarmingscircuit', eenheid: 'bar' },
    aanvoertemperatuur: { label: 'Aanvoertemperatuur', eenheid: '°C' },
    retourtemperatuur: { label: 'Retourtemperatuur', eenheid: '°C' },
    glycol: { label: 'Glycol toegevoegd' },
    buffervat: { label: 'Buffervat' },
    type_afgifte: { label: 'Type afgifte' },
    sanitair_warm_water: { label: 'Sanitair warm water via warmtepomp' },
    stooklijn: { label: 'Stooklijn ingesteld' },
    werkspanning: { label: 'Werkspanning' },
    afzekering: { label: 'Afzekering' },
    werking: { label: 'Werking getest' },
  },
};

function formNaam(key) {
  return FORM_NAMES[key] || key;
}

/** Returns [{ label, waarde }] in a stable, readable order for the PDF. */
function formatAntwoorden(formKey, antwoorden) {
  const veldLabels = VELD_LABELS[formKey] || {};
  return Object.entries(veldLabels)
    .map(([id, meta]) => {
      const raw = antwoorden ? antwoorden[id] : undefined;
      if (raw === undefined || raw === null || raw === '') return null;

      // A repeating group (e.g. one row per indoor-unit, each with its
      // own merk/model/serienummer/locatie) — render as "#1 Merk: X, ...".
      if (meta.subLabels) {
        if (!Array.isArray(raw)) return null;
        const rijen = raw
          .map((rij, i) => {
            const velden = Object.entries(meta.subLabels)
              .map(([subId, subLabel]) => (rij && rij[subId] ? `${subLabel}: ${rij[subId]}` : null))
              .filter(Boolean);
            return velden.length ? `#${i + 1} ${velden.join(', ')}` : null;
          })
          .filter(Boolean);
        if (rijen.length === 0) return null;
        return { label: meta.label, waarde: rijen.join('  |  ') };
      }

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

module.exports = { formNaam, formatAntwoorden };
