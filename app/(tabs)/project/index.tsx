import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { KpiTile, SectionLabel, Tag } from '@/components/ui/Basics';
import { Button } from '@/components/ui/Button';
import { FieldLabel, TextArea } from '@/components/ui/Form';
import { useAuth } from '@/context/AuthProvider';
import { listDossiers, type Dossier } from '@/lib/api/outsmartPipeline';
import { listOpmetingen, type OpmetingListItem } from '@/lib/api/opmetingen';
import { listWervenWithSummary, type WerfListItem } from '@/lib/api/werven';
import { vraagAgentAdvies, type AgentAdvies } from '@/lib/api/outsmartAgent';
import { maakOfferteAan, type NieuweOfferte } from '@/lib/api/outsmartOfferte';
import { syncPrijsreferentie } from '@/lib/api/outsmartSync';
import { lijktOpzelfde } from '@/lib/dossierMatching';
import { berekenNacalculatie, voorgesteldeActie } from '@/lib/dossierSuggesties';
import { colors, fonts } from '@/lib/theme';

function formatBedrag(bedrag: string | undefined): string {
  const n = Number(bedrag);
  if (!bedrag || Number.isNaN(n)) return '—';
  return n.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function formatDatum(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Uitvoering gepland binnen de eerstkomende 2 weken — dan moet er nu
 *  besteld worden. */
function binnenTweeWeken(periodeStart: string | null): boolean {
  if (!periodeStart) return false;
  const start = new Date(periodeStart).getTime();
  const nu = Date.now();
  return start >= nu && start <= nu + 14 * 24 * 60 * 60 * 1000;
}

function MaterialenCard({ dossier }: { dossier: Dossier }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitel} numberOfLines={1}>
          {dossier.klantNaam || dossier.naam || '(naam ontbreekt)'}
        </Text>
        <Tag label={`start ${formatDatum(dossier.periodeStart)}`} tone="accent" />
      </View>
      {dossier.materialen.map((m, i) => (
        <View key={`${m.code}-${i}`} style={styles.materiaalRow}>
          <Text style={styles.materiaalOmschrijving} numberOfLines={2}>
            {m.omschrijving}
          </Text>
          <Text style={styles.materiaalAantal}>
            {m.aantal} {m.eenheid}
          </Text>
        </View>
      ))}
    </View>
  );
}

