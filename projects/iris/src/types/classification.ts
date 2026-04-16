export const ClassificationType = {
  RICHIESTA_INTERVENTO: "RICHIESTA_INTERVENTO",
  GUASTO_URGENTE: "GUASTO_URGENTE",
  PREVENTIVO: "PREVENTIVO",
  CONFERMA_APPUNTAMENTO: "CONFERMA_APPUNTAMENTO",
  FATTURA_FORNITORE: "FATTURA_FORNITORE",
  COMUNICAZIONE_INTERNA: "COMUNICAZIONE_INTERNA",
  PEC_UFFICIALE: "PEC_UFFICIALE",
  AMMINISTRATORE_CONDOMINIO: "AMMINISTRATORE_CONDOMINIO",
  RISPOSTA_CLIENTE: "RISPOSTA_CLIENTE",
  NEWSLETTER_SPAM: "NEWSLETTER_SPAM",
  ALTRO: "ALTRO",
} as const;

export type ClassificationType =
  (typeof ClassificationType)[keyof typeof ClassificationType];

export const SuggestedAction = {
  RISPONDI: "RISPONDI",
  APRI_INTERVENTO: "APRI_INTERVENTO",
  INOLTRA: "INOLTRA",
  ARCHIVIA: "ARCHIVIA",
  PREPARA_PREVENTIVO: "PREPARA_PREVENTIVO",
  VERIFICA_PAGAMENTO: "VERIFICA_PAGAMENTO",
  URGENTE_CHIAMA: "URGENTE_CHIAMA",
} as const;

export type SuggestedAction =
  (typeof SuggestedAction)[keyof typeof SuggestedAction];

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ExtractedEntities {
  cliente?: string;
  condominio?: string;
  impianto?: string;
  urgenza?: string;
  importo?: string;
  tecnico?: string;
  indirizzo?: string;
}

export interface EmailClassification {
  category: ClassificationType;
  summary: string;
  entities: ExtractedEntities;
  suggestedAction: SuggestedAction;
  confidence: ConfidenceLevel;
  reasoning: string;
}

export const CLASSIFICATION_TYPES: readonly ClassificationType[] =
  Object.values(ClassificationType);

export const SUGGESTED_ACTIONS: readonly SuggestedAction[] =
  Object.values(SuggestedAction);
