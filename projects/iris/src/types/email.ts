export type EmailImportance = "Low" | "Normal" | "High" | string;

export interface Email {
  message_id: string;
  subject: string;
  sender: string;
  received_time: string | null;
  body_text: string;
  has_attachments: boolean;
  importance: EmailImportance;
  in_reply_to?: string | null;
  references?: string[];
  to_recipients?: string[];
}
