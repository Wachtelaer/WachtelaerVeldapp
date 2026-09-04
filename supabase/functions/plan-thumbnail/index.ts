// Wachtelaer Veldapp — renders a page-1 thumbnail for a newly uploaded plan
// (PDF) so the app can show a real preview instead of a generic icon.
//
// Triggered internally by a database trigger on plan_versies (AFTER
// INSERT), never called directly by the app — hence the shared-secret
// check instead of a user JWT. Uses mupdf (pure WASM, no native
// dependencies) so nothing about the mobile app itself needs to change;
// the client just displays the resulting PNG like any other image.

import { createClient } from 'npm:@supabase/supabase-js@2';
import * as mupdf from 'npm:mupdf';

const BUCKET = 'werf-plannen';
const TARGET_WIDTH_PX = 320;

Deno.serve(async (req) => {
  const secret = Deno.env.get('PLAN_THUMBNAIL_SECRET');
  if (!secret || req.headers.get('x-internal-secret') !== secret) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  let body: { versie_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid body' }, 400);
  }
  if (!body.versie_id) {
    return json({ ok: false, error: 'versie_id required' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: versie, error: versieError } = await admin
    .from('plan_versies')
    .select('id, storage_path, bestandsnaam')
    .eq('id', body.versie_id)
    .single();
  if (versieError || !versie) {
    return json({ ok: false, error: versieError?.message ?? 'Versie niet gevonden' }, 404);
  }

  if (!versie.bestandsnaam.toLowerCase().endsWith('.pdf')) {
    // Nothing to render for non-PDF uploads — leave thumbnail_path null,
    // the app falls back to a generic icon for those.
    return json({ ok: true, skipped: 'not a pdf' });
  }

  try {
    const { data: fileBlob, error: downloadError } = await admin.storage.from(BUCKET).download(versie.storage_path);
    if (downloadError || !fileBlob) throw downloadError ?? new Error('Download mislukt');

    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
    const page = doc.loadPage(0);
    const [x0, y0, x1, y1] = page.getBounds();
    const widthPoints = Math.max(1, x1 - x0);
    const heightPoints = Math.max(1, y1 - y0);
    const scale = Math.min(3, Math.max(0.1, TARGET_WIDTH_PX / widthPoints));

    const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB);
    const png = pixmap.asPNG();
    pixmap.destroy();
    page.destroy();
    doc.destroy();

    const thumbnailPath = `${versie.storage_path}.thumb.png`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(thumbnailPath, png, { contentType: 'image/png', upsert: true });
    if (uploadError) throw uploadError;

    const { error: updateError } = await admin
      .from('plan_versies')
      .update({ thumbnail_path: thumbnailPath })
      .eq('id', versie.id);
    if (updateError) throw updateError;

    return json({ ok: true, thumbnailPath, widthPoints, heightPoints });
  } catch (e) {
    // Best-effort: a failed render just leaves thumbnail_path null, it
    // never blocks or invalidates the actual plan upload.
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
