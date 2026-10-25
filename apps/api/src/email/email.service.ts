import { Injectable, Inject, Logger } from '@nestjs/common';
import { EMAIL_PROVIDER, type EmailProvider, type EmailResult, type EmailPayload } from './email.interfaces.js';

export interface SendInvitationEmailOptions {
  to: string;
  recipientName: string;
  organizationName: string;
  rawToken: string;
  expiresInHours?: number;
}

export interface SendVerificationEmailOptions {
  to: string;
  recipientName: string;
  rawToken: string;
  expiresInHours?: number;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
  ) {}

  /**
   * Sends an invitation email to a newly recruited organization member.
   * Note: The raw token is included only in the generated delivery payload sent to the provider.
   * It is NEVER logged in internal application logs.
   */
  async sendInvitationEmail(options: SendInvitationEmailOptions): Promise<EmailResult> {
    const { to, recipientName, organizationName, rawToken, expiresInHours = 48 } = options;
    const normalizedEmail = to.trim().toLowerCase();

    const subject = `Invitation to join ${organizationName} on VERTEX Logistics`;
    const textContent =
      `Hello ${recipientName},\n\n` +
      `You have been invited to join ${organizationName} on the VERTEX Logistics & Transport platform.\n` +
      `To accept this invitation and activate your account, please complete your verification using the token below:\n\n` +
      `Verification Token: ${rawToken}\n\n` +
      `This invitation link/token is valid for ${expiresInHours} hours and can only be consumed once.\n\n` +
      `VERTEX Logistics Team`;

    const payload: EmailPayload = {
      to: normalizedEmail,
      recipientName,
      organizationName,
      subject,
      text: textContent,
      metadata: {
        type: 'ORGANIZATION_INVITATION',
        expiresInHours,
      },
    };

    try {
      const result = await this.provider.sendEmail(payload);
      this.logger.log(`Invitation email dispatched for recipient=${normalizedEmail}, org="${organizationName}"`);
      return result;
    } catch (err: any) {
      this.logger.error(`Failed to dispatch invitation email to ${normalizedEmail}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Sends an account verification email for an unverified user.
   */
  async sendVerificationEmail(options: SendVerificationEmailOptions): Promise<EmailResult> {
    const { to, recipientName, rawToken, expiresInHours = 24 } = options;
    const normalizedEmail = to.trim().toLowerCase();

    const subject = 'Verify your email address on VERTEX Logistics';
    const textContent =
      `Hello ${recipientName},\n\n` +
      `Please verify your email address to complete your VERTEX Logistics account setup.\n` +
      `Use the verification token below to activate your account:\n\n` +
      `Verification Token: ${rawToken}\n\n` +
      `This token expires in ${expiresInHours} hours and can only be used once.\n\n` +
      `VERTEX Logistics Team`;

    const payload: EmailPayload = {
      to: normalizedEmail,
      recipientName,
      subject,
      text: textContent,
      metadata: {
        type: 'EMAIL_VERIFICATION',
        expiresInHours,
      },
    };

    try {
      const result = await this.provider.sendEmail(payload);
      this.logger.log(`Verification email dispatched for recipient=${normalizedEmail}`);
      return result;
    } catch (err: any) {
      this.logger.error(`Failed to dispatch verification email to ${normalizedEmail}: ${err.message}`);
      throw err;
    }
  }

  getSentEmails(): EmailPayload[] {
    return this.provider.getSentEmails ? this.provider.getSentEmails() : [];
  }

  getLastSentEmail(): EmailPayload | undefined {
    return this.provider.getLastSentEmail ? this.provider.getLastSentEmail() : undefined;
  }

  clearSentEmails(): void {
    if (this.provider.clearSentEmails) {
      this.provider.clearSentEmails();
    }
  }

  setSimulateFailure(simulate: boolean): void {
    if (this.provider.setSimulateFailure) {
      this.provider.setSimulateFailure(simulate);
    }
  }
}