function NieuweOfferteForm({ dossier }: { dossier: Dossier }) {
  const [omschrijving, setOmschrijving] = useState('');
  const [bezig, setBezig] = useState(false);
  const [resultaat, setResultaat] = useState<NieuweOfferte | null>(null);
  const [toelichting, setToelichting] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  if (!dossier.debtorNr) return null;

  const aanmaken = async () => {
    if (!omschrijving.trim()) return;
    setBezig(true);
    setFout(null);
    try {
      const { offerte, toelichting: t } = await maakOfferteAan({
        debtorNr: dossier.debtorNr!,
        klantNaam: dossier.klantNaam ?? dossier.naam,
        omschrijving: omschrijving.trim(),
      });
      setResultaat(offerte);
      setToelichting(t);
      setOmschrijving('');
    } catch (e: any) {
      setFout(e.message ?? 'Offerte aanmaken mislukt');
    } finally {
      setBezig(false);
    }
  };

  return (
    <View style={styles.nieuweOfferte}>
      <FieldLabel>Extra werk — agent maakt meteen een offerte aan in Outsmart</FieldLabel>
      <TextArea
        value={omschrijving}
        onChangeText={setOmschrijving}
        placeholder="Bv. Extra wasbak plaatsen in badkamer boven"
        numberOfLines={2}
      />
      <Button
        label={bezig ? 'Agent maakt offerte aan…' : 'Automatisch offerte aanmaken'}
        variant="secondary"
        onPress={aanmaken}
        loading={bezig}
        disabled={!omschrijving.trim()}
      />
      {fout ? <Text style={styles.error}>{fout}</Text> : null}
      {resultaat ? (
        <View style={styles.nieuweOfferteResultaat}>
          <Text style={styles.agentAdviesText}>
            Offerte {resultaat.nummer} aangemaakt ({resultaat.status}) — {formatBedrag(resultaat.bedrag)}, marge{' '}
            {formatBedrag(String(resultaat.margeEuro))}
            {resultaat.margePercent !== null ? ` (${resultaat.margePercent.toFixed(0)}%)` : ''}.
          </Text>
          {toelichting ? <Text style={styles.aandachtspuntText}>{toelichting}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function DossierCard({
  dossier,
  opmeting,
  werf,
  agentAdvies,
}: {
  dossier: Dossier;
  opmeting: OpmetingListItem | null;
  werf: WerfListItem | null;
  agentAdvies: AgentAdvies | null;
}) {
  const laatsteOfferte = dossier.offertes[0];
  const facturatieTotaal = dossier.facturen.reduce((sum, f) => sum + (Number(f.bedrag) || 0), 0);
  const isGefactureerd = dossier.facturen.length > 0;
  const suggestie = voorgesteldeActie(dossier, opmeting, werf);
  const nacalculatie = berekenNacalculatie(dossier);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitel} numberOfLines={1}>
          {dossier.klantNaam || dossier.naam || '(naam ontbreekt)'}
        </Text>
        {dossier.fase ? <Tag label={dossier.fase} tone="accent" /> : null}
      </View>
      {dossier.adres ? <Text style={styles.cardAdres}>{dossier.adres}</Text> : null}

      <View style={[styles.suggestie, suggestie.tone === 'actie' && styles.suggestieActie]}>
        <Text style={[styles.suggestieText, suggestie.tone === 'actie' && styles.suggestieTextActie]}>
          {suggestie.tekst}
        </Text>
      </View>

      {agentAdvies ? (
        <View style={styles.agentAdvies}>
          <View style={styles.agentAdviesTop}>
            <Text style={styles.agentLabel}>AI-advies</Text>
            <Tag
              label={agentAdvies.prioriteit}
              tone={agentAdvies.prioriteit === 'hoog' ? 'accent' : 'neutral'}
            />
          </View>
          <Text style={styles.agentAdviesText}>{agentAdvies.advies}</Text>
        </View>
      ) : null}

      <View style={styles.stappenRow}>
        <View style={styles.stap}>
          <Text style={styles.stapLabel}>Offerte</Text>
          <Text style={styles.stapWaarde}>{laatsteOfferte ? formatBedrag(laatsteOfferte.bedrag) : '—'}</Text>
          <Text style={styles.stapSub}>{laatsteOfferte ? formatDatum(laatsteOfferte.datumAanvaard) : 'geen offerte'}</Text>
        </View>
        <View style={styles.stap}>
          <Text style={styles.stapLabel}>Marge</Text>
          <Text style={[styles.stapWaarde, dossier.margeEuro < 0 && styles.stapWaardeNegatief]}>
            {formatBedrag(String(dossier.margeEuro))}
          </Text>
          <Text style={styles.stapSub}>{dossier.margePercent !== null ? `${dossier.margePercent.toFixed(0)}%` : '—'}</Text>
        </View>
        <View style={styles.stap}>
          <Text style={styles.stapLabel}>Opmeting</Text>
          <Text style={styles.stapWaarde}>{opmeting ? opmeting.module : '—'}</Text>
          <Text style={styles.stapSub}>{opmeting ? formatDatum(opmeting.created_at) : 'geen match in app'}</Text>
        </View>
      </View>

      <View style={styles.stappenRow}>
        <View style={styles.stap}>
          <Text style={styles.stapLabel}>Werf</Text>
          <Text style={styles.stapWaarde}>{dossier.fase || '—'}</Text>
          <Text style={styles.stapSub}>
            {dossier.periodeStart ? `${formatDatum(dossier.periodeStart)} – ${formatDatum(dossier.periodeEind)}` : '—'}
          </Text>
        </View>
        <View style={styles.stap}>
          <Text style={styles.stapLabel}>Rapporten (werf)</Text>
          <Text style={styles.stapWaarde}>{werf ? `${werf.rapportCount}` : '—'}</Text>
          <Text style={styles.stapSub}>
            {werf?.laatsteRapport ? formatDatum(werf.laatsteRapport.datum) : werf ? 'nog geen rapport' : 'geen match in app'}
          </Text>
        </View>
        <View style={styles.stap}>
          <Text style={styles.stapLabel}>Facturatie</Text>
          <Text style={styles.stapWaarde}>{isGefactureerd ? formatBedrag(String(facturatieTotaal)) : '—'}</Text>
          <Text style={styles.stapSub}>
            {isGefactureerd ? `${dossier.facturen.length} factu(u)r(en)` : 'nog niet gefactureerd'}
          </Text>
        </View>
      </View>

      <View style={styles.stappenRow}>
        <View style={styles.stap}>
          <Text style={styles.stapLabel}>Nacalculatie</Text>
          <Text style={[styles.stapWaarde, nacalculatie && nacalculatie.verschil < 0 && styles.stapWaardeNegatief]}>
            {nacalculatie ? formatBedrag(String(nacalculatie.verschil)) : '—'}
          </Text>
          <Text style={styles.stapSub}>{nacalculatie ? 'verschil fact. t.o.v. offerte' : 'nog niet gefactureerd'}</Text>
        </View>
      </View>

      <NieuweOfferteForm dossier={dossier} />
    </View>
  );
}

export default function ProjectScreen() {
  const { profile } = useAuth();
  const [dossiers, setDossiers] = useState<Dossier[] | null>(null);
  const [opmetingen, setOpmetingen] = useState<OpmetingListItem[]>([]);
  const [werven, setWerven] = useState<WerfListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [agentAdviezen, setAgentAdviezen] = useState<Map<string, AgentAdvies>>(new Map());
  const [agentAandachtspunten, setAgentAandachtspunten] = useState<string[]>([]);
  const [agentBezig, setAgentBezig] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  const [syncBezig, setSyncBezig] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResultaat, setSyncResultaat] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setError(null);
      const [d, o, w] = await Promise.all([
        listDossiers(),
        listOpmetingen(),
        listWervenWithSummary(profile.id),
      ]);
      setDossiers(d);
      setOpmetingen(o);
      setWerven(w);
    } catch (e: any) {
      setError(e.message ?? 'Kon dossiers niet laden');
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const vraagAdvies = async () => {
    if (!dossiers || dossiers.length === 0) return;
    setAgentBezig(true);
    setAgentError(null);
    try {
      const { adviezen, aandachtspunten } = await vraagAgentAdvies(dossiers);
      setAgentAdviezen(new Map(adviezen.map((a) => [a.id, a])));
      setAgentAandachtspunten(aandachtspunten);
    } catch (e: any) {
      setAgentError(e.message ?? 'Kon geen AI-advies ophalen');
    } finally {
      setAgentBezig(false);
    }
  };

  const syncLeerdata = async () => {
    setSyncBezig(true);
    setSyncError(null);
    setSyncResultaat(null);
    try {
      const { totaalOffertesVerwerkt, uniekeArtikelen } = await syncPrijsreferentie();
      setSyncResultaat(`${totaalOffertesVerwerkt} offertes verwerkt → ${uniekeArtikelen} unieke artikelen/diensten`);
    } catch (e: any) {
      setSyncError(e.message ?? 'Synchronisatie mislukt');
    } finally {
      setSyncBezig(false);
    }
  };

  const gefactureerd = (dossiers ?? []).filter((d) => d.facturen.length > 0).length;
  const teBestellen = (dossiers ?? []).filter((d) => binnenTweeWeken(d.periodeStart) && d.materialen.length > 0);

  return (
    <View style={styles.root}>
      <AppHeader kicker="Project · enkel zichtbaar voor jou" />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View>
          <Text style={styles.title}>Pipeline</Text>
          <Text style={styles.subtitle}>
            Outsmart (offerte, marge, werf-fase, materialen, facturatie) gekoppeld aan onze eigen app (opmeting,
            werfrapporten) op naam — een losse gok, geen harde koppeling, dus controleer een match altijd.
            Toont offertes met status aanvaard én uitgevoerd. Geografische afspraak-planning voor leads volgt —
            vereist een echte agenda-koppeling.
          </Text>
        </View>

        <Button label="Nieuw klantenbezoek" onPress={() => router.push('/project/bezoek')} />

        <Button
          label={syncBezig ? 'Leerdata synchroniseren…' : 'Synchroniseer leerdata (alle offertes)'}
          variant="secondary"
          onPress={syncLeerdata}
          loading={syncBezig}
        />
        {syncError ? <Text style={styles.error}>{syncError}</Text> : null}
        {syncResultaat ? <Text style={styles.aandachtspuntText}>{syncResultaat}</Text> : null}

        {dossiers ? (
          <View style={styles.kpiRow}>
            <KpiTile value={String(dossiers.length)} label="actieve dossiers" />
            <KpiTile value={String(gefactureerd)} label="gefactureerd" />
            <KpiTile value={String(dossiers.length - gefactureerd)} label="nog te factureren" />
          </View>
        ) : null}

        {dossiers && dossiers.length > 0 ? (
          <Button label={agentBezig ? 'Agent denkt na…' : 'Vraag AI-advies'} onPress={vraagAdvies} loading={agentBezig} />
        ) : null}
        {agentError ? <Text style={styles.error}>{agentError}</Text> : null}
        {agentAandachtspunten.length > 0 ? (
          <View style={styles.aandachtspunten}>
            <Text style={styles.agentLabel}>Aandachtspunten (AI)</Text>
            {agentAandachtspunten.map((a, i) => (
              <Text key={i} style={styles.aandachtspuntText}>{`• ${a}`}</Text>
            ))}
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {dossiers === null && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}
        {dossiers?.length === 0 ? <Text style={styles.empty}>Geen actieve dossiers gevonden in Outsmart.</Text> : null}

        {teBestellen.length > 0 ? (
          <View>
            <SectionLabel>Bestellingen — uitvoering binnen 2 weken</SectionLabel>
            {teBestellen.map((d) => (
              <MaterialenCard key={d.id} dossier={d} />
            ))}
          </View>
        ) : null}

        {dossiers && dossiers.length > 0 ? (
          <View>
            <SectionLabel>Dossiers</SectionLabel>
            {dossiers.map((d) => {
              const namen = [d.klantNaam, d.naam].filter((n): n is string => !!n);
              const matchOpmeting =
                opmetingen.find((o) => namen.some((n) => lijktOpzelfde(n, o.klant_naam))) ?? null;
              const matchWerf = werven.find((w) => namen.some((n) => lijktOpzelfde(n, w.naam))) ?? null;
              return (
                <DossierCard
                  key={d.id}
                  dossier={d}
                  opmeting={matchOpmeting}
                  werf={matchWerf}
                  agentAdvies={agentAdviezen.get(d.id) ?? null}
                />
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, gap: 16, paddingBottom: 40 },
  title: { fontFamily: fonts.heading, fontSize: 24, textTransform: 'uppercase', color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 5, lineHeight: 19 },
  error: { fontFamily: fonts.body, color: colors.danger },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, marginTop: 12 },
  kpiRow: { flexDirection: 'row', gap: 1, backgroundColor: colors.divider, borderWidth: 1, borderColor: colors.divider },
  card: { borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.white, padding: 12, gap: 10, marginBottom: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  cardTitel: { fontFamily: fonts.heading, fontSize: 16, textTransform: 'uppercase', color: colors.ink, flexShrink: 1 },
  cardAdres: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted, marginTop: -4 },
  stappenRow: { flexDirection: 'row', gap: 8 },
  stap: { flex: 1, gap: 2 },
  stapLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 9.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.inkMuted,
  },
  stapWaarde: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  stapSub: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkMuted },
  stapWaardeNegatief: { color: colors.danger },
  suggestie: {
    backgroundColor: colors.accentTint,
    borderWidth: 1,
    borderColor: colors.accentPale,
    paddingVertical: 7,
    paddingHorizontal: 9,
  },
  suggestieActie: { backgroundColor: '#fbeaea', borderColor: colors.danger },
  suggestieText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.accentDarker, lineHeight: 16 },
  suggestieTextActie: { color: colors.danger },
  materiaalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 6,
  },
  materiaalOmschrijving: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: colors.ink },
  materiaalAantal: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.accentDark },
  agentAdvies: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.accentPale,
    borderStyle: 'dashed',
    paddingVertical: 7,
    paddingHorizontal: 9,
    gap: 3,
  },
  agentAdviesTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  agentLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 9.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.accentDark,
  },
  agentAdviesText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.ink, lineHeight: 16 },
  aandachtspunten: {
    borderWidth: 1,
    borderColor: colors.dividerStrong,
    backgroundColor: colors.white,
    padding: 10,
    gap: 4,
  },
  aandachtspuntText: { fontFamily: fonts.body, fontSize: 13, color: colors.ink, lineHeight: 18 },
  nieuweOfferte: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 10,
    gap: 8,
  },
  nieuweOfferteResultaat: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.accentPale,
    padding: 9,
    gap: 3,
  },
});
