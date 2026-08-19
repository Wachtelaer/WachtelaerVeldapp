// Hand-written to match supabase/migrations/0001_werfrapporten.sql.
// Regenerate with `supabase gen types typescript` once the schema grows.

export type Role = 'tech' | 'werfleider' | 'sales' | 'mgmt';
export type Weer = 'Droog' | 'Regen' | 'Hitte';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  verlof_dagen: number;
  inhaalrust_dagen: number;
  is_magazijnier: boolean;
  created_at: string;
}

export interface Werf {
  id: string;
  code: string;
  naam: string;
  adres: string;
  fase: string;
  is_algemeen: boolean;
  created_at: string;
}

export interface WerfMember {
  werf_id: string;
  profile_id: string;
  is_leider: boolean;
}

export interface Werfrapport {
  id: string;
  werf_id: string;
  auteur_id: string;
  datum: string;
  weer: Weer;
  aanwezig_eigen: number;
  aanwezig_onderaanneming: number;
  uitgevoerd: string;
  knelpunt: string;
  deel_mgmt: boolean;
  deel_werf: boolean;
  deel_klant: boolean;
  created_at: string;
}

export interface WerfrapportFoto {
  id: string;
  rapport_id: string;
  storage_path: string;
  label: string;
  created_at: string;
}

export interface WerfrapportReactie {
  id: string;
  rapport_id: string;
  auteur_id: string;
  tekst: string;
  created_at: string;
}

export interface WerfChatBericht {
  id: string;
  werf_id: string;
  auteur_id: string;
  tekst: string;
  foto_storage_path: string | null;
  created_at: string;
}

export interface WerfChatRead {
  werf_id: string;
  profile_id: string;
  last_read_at: string;
}

export interface Opmeting {
  id: string;
  verkoper_id: string;
  module: string;
  klant_naam: string;
  klant_adres: string;
  klant_tel: string;
  antwoorden: Record<string, unknown>;
  nota: string;
  status: string;
  created_at: string;
}

export interface OpmetingFoto {
  id: string;
  opmeting_id: string;
  storage_path: string;
  label: string;
  created_at: string;
}

export type VerlofType = 'Verlof' | 'Inhaalrust' | 'Ziekte';
export type VerlofStatus = 'wacht' | 'goed' | 'nee';

export interface Verlofaanvraag {
  id: string;
  aanvrager_id: string;
  type: VerlofType;
  van: string;
  tot: string;
  nota: string;
  status: VerlofStatus;
  behandeld_door: string | null;
  behandeld_op: string | null;
  created_at: string;
}

export interface PlanDocument {
  id: string;
  werf_id: string;
  titel: string;
  created_at: string;
}

export interface PlanVersie {
  id: string;
  document_id: string;
  versie_nummer: number;
  storage_path: string;
  bestandsnaam: string;
  geupload_door: string;
  created_at: string;
}

export interface PlanRead {
  werf_id: string;
  profile_id: string;
  last_read_at: string;
}

export interface MagazijnMelding {
  id: string;
  melder_id: string;
  werf_id: string | null;
  tekst: string;
  hoeveelheid: number | null;
  eenheid: string;
  verwerkt: boolean;
  verwerkt_door: string | null;
  verwerkt_op: string | null;
  created_at: string;
}

export interface MagazijnMeldingFoto {
  id: string;
  melding_id: string;
  storage_path: string;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & Pick<Profile, 'id' | 'full_name' | 'role'>; Update: Partial<Profile> };
      werven: { Row: Werf; Insert: Partial<Werf> & Pick<Werf, 'code' | 'naam' | 'adres'>; Update: Partial<Werf> };
      werf_members: { Row: WerfMember; Insert: WerfMember; Update: Partial<WerfMember> };
      werfrapporten: {
        Row: Werfrapport;
        Insert: Partial<Werfrapport> & Pick<Werfrapport, 'werf_id' | 'auteur_id' | 'weer'>;
        Update: Partial<Werfrapport>;
      };
      werfrapport_fotos: {
        Row: WerfrapportFoto;
        Insert: Partial<WerfrapportFoto> & Pick<WerfrapportFoto, 'rapport_id' | 'storage_path'>;
        Update: Partial<WerfrapportFoto>;
      };
      werfrapport_reacties: {
        Row: WerfrapportReactie;
        Insert: Partial<WerfrapportReactie> & Pick<WerfrapportReactie, 'rapport_id' | 'auteur_id' | 'tekst'>;
        Update: Partial<WerfrapportReactie>;
      };
      werf_chat_berichten: {
        Row: WerfChatBericht;
        Insert: Partial<WerfChatBericht> & Pick<WerfChatBericht, 'werf_id' | 'auteur_id'>;
        Update: Partial<WerfChatBericht>;
      };
      werf_chat_reads: { Row: WerfChatRead; Insert: WerfChatRead; Update: Partial<WerfChatRead> };
      opmetingen: {
        Row: Opmeting;
        Insert: Partial<Opmeting> & Pick<Opmeting, 'verkoper_id' | 'module'>;
        Update: Partial<Opmeting>;
      };
      opmeting_fotos: {
        Row: OpmetingFoto;
        Insert: Partial<OpmetingFoto> & Pick<OpmetingFoto, 'opmeting_id' | 'storage_path'>;
        Update: Partial<OpmetingFoto>;
      };
      verlofaanvragen: {
        Row: Verlofaanvraag;
        Insert: Partial<Verlofaanvraag> & Pick<Verlofaanvraag, 'aanvrager_id' | 'type' | 'van' | 'tot'>;
        Update: Partial<Verlofaanvraag>;
      };
      plan_documenten: {
        Row: PlanDocument;
        Insert: Partial<PlanDocument> & Pick<PlanDocument, 'werf_id' | 'titel'>;
        Update: Partial<PlanDocument>;
      };
      plan_versies: {
        Row: PlanVersie;
        Insert: Partial<PlanVersie> & Pick<PlanVersie, 'document_id' | 'versie_nummer' | 'storage_path' | 'bestandsnaam' | 'geupload_door'>;
        Update: Partial<PlanVersie>;
      };
      plan_reads: { Row: PlanRead; Insert: PlanRead; Update: Partial<PlanRead> };
      magazijn_meldingen: {
        Row: MagazijnMelding;
        Insert: Partial<MagazijnMelding> & Pick<MagazijnMelding, 'melder_id'>;
        Update: Partial<MagazijnMelding>;
      };
      magazijn_meldingen_fotos: {
        Row: MagazijnMeldingFoto;
        Insert: Partial<MagazijnMeldingFoto> & Pick<MagazijnMeldingFoto, 'melding_id' | 'storage_path'>;
        Update: Partial<MagazijnMeldingFoto>;
      };
    };
  };
}
