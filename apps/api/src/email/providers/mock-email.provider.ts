import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';
import type { EmailProvider, EmailPayload, EmailResult } from '../email.interfaces.js';

/**
 * Deterministic Mock Email Provider for testing and local development.
 * Never connects to external networks or claims that real emails were delivered.
 * Enforces zero-leakage logging (tokens/secrets are never printed).
 */
@Injectable()
export class MockEmailProvider implements EmailProvider {
  private readonly logger = new Logger(MockEmailProvider.name);
  private sentEmails: EmailPayload[] = [];
  private simulateFailure = false;

  async sendEmail(payload: EmailPayload): Promise<EmailResult> {
    if (this.simulateFailure) {
      this.logger.warn(`Simulated provider outage triggered for recipient ${payload.to}`);
      throw new Error('Simulated transactional email provider delivery failure.');
    }

    const messageId = `mock-msg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    this.sentEmails.push({ ...payload });

    // Zero-token leakage: Log only metadata, never the email body or verification tokens
    this.logger.log(
      `[MOCK_EMAIL_DISPATCH] Deterministic mock email queued: recipient="${payload.to}", ` +
      `subject="${payload.subject}", messageId="${messageId}". Real email delivery is disabled in this environment.`,
    );

    return {
      success: true,
      messageId,
      provider: 'mock-deterministic',
      timestamp: new Date(),
    };
  }

  getSentEmails(): EmailPayload[] {
    return [...this.sentEmails];
  }

  getLastSentEmail(): EmailPayload | undefined {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  clearSentEmails(): void {
    this.sentEmails = [];
  }

  setSimulateFailure(simulate: boolean): void {
    this.simulateFailure = simulate;
  }
}
