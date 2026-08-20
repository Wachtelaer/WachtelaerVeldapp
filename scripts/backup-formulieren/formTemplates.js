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
};

const VELD_LABELS = {
  onderhoud_airco: {
    merk_model: { label: 'Merk/model' },
    serienummer: { label: 'Serienummer' },
    koelmiddel: { label: 'Koelmiddel' },
    druk: { label: 'Gemeten druk', eenheid: 'bar' },
    filters: { label: 'Filters' },
    buitenunit: { label: 'Buitenunit gereinigd' },
    binnenunit: { label: 'Binnenunit gereinigd' },
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
    debiet: { label: 'Debiet gemeten', eenheid: 'm³/h' },
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
    merk_model: { label: 'Merk/model binnen- en buitenunit' },
    serienummers: { label: 'Serienummers' },
    koelmiddel: { label: 'Koelmiddel' },
    fabrieksvulling: { label: 'Fabrieksvulling', eenheid: 'kg' },
    bijgevuld: { label: 'Bijgevulde hoeveelheid', eenheid: 'kg' },
    elektrisch: { label: 'Elektrische voeding gecontroleerd' },
    vacuum: { label: 'Vacuümtest uitgevoerd' },
    werkdruk: { label: 'Werkdruk gemeten', eenheid: 'bar' },
    werking: { label: 'Werking getest' },
    uitleg: { label: 'Uitleg gegeven aan klant' },
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
