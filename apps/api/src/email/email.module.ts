import { Module } from '@nestjs/common';
import { EmailService } from './email.service.js';
import { EMAIL_PROVIDER } from './email.interfaces.js';
import { MockEmailProvider } from './providers/mock-email.provider.js';

@Module({
  providers: [
    EmailService,
    {
      provide: EMAIL_PROVIDER,
      useClass: MockEmailProvider,
    },
  ],
  exports: [EmailService, EMAIL_PROVIDER],
})
export class EmailModule {}
