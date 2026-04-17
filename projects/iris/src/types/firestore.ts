import type {
  ClassificationType,
  EmailClassification,
  SentimentLevel,
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

export interface IrisEmailFollowup {
  isFollowup: boolean;
  originalEmailId?: string;
  daysWithoutReply?: number;
  needsAttention: boolean;
}

export interface IrisEmailDoc {
  id: string;
  userId: string;
  raw: IrisEmailRaw;
  classification: EmailClassification;
  status: IrisEmailStatus;
  correction?: IrisEmailCorrection;
  followup?: IrisEmailFollowup;
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

export interface IrisThreadDoc {
  id: string;
  userId: string;
  normalizedSubject: string;
  emailIds: string[];
  participants: string[];
  messageCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  sentiment_evolution: SentimentLevel[];
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export const IRIS_COLLECTIONS = {
  emails: "iris_emails",
  corrections: "iris_corrections",
  threads: "iris_threads",
} as const;
