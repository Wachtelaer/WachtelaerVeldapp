// Shared Wachtelaer house style for the PDF backups — logo, colors, and a
// consistent header/section/footer layout. Copied identically into
// backup-opmetingen, backup-werfrapporten and backup-formulieren since
// each script runs standalone, outside any shared build.

const path = require('path');

const KLEUR_DONKER = '#393536';
const KLEUR_ACCENT = '#f9ad0b';
const KLEUR_GRIJS = '#6a6768';

const LOGO_PATH = path.join(__dirname, 'wachtelaer-logo.png');

const BEDRIJF = {
  naam: 'Wachtelaer BVBA',
  adres: 'Désiré De Bodtkaai 25, 9400 Ninove',
  tel: '054 33 25 19',
  email: 'info@geert-wachtelaer.be',
  web: 'www.geert-wachtelaer.be',
  btw: 'BE0464608125',
};

/** Logo + document title + orange rule. Leaves doc.y just below the rule. */
function tekenHeader(doc, documentTitel, ondertitel) {
  const breedte = doc.page.width;
  doc.image(LOGO_PATH, 50, 42, { width: 165 });

  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(KLEUR_DONKER)
    .text(documentTitel.toUpperCase(), 50, 48, { width: breedte - 100, align: 'right' });

  if (ondertitel) {
    doc
      .font('Helvetica')
      .fontSize(10.5)
      .fillColor(KLEUR_GRIJS)
      .text(ondertitel, 50, 68, { width: breedte - 100, align: 'right' });
  }

  doc.moveTo(50, 108).lineTo(breedte - 50, 108).lineWidth(2.5).strokeColor(KLEUR_ACCENT).stroke();
  doc.y = 124;
}

/** Thin orange rule + centered company details. Draw on every page at the end. */
function tekenFooter(doc) {
  const breedte = doc.page.width;
  const hoogte = doc.page.height;
  const y = hoogte - 55;

  // Text this close to the physical bottom edge would otherwise trigger
  // pdfkit's auto-pagination (it thinks the footer overflows the content
  // margin and starts a fresh page for it) — disable that just for this draw.
  const origineleOndermarge = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  doc.moveTo(50, y - 10).lineTo(breedte - 50, y - 10).lineWidth(0.75).strokeColor(KLEUR_ACCENT).stroke();
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(KLEUR_GRIJS)
    .text(
      `${BEDRIJF.naam}  |  ${BEDRIJF.adres}  |  T ${BEDRIJF.tel}  |  ${BEDRIJF.email}  |  ${BEDRIJF.web}  |  BTW ${BEDRIJF.btw}`,
      50,
      y,
      { width: breedte - 100, align: 'center' }
    );

  doc.page.margins.bottom = origineleOndermarge;
}

/** Adds the footer to every page already drawn (call once, right before doc.end()). */
function afwerken(doc) {
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    tekenFooter(doc);
  }
}

/** An orange tab + bold section heading, e.g. "Klant" or "Uitgevoerd". */
function sectieTitel(doc, tekst) {
  if (doc.y > 100) doc.moveDown(0.8);
  const y = doc.y;
  doc.rect(50, y + 1, 4, 14).fill(KLEUR_ACCENT);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(KLEUR_DONKER).text(tekst, 60, y);
  doc.moveDown(0.5);
  doc.font('Helvetica').fillColor(KLEUR_DONKER).fontSize(10);
}

/** A "Label: waarde" line with the label in muted grey, value in dark. */
function metaRegel(doc, label, waarde) {
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(KLEUR_GRIJS).text(`${label}: `, { continued: true });
  doc.font('Helvetica').fontSize(9.5).fillColor(KLEUR_DONKER).text(String(waarde));
}

/**
 * A bordered box of bulleted "label — waarde" rows, values aligned in a
 * fixed column so every row lines up. `items` is an array of [label, waarde]
 * pairs. Auto-sizes to fit wrapped values and starts a fresh page if the box
 * wouldn't fit on the current one.
 */
function puntenKader(doc, items, opts = {}) {
  const linksX = 50;
  const breedte = doc.page.width - 100;
  const labelBreedte = opts.labelBreedte || 150;
  const bulletBreedte = 14;
  const paddingH = 12;
  const paddingV = 10;
  const waardeX = linksX + paddingH + bulletBreedte + labelBreedte;
  const waardeBreedte = breedte - paddingH * 2 - bulletBreedte - labelBreedte;

  doc.font('Helvetica').fontSize(9.5);
  const regelHoogtes = items.map(([, waarde]) =>
    Math.max(14, doc.heightOfString(String(waarde ?? '—'), { width: waardeBreedte }) + 4)
  );
  const totaleHoogte = paddingV * 2 + regelHoogtes.reduce((a, b) => a + b, 0);

  if (doc.y + totaleHoogte > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }

  const boxY = doc.y;
  doc.rect(linksX, boxY, breedte, totaleHoogte).lineWidth(1).strokeColor(KLEUR_ACCENT).stroke();

  let y = boxY + paddingV;
  items.forEach(([label, waarde], i) => {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(KLEUR_ACCENT).text('•', linksX + paddingH, y, { width: bulletBreedte });
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(KLEUR_GRIJS)
      .text(label, linksX + paddingH + bulletBreedte, y, { width: labelBreedte });
    doc.font('Helvetica').fontSize(9.5).fillColor(KLEUR_DONKER).text(String(waarde ?? '—'), waardeX, y, { width: waardeBreedte });
    y += regelHoogtes[i];
  });

  doc.y = boxY + totaleHoogte + 12;
}

module.exports = {
  KLEUR_DONKER,
  KLEUR_ACCENT,
  KLEUR_GRIJS,
  BEDRIJF,
  tekenHeader,
  tekenFooter,
  afwerken,
  sectieTitel,
  metaRegel,
  puntenKader,
};
