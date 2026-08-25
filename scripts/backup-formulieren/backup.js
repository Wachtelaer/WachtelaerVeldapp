require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');
const { formNaam, formatAntwoorden } = require('./formTemplates');
const { tekenHeader, sectieTitel, puntenKader, afwerken } = require('./pdfHuisstijl');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_DIR = process.env.BACKUP_DIR;
const FOTOS_BUCKET = 'formulier-fotos';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !BACKUP_DIR) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or BACKUP_DIR — copy .env.example to .env and fill it in.');
  process.exit(1);
}

// Service role key bypasses RLS — intentional, this backup needs to see
// every formulier, not just one user's own.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function slug(text) {
  return (text || 'onbekend')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

function baseFilename(formulier) {
  const datum = formulier.created_at.slice(0, 10);
  const shortId = formulier.id.slice(0, 8);
  return `${datum}_${slug(formulier.formulier)}_${shortId}`;
}

/** One subfolder per klant, so everything for one customer ends up together. */
function klantMapNaam(formulier) {
  return slug(formulier.klant_naam);
}

async function writePdf(pdfPath, formulier, invullerNaam) {
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margins: { top: 50, bottom: 75, left: 50, right: 50 }, bufferPages: true });
    const stream = fs.createWriteStream(pdfPath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.pipe(stream);

    tekenHeader(doc, formNaam(formulier.formulier));

    puntenKader(doc, [
      ['Datum', new Date(formulier.created_at).toLocaleString('nl-BE')],
      ['Ingevuld door', invullerNaam],
    ]);

    sectieTitel(doc, 'Klant');
    puntenKader(doc, [
      ['Naam', formulier.klant_naam || '—'],
      ['Adres', formulier.klant_adres || '—'],
      ['Telefoon/e-mail', formulier.klant_tel || '—'],
    ]);

    sectieTitel(doc, 'Formulier');
    const rows = formatAntwoorden(formulier.formulier, formulier.antwoorden);
    if (rows.length === 0) {
      doc.text('(geen velden ingevuld)');
    } else {
      puntenKader(
        doc,
        rows.map((r) => [r.label, r.waarde])
      );
    }

    sectieTitel(doc, 'Nota');
    doc.text(formulier.nota || '—');

    afwerken(doc);
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

  const { data: formulieren, error } = await supabase
    .from('formulieren')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: true });
  if (error) throw error;

  let pdfsGemaakt = 0;
  let zipsGemaakt = 0;
  let overgeslagen = 0;

  for (const formulier of formulieren ?? []) {
    const base = baseFilename(formulier);
    const klantDir = path.join(BACKUP_DIR, klantMapNaam(formulier));
    const pdfPath = path.join(klantDir, `${base}.pdf`);
    const zipPath = path.join(klantDir, `${base}_fotos.zip`);
    const invullerNaam = formulier.profiles?.full_name ?? 'Onbekend';

    let deedIets = false;

    if (!fs.existsSync(pdfPath)) {
      fs.mkdirSync(klantDir, { recursive: true });
      await writePdf(pdfPath, formulier, invullerNaam);
      pdfsGemaakt++;
      deedIets = true;
    }

    if (!fs.existsSync(zipPath)) {
      const { data: fotos, error: fotoError } = await supabase
        .from('formulier_fotos')
        .select('storage_path, label')
        .eq('formulier_id', formulier.id);
      if (fotoError) throw fotoError;

      if (fotos && fotos.length > 0) {
        fs.mkdirSync(klantDir, { recursive: true });
        await writeFotosZip(zipPath, fotos);
        zipsGemaakt++;
        deedIets = true;
      }
    }

    if (!deedIets) overgeslagen++;
  }

  console.log(
    `Klaar — ${pdfsGemaakt} nieuwe pdf('s), ${zipsGemaakt} nieuwe foto-zip(s), ${overgeslagen} formulieren waren al volledig gebackupt.`
  );
}

main().catch((err) => {
  console.error('Backup mislukt:', err);
  process.exitCode = 1;
});
