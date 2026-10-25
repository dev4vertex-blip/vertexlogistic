export interface EmailPayload {
  to: string;
  subject: string;
  recipientName?: string;
  organizationName?: string;
  text?: string;
  html?: string;
  metadata?: Record<string, any>;
}

export interface EmailResult {
  success: boolean;
  messageId: string;
  provider: string;
  timestamp: Date;
}

export interface EmailProvider {
  sendEmail(payload: EmailPayload): Promise<EmailResult>;
  getSentEmails?(): EmailPayload[];
  getLastSentEmail?(): EmailPayload | undefined;
  clearSentEmails?(): void;
  setSimulateFailure?(simulate: boolean): void;
}

export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';
