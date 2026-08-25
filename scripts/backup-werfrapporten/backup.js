require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_DIR = process.env.BACKUP_DIR;
const FOTOS_BUCKET = 'werfrapport-fotos';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !BACKUP_DIR) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or BACKUP_DIR — copy .env.example to .env and fill it in.');
  process.exit(1);
}

// Service role key bypasses RLS — intentional, this backup needs to see
// every werf's rapporten, not just the ones shared with one user.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function slug(text) {
  return (text || 'onbekend')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

function baseFilename(rapport, werfCode) {
  const shortId = rapport.id.slice(0, 8);
  return `${rapport.datum}_${slug(werfCode)}_${shortId}`;
}

/** One subfolder per werf, so everything for one site ends up together. */
function werfMapNaam(werf) {
  return `${slug(werf.code)}_${slug(werf.naam)}`;
}

function formatDeelMet(rapport) {
  const targets = [];
  if (rapport.deel_mgmt) targets.push('management');
  if (rapport.deel_werf) targets.push('werf');
  if (rapport.deel_klant) targets.push('klant');
  return targets.length ? targets.join(', ') : 'niemand';
}

async function writePdf(pdfPath, rapport, werf, auteurNaam, reacties) {
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.pipe(stream);

    doc.fontSize(18).text('Wachtelaer — Werfrapport', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#5d5d60').text(`${werf.code} — ${werf.naam}`);
    doc.text(werf.adres || '—');
    doc.moveDown(1);

    doc.fillColor('#1d1f20').fontSize(10);
    doc.text(`Datum: ${new Date(rapport.datum).toLocaleDateString('nl-BE')}`);
    doc.text(`Opgesteld door: ${auteurNaam}`);
    doc.text(`Weer: ${rapport.weer}`);
    doc.text(`Aanwezig: ${rapport.aanwezig_eigen} eigen, ${rapport.aanwezig_onderaanneming} onderaanneming`);
    doc.text(`Gedeeld met: ${formatDeelMet(rapport)}`);
    doc.moveDown(1);

    doc.fontSize(13).text('Uitgevoerd', { underline: true });
    doc.fontSize(10).text(rapport.uitgevoerd || '—');
    doc.moveDown(1);

    doc.fontSize(13).text('Knelpunt', { underline: true });
    doc.fontSize(10).text(rapport.knelpunt || '—');

    if (reacties.length > 0) {
      doc.moveDown(1);
      doc.fontSize(13).text('Reacties', { underline: true });
      doc.fontSize(10);
      for (const r of reacties) {
        doc.text(`${new Date(r.created_at).toLocaleString('nl-BE')} — ${r.auteurNaam}: ${r.tekst}`);
      }
    }

    doc.end();
  });
}

async function writeFotosZip(zipPath, fotos) {
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const closed = new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    output.on('error', reject);
  });
  archive.pipe(output);

  for (const foto of fotos) {
    const { data, error } = await supabase.storage.from(FOTOS_BUCKET).download(foto.storage_path);
    if (error) {
      console.warn(`  ! kon foto niet downloaden (${foto.storage_path}): ${error.message}`);
      continue;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    archive.append(buffer, { name: foto.label || path.basename(foto.storage_path) });
  }

  await archive.finalize();
  await closed;
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const { data: rapporten, error } = await supabase
    .from('werfrapporten')
    .select('*, werven(code, naam, adres), profiles(full_name)')
    .order('datum', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;

  let pdfsGemaakt = 0;
  let zipsGemaakt = 0;
  let pdfsVerplaatst = 0;
  let zipsVerplaatst = 0;
  let overgeslagen = 0;

  for (const rapport of rapporten ?? []) {
    const werf = rapport.werven ?? { code: 'onbekend', naam: 'Onbekende werf', adres: '' };
    const auteurNaam = rapport.profiles?.full_name ?? 'Onbekend';
    const base = baseFilename(rapport, werf.code);
    const werfDir = path.join(BACKUP_DIR, werfMapNaam(werf));
    // Older runs (from before per-werf folders existed) wrote these flat
    // in BACKUP_DIR — migrate them into the werf folder instead of
    // leaving them scattered at the root.
    const legacyPdfPath = path.join(BACKUP_DIR, `${base}.pdf`);
    const legacyZipPath = path.join(BACKUP_DIR, `${base}_fotos.zip`);
    const pdfPath = path.join(werfDir, `${base}.pdf`);
    const zipPath = path.join(werfDir, `${base}_fotos.zip`);

    let deedIets = false;

    if (!fs.existsSync(pdfPath)) {
      fs.mkdirSync(werfDir, { recursive: true });
      if (fs.existsSync(legacyPdfPath)) {
        fs.renameSync(legacyPdfPath, pdfPath);
        pdfsVerplaatst++;
      } else {
        const { data: reactiesRaw, error: reactiesError } = await supabase
          .from('werfrapport_reacties')
          .select('tekst, created_at, profiles(full_name)')
          .eq('rapport_id', rapport.id)
          .order('created_at', { ascending: true });
        if (reactiesError) throw reactiesError;
        const reacties = (reactiesRaw ?? []).map((r) => ({
          tekst: r.tekst,
          created_at: r.created_at,
          auteurNaam: r.profiles?.full_name ?? 'Onbekend',
        }));

        await writePdf(pdfPath, rapport, werf, auteurNaam, reacties);
        pdfsGemaakt++;
      }
      deedIets = true;
    }

    if (!fs.existsSync(zipPath)) {
      if (fs.existsSync(legacyZipPath)) {
        fs.mkdirSync(werfDir, { recursive: true });
        fs.renameSync(legacyZipPath, zipPath);
        zipsVerplaatst++;
        deedIets = true;
      } else {
        const { data: fotos, error: fotoError } = await supabase
          .from('werfrapport_fotos')
          .select('storage_path, label')
          .eq('rapport_id', rapport.id);
        if (fotoError) throw fotoError;

        if (fotos && fotos.length > 0) {
          fs.mkdirSync(werfDir, { recursive: true });
          await writeFotosZip(zipPath, fotos);
          zipsGemaakt++;
          deedIets = true;
        }
      }
    }

    if (!deedIets) overgeslagen++;
  }

  console.log(
    `Klaar — ${pdfsGemaakt} nieuwe pdf('s), ${zipsGemaakt} nieuwe foto-zip(s), ${pdfsVerplaatst + zipsVerplaatst} bestand(en) verplaatst naar hun werfmap, ${overgeslagen} rapporten waren al volledig gebackupt.`
  );
}

main().catch((err) => {
  console.error('Backup mislukt:', err);
  process.exitCode = 1;
});
