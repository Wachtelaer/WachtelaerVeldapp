import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { WACHTELAER_LOGO_DATA_URI } from '@/lib/generated/wachtelaerLogo';

const KLEUR_DONKER = '#393536';
const KLEUR_ACCENT = '#f9ad0b';
const KLEUR_GRIJS = '#6a6768';

const BEDRIJF_REGEL =
  'Wachtelaer BVBA&nbsp;&nbsp;|&nbsp;&nbsp;Désiré De Bodtkaai 25, 9400 Ninove&nbsp;&nbsp;|&nbsp;&nbsp;T 054 33 25 19&nbsp;&nbsp;|&nbsp;&nbsp;info@geert-wachtelaer.be&nbsp;&nbsp;|&nbsp;&nbsp;www.geert-wachtelaer.be&nbsp;&nbsp;|&nbsp;&nbsp;BTW BE0464608125';

function bouwHtml(titel: string, ondertitel: string | undefined, lichaamHtml: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: ${KLEUR_DONKER}; margin: 0; padding: 28px 32px; }
  .header {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2.5px solid ${KLEUR_ACCENT}; padding-bottom: 10px; margin-bottom: 18px;
  }
  .header img { width: 140px; }
  .header-titel { text-align: right; }
  .header-titel h1 { font-size: 15px; text-transform: uppercase; margin: 0; color: ${KLEUR_DONKER}; }
  .header-titel p { font-size: 10px; color: ${KLEUR_GRIJS}; margin: 4px 0 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th {
    text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.4px;
    color: ${KLEUR_GRIJS}; border-bottom: 1px solid #ccc; padding: 5px 6px;
  }
  td { padding: 5px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  .tag { display: inline-block; padding: 2px 7px; font-size: 8px; text-transform: uppercase; letter-spacing: 0.4px; border: 1px solid #ccc; border-radius: 2px; }
  .tag-bestellen { background: ${KLEUR_ACCENT}; border-color: ${KLEUR_ACCENT}; color: #fff; }
  .negatief { color: #b3261e; }
  .sectie-titel { font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: ${KLEUR_GRIJS}; margin: 20px 0 6px; }
  .offertes { font-size: 8.5px; color: ${KLEUR_GRIJS}; margin-top: 2px; }
  .footer { border-top: 0.75px solid ${KLEUR_ACCENT}; padding-top: 8px; margin-top: 24px; font-size: 7.5px; color: ${KLEUR_GRIJS}; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <img src="${WACHTELAER_LOGO_DATA_URI}" />
    <div class="header-titel">
      <h1>${titel}</h1>
      ${ondertitel ? `<p>${ondertitel}</p>` : ''}
    </div>
  </div>
  ${lichaamHtml}
  <div class="footer">${BEDRIJF_REGEL}</div>
</body>
</html>`;
}

/** Rendert huisstijl-HTML naar PDF en biedt die aan om te downloaden/delen —
 *  op native (iOS/Android) via een bestand + het deelvenster, op web via de
 *  browser-printdialoog (met "Opslaan als PDF"), aangezien daar geen bestand
 *  rechtstreeks kan worden weggeschreven. */
export async function exporteerAlsPdf(opts: { titel: string; ondertitel?: string; lichaamHtml: string }): Promise<void> {
  const html = bouwHtml(opts.titel, opts.ondertitel, opts.lichaamHtml);

  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html });
  const kanDelen = await Sharing.isAvailableAsync();
  if (kanDelen) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
}
