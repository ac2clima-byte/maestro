import type {
  ClassificationType,
  EmailClassification,
  SuggestedAction,
} from "./classification.js";

export type IrisEmailStatus = "classified" | "corrected" | "archived";

export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
}

export interface IrisEmailRaw {
  subject: string;
  sender: string;
  body_text: string;
  received_time: string | null;
  has_attachments: boolean;
  importance: string;
}

export interface IrisEmailCorrection {
  category: ClassificationType;
  suggestedAction: SuggestedAction;
  notes: string;
  correctedAt: FirestoreTimestamp;
}

export interface IrisEmailDoc {
  id: string;
  userId: string;
  raw: IrisEmailRaw;
  classification: EmailClassification;
  status: IrisEmailStatus;
  correction?: IrisEmailCorrection;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface IrisCorrectionDoc {
  id: string;
  userId: string;
  emailId: string;
  originalCategory: ClassificationType;
  correctedCategory: ClassificationType;
  originalAction: SuggestedAction;
  correctedAction: SuggestedAction;
  notes: string;
  createdAt: FirestoreTimestamp;
}

export const IRIS_COLLECTIONS = {
  emails: "iris_emails",
  corrections: "iris_corrections",
} as const;
